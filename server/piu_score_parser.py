#!/usr/bin/env python3
"""
Parse Pump It Up (Phoenix) result-screen photos into structured JSON.

This parser is designed for phone photos where framing and camera angle vary.
It first tries to detect the screen rectangle, perspective-corrects it, then
extracts fixed UI regions with OCR.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import cv2
import numpy as np
from rapidfuzz import fuzz
from rapidocr_onnxruntime import RapidOCR


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}

# Relative ROIs after perspective correction.
# Format: x0, y0, x1, y1 in [0..1].
ROIS: Dict[str, Tuple[float, float, float, float]] = {
    "title": (0.08, 0.20, 0.70, 0.42),
    "mode_level": (0.36, 0.30, 0.62, 0.52),
    "score": (0.54, 0.30, 0.94, 0.54),
    "stats": (0.16, 0.44, 0.68, 0.82),
}

STAT_LABELS: Dict[str, str] = {
    "perfect": "PERFECT",
    "great": "GREAT",
    "good": "GOOD",
    "bad": "BAD",
    "miss": "MISS",
    "max_combo": "MAX COMBO",
    "kcal": "KCAL",
}

TITLE_STOPWORDS = {
    "SCORE",
    "PERFECT",
    "GREAT",
    "GOOD",
    "BAD",
    "MISS",
    "MAX",
    "COMBO",
    "KCAL",
    "BPM",
    "SINGLE",
    "DOUBLE",
    "EXPERT",
    "LV",
    "GAME",
    "ULTIMATE",
    "MARVELOUS",
    "CREDIT",
    "PASS",
    "AV",
    "BGA",
    "JT",
}

DIGIT_TRANSLATION = str.maketrans(
    {
        "O": "0",
        "Q": "0",
        "D": "0",
        "o": "0",
        "I": "1",
        "l": "1",
        "|": "1",
        "S": "5",
        "s": "5",
        "B": "8",
        "Z": "2",
    }
)


@dataclass
class OCRLine:
    text: str
    confidence: float
    box: np.ndarray  # shape (4, 2), float32

    @property
    def cx(self) -> float:
        return float(np.mean(self.box[:, 0]))

    @property
    def cy(self) -> float:
        return float(np.mean(self.box[:, 1]))

    @property
    def h(self) -> float:
        return float(np.max(self.box[:, 1]) - np.min(self.box[:, 1]))


class OCREngine:
    def __init__(self) -> None:
        self.engine = RapidOCR()

    def run(self, image: np.ndarray) -> List[OCRLine]:
        result, _ = self.engine(image)
        if not result:
            return []
        out: List[OCRLine] = []
        for row in result:
            if len(row) < 3:
                continue
            box, text, confidence = row
            text = (text or "").strip()
            if not text:
                continue
            try:
                conf = float(confidence)
            except (TypeError, ValueError):
                conf = 0.0
            out.append(OCRLine(text=text, confidence=conf, box=np.asarray(box, dtype=np.float32)))
        return out


def order_points(pts: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype=np.float32)
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]  # top-left
    rect[2] = pts[np.argmax(s)]  # bottom-right
    diff = np.diff(pts, axis=1).reshape(-1)
    rect[1] = pts[np.argmin(diff)]  # top-right
    rect[3] = pts[np.argmax(diff)]  # bottom-left
    return rect


def warp_screen(image: np.ndarray, quad: np.ndarray) -> np.ndarray:
    rect = order_points(quad.astype(np.float32))
    (tl, tr, br, bl) = rect

    width_a = np.linalg.norm(br - bl)
    width_b = np.linalg.norm(tr - tl)
    height_a = np.linalg.norm(tr - br)
    height_b = np.linalg.norm(tl - bl)
    src_w = max(int(width_a), int(width_b), 1)
    src_h = max(int(height_a), int(height_b), 1)
    ratio = src_w / max(src_h, 1)

    # PIU cabs are usually close to 4:3, but keep 16:9 as fallback.
    if 1.20 <= ratio <= 1.45:
        dst_w, dst_h = 1600, 1200
    elif 1.55 <= ratio <= 1.95:
        dst_w, dst_h = 1920, 1080
    else:
        dst_h = 1200
        dst_w = int(round(dst_h * ratio))
        dst_w = max(dst_w, 800)

    dst = np.array(
        [[0, 0], [dst_w - 1, 0], [dst_w - 1, dst_h - 1], [0, dst_h - 1]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(image, matrix, (dst_w, dst_h))


def _find_quads_from_mask(mask: np.ndarray, image_area: float) -> List[np.ndarray]:
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    quads: List[np.ndarray] = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < image_area * 0.12:
            continue
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) != 4:
            continue
        if not cv2.isContourConvex(approx):
            continue
        quads.append(approx.reshape(4, 2).astype(np.float32))
    return quads


def detect_screen_quad(image: np.ndarray) -> Optional[np.ndarray]:
    h, w = image.shape[:2]
    image_area = float(h * w)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 80, 180)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)

    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    value = hsv[:, :, 2]
    _, bright = cv2.threshold(value, 45, 255, cv2.THRESH_BINARY)
    bright = cv2.morphologyEx(bright, cv2.MORPH_CLOSE, np.ones((11, 11), np.uint8), iterations=2)

    candidates = _find_quads_from_mask(edges, image_area) + _find_quads_from_mask(bright, image_area)
    if not candidates:
        return None

    best_quad: Optional[np.ndarray] = None
    best_score = -1e9
    for quad in candidates:
        rect = order_points(quad)
        width_a = np.linalg.norm(rect[2] - rect[3])
        width_b = np.linalg.norm(rect[1] - rect[0])
        height_a = np.linalg.norm(rect[1] - rect[2])
        height_b = np.linalg.norm(rect[0] - rect[3])
        quad_w = max(width_a, width_b, 1.0)
        quad_h = max(height_a, height_b, 1.0)
        ratio = quad_w / quad_h
        if ratio < 0.95 or ratio > 2.10:
            continue

        area = cv2.contourArea(quad.astype(np.float32))
        area_ratio = area / image_area

        # Prefer bigger rectangles with monitor-like aspect ratio.
        ratio_penalty = min(abs(ratio - (4.0 / 3.0)), abs(ratio - (16.0 / 9.0)))
        score = (area_ratio * 2.0) - ratio_penalty
        if score > best_score:
            best_score = score
            best_quad = rect
    return best_quad


def crop_roi(image: np.ndarray, roi: Tuple[float, float, float, float]) -> Tuple[np.ndarray, Tuple[int, int, int, int]]:
    h, w = image.shape[:2]
    x0, y0, x1, y1 = roi
    xa = max(int(round(x0 * w)), 0)
    ya = max(int(round(y0 * h)), 0)
    xb = min(int(round(x1 * w)), w)
    yb = min(int(round(y1 * h)), h)
    return image[ya:yb, xa:xb].copy(), (xa, ya, xb, yb)


def preprocess_variants(image: np.ndarray) -> List[np.ndarray]:
    out: List[np.ndarray] = []
    out.append(image)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    out.append(gray)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    out.append(clahe)

    blur = cv2.GaussianBlur(clahe, (3, 3), 0)
    _, otsu = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    out.append(otsu)
    out.append(255 - otsu)

    adaptive = cv2.adaptiveThreshold(
        clahe,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        35,
        5,
    )
    out.append(adaptive)
    return out


def run_ocr_multi(engine: OCREngine, image: np.ndarray) -> List[OCRLine]:
    all_lines: List[OCRLine] = []
    seen: set[Tuple[str, int, int]] = set()

    for variant in preprocess_variants(image):
        lines = engine.run(variant)
        for line in lines:
            key = (
                normalize_space(line.text.upper()),
                int(round(line.cx / 3.0)),
                int(round(line.cy / 3.0)),
            )
            if key in seen:
                continue
            seen.add(key)
            all_lines.append(line)
    return sorted(all_lines, key=lambda x: (x.cy, x.cx))


def normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def normalize_number_token(text: str) -> str:
    return text.translate(DIGIT_TRANSLATION)


def parse_int_token(text: str) -> Optional[int]:
    text = normalize_number_token(text)
    digits = re.sub(r"[^0-9]", "", text)
    if not digits:
        return None
    try:
        return int(digits)
    except ValueError:
        return None


def parse_float_token(text: str) -> Optional[float]:
    text = normalize_number_token(text).replace(",", ".")
    match = re.search(r"([0-9]+(?:\.[0-9]+)?)", text)
    if not match:
        return None
    try:
        return float(match.group(1))
    except ValueError:
        return None


def extract_title(lines: Sequence[OCRLine]) -> Optional[str]:
    candidates: List[Tuple[float, str]] = []
    for line in lines:
        text = normalize_space(line.text)
        if not text:
            continue
        upper = text.upper()
        collapsed = upper.replace(" ", "")
        if any(stop in upper for stop in TITLE_STOPWORDS):
            continue
        alpha_count = sum(ch.isalpha() for ch in text)
        digit_count = sum(ch.isdigit() for ch in text)
        if alpha_count < 4:
            continue
        if digit_count > max(1, alpha_count // 2):
            continue
        if len(collapsed) < 5:
            continue
        score = alpha_count + (line.confidence * 2.0) - (digit_count * 0.75)
        candidates.append((score, text))

    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


def detect_mode(text: str) -> Optional[str]:
    chunks = re.findall(r"[A-Z]+", text.upper())
    best_mode = None
    best_score = 0.0
    for token in chunks:
        single_score = fuzz.ratio(token, "SINGLE")
        double_score = fuzz.ratio(token, "DOUBLE")
        if single_score > best_score and single_score >= 65:
            best_mode = "SINGLE"
            best_score = float(single_score)
        if double_score > best_score and double_score >= 65:
            best_mode = "DOUBLE"
            best_score = float(double_score)
    return best_mode


def extract_mode_level(lines: Sequence[OCRLine]) -> Tuple[Optional[str], Optional[int]]:
    mode: Optional[str] = None
    level: Optional[int] = None
    level_candidates: List[Tuple[float, int]] = []

    for line in lines:
        upper = normalize_space(line.text.upper())
        maybe_mode = detect_mode(upper)
        if maybe_mode and mode is None:
            mode = maybe_mode

        normalized = normalize_number_token(upper)
        mode_inline = re.search(r"(SINGLE|DOUBLE)[^0-9]{0,6}([0-9]{1,2})", normalized)
        if mode_inline:
            inline_mode = mode_inline.group(1)
            inline_level = int(mode_inline.group(2))
            if 1 <= inline_level <= 30:
                return inline_mode, inline_level

        for raw in re.findall(r"[0-9OQDISBZ|l]{1,3}", line.text):
            value = parse_int_token(raw)
            if value is None:
                continue
            if 1 <= value <= 30:
                # prefer larger, high-confidence, vertically central candidates
                quality = line.confidence + (0.15 if value >= 10 else 0.0)
                level_candidates.append((quality, value))

    if level_candidates:
        level_candidates.sort(key=lambda item: item[0], reverse=True)
        level = level_candidates[0][1]

    return mode, level


def extract_score(lines: Sequence[OCRLine]) -> Optional[int]:
    candidates: List[Tuple[int, float]] = []
    for line in lines:
        for token in re.findall(r"[0-9OQDISBZ|l]{5,10}", line.text):
            value = parse_int_token(token)
            if value is None:
                continue
            if 100000 <= value <= 99999999:
                candidates.append((value, line.confidence))
    if not candidates:
        return None

    # Prefer largest score; use confidence as tie-breaker.
    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return candidates[0][0]


def _find_label_line(lines: Sequence[OCRLine], label: str) -> Optional[OCRLine]:
    best: Optional[OCRLine] = None
    best_score = 0.0
    target = label.replace(" ", "")
    for line in lines:
        text = normalize_space(line.text.upper()).replace(" ", "")
        if not text:
            continue
        score = fuzz.partial_ratio(text, target)
        if score > best_score and score >= 65:
            best_score = float(score)
            best = line
    return best


def _nearest_numeric(
    lines: Sequence[OCRLine],
    anchor: OCRLine,
    *,
    allow_decimal: bool = False,
) -> Optional[float]:
    best: Optional[Tuple[float, float]] = None

    # Same-line parse first.
    same_value = parse_float_token(anchor.text) if allow_decimal else parse_int_token(anchor.text)
    if same_value is not None:
        return float(same_value)

    for line in lines:
        if line is anchor:
            continue
        dy = abs(line.cy - anchor.cy)
        if dy > max(22.0, anchor.h * 0.9):
            continue
        value = parse_float_token(line.text) if allow_decimal else parse_int_token(line.text)
        if value is None:
            continue
        dx_bonus = 8.0 if line.cx > anchor.cx else 0.0
        score = dx_bonus - dy + (line.confidence * 2.0)
        if best is None or score > best[0]:
            best = (score, float(value))
    if best is None:
        return None
    return best[1]


def extract_stats(lines: Sequence[OCRLine]) -> Dict[str, Any]:
    stats: Dict[str, Any] = {}
    blob = "\n".join(normalize_space(line.text.upper()) for line in lines)

    for key, label in STAT_LABELS.items():
        line = _find_label_line(lines, label)
        if line is not None:
            value = _nearest_numeric(lines, line, allow_decimal=(key == "kcal"))
        else:
            value = None

        # Regex fallback when pairing fails.
        if value is None:
            if key == "kcal":
                m = re.search(r"KCAL[^0-9]{0,8}([0-9OQDISBZ|l]{1,3}(?:[.,][0-9OQDISBZ|l]{1,3})?)", blob)
                if m:
                    value = parse_float_token(m.group(1))
            else:
                m = re.search(label.replace(" ", r"\s*") + r"[^0-9]{0,8}([0-9OQDISBZ|l]{1,5})", blob)
                if m:
                    value = parse_int_token(m.group(1))

        if value is None:
            stats[key] = None
            continue

        if key == "kcal":
            stats[key] = round(float(value), 3)
        else:
            stats[key] = int(round(float(value)))

    return stats


def draw_quad(image: np.ndarray, quad: np.ndarray) -> np.ndarray:
    out = image.copy()
    q = quad.astype(int)
    cv2.polylines(out, [q.reshape((-1, 1, 2))], True, (0, 255, 0), 4)
    return out


def draw_rois(image: np.ndarray) -> np.ndarray:
    out = image.copy()
    h, w = out.shape[:2]
    for name, (x0, y0, x1, y1) in ROIS.items():
        xa, ya, xb, yb = int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h)
        cv2.rectangle(out, (xa, ya), (xb, yb), (255, 200, 0), 2)
        cv2.putText(out, name, (xa + 4, ya + 24), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 200, 0), 2)
    return out


def parse_image(image_path: Path, engine: OCREngine, debug_dir: Optional[Path] = None) -> Dict[str, Any]:
    image = cv2.imread(str(image_path))
    if image is None:
        raise ValueError(f"Could not load image: {image_path}")

    quad = detect_screen_quad(image)
    if quad is None:
        h, w = image.shape[:2]
        quad = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype=np.float32)
        screen_detected = False
    else:
        screen_detected = True

    warped = warp_screen(image, quad)

    roi_images: Dict[str, np.ndarray] = {}
    roi_lines: Dict[str, List[OCRLine]] = {}
    for name, roi in ROIS.items():
        crop, _ = crop_roi(warped, roi)
        roi_images[name] = crop
        roi_lines[name] = run_ocr_multi(engine, crop)

    song_title = extract_title(roi_lines["title"])
    mode, level = extract_mode_level(roi_lines["mode_level"])
    score = extract_score(roi_lines["score"])
    stats = extract_stats(roi_lines["stats"])

    result: Dict[str, Any] = {
        "source": str(image_path),
        "screen_detected": screen_detected,
        "song_title": song_title,
        "mode": mode,
        "level": level,
        "score": score,
        "breakdown": {
            "perfect": stats.get("perfect"),
            "great": stats.get("great"),
            "good": stats.get("good"),
            "bad": stats.get("bad"),
            "miss": stats.get("miss"),
            "max_combo": stats.get("max_combo"),
            "kcal": stats.get("kcal"),
        },
    }

    if debug_dir is not None:
        debug_dir.mkdir(parents=True, exist_ok=True)
        stem = image_path.stem
        cv2.imwrite(str(debug_dir / f"{stem}_01_quad.jpg"), draw_quad(image, quad))
        cv2.imwrite(str(debug_dir / f"{stem}_02_warped.jpg"), warped)
        cv2.imwrite(str(debug_dir / f"{stem}_03_rois.jpg"), draw_rois(warped))
        for name, roi_image in roi_images.items():
            cv2.imwrite(str(debug_dir / f"{stem}_roi_{name}.jpg"), roi_image)

        ocr_dump = {
            name: [{"text": line.text, "confidence": line.confidence} for line in lines]
            for name, lines in roi_lines.items()
        }
        (debug_dir / f"{stem}_ocr.json").write_text(json.dumps(ocr_dump, indent=2), encoding="utf-8")

    return result


def expand_input_paths(inputs: Sequence[str]) -> List[Path]:
    paths: List[Path] = []
    for raw in inputs:
        path = Path(raw)
        if path.is_dir():
            for child in sorted(path.iterdir()):
                if child.suffix.lower() in IMAGE_SUFFIXES:
                    paths.append(child)
        else:
            paths.append(path)
    return paths


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Parse PIU Phoenix result-screen photos into structured score data.",
    )
    parser.add_argument("inputs", nargs="+", help="Image files and/or directories of images.")
    parser.add_argument(
        "--debug-dir",
        default=None,
        help="Optional directory for intermediate debug images and OCR dumps.",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print JSON output.",
    )
    args = parser.parse_args()

    image_paths = expand_input_paths(args.inputs)
    if not image_paths:
        raise SystemExit("No image files found in input path(s).")

    engine = OCREngine()
    debug_dir = Path(args.debug_dir) if args.debug_dir else None

    results = []
    for image_path in image_paths:
        try:
            results.append(parse_image(image_path, engine, debug_dir=debug_dir))
        except Exception as exc:  # noqa: BLE001
            results.append(
                {
                    "source": str(image_path),
                    "error": str(exc),
                }
            )

    payload: Any = results[0] if len(results) == 1 else results
    if args.pretty:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    else:
        print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
