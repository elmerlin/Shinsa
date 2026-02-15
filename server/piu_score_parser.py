#!/usr/bin/env python3
"""
Parse Pump It Up (Phoenix) result-screen photos into structured JSON.

This parser is designed for phone photos where framing and camera angle vary.
It first tries to detect the screen rectangle, perspective-corrects it, then
extracts fixed UI regions with OCR.  When ROI-based extraction fails it falls
back to whole-image scanning with multiple preprocessing strategies.
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

# Multiple ROI variants for stats — tried in order until extraction succeeds.
# Different photos/angles/screen ratios need different regions.
STATS_ROIS: List[Tuple[float, float, float, float]] = [
    (0.02, 0.38, 0.75, 0.96),   # Wide, extended down — covers most layouts
    (0.16, 0.44, 0.68, 0.82),   # Original narrow
    (0.00, 0.35, 0.60, 1.00),   # Left-focused, full bottom
    (0.02, 0.30, 0.80, 1.00),   # Very wide
    (0.10, 0.50, 0.70, 0.95),   # Middle-focused
]

STAT_LABELS: Dict[str, str] = {
    "perfect": "PERFECT",
    "great": "GREAT",
    "good": "GOOD",
    "bad": "BAD",
    "miss": "MISS",
    "max_combo": "MAX COMBO",
    "kcal": "KCAL",
}

# Ordered top-to-bottom as they appear on the PIU result screen
STAT_ORDER = ["perfect", "great", "good", "bad", "miss", "max_combo", "kcal"]

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
    def x_min(self) -> float:
        return float(np.min(self.box[:, 0]))

    @property
    def x_max(self) -> float:
        return float(np.max(self.box[:, 0]))

    @property
    def y_min(self) -> float:
        return float(np.min(self.box[:, 1]))

    @property
    def y_max(self) -> float:
        return float(np.max(self.box[:, 1]))

    @property
    def h(self) -> float:
        return float(np.max(self.box[:, 1]) - np.min(self.box[:, 1]))

    @property
    def w(self) -> float:
        return float(np.max(self.box[:, 0]) - np.min(self.box[:, 0]))


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


def preprocess_variants(image: np.ndarray, upscale: bool = False) -> List[np.ndarray]:
    """Generate multiple image preprocessing variants for OCR."""
    out: List[np.ndarray] = []

    # Upscale small images for better OCR accuracy
    if upscale:
        h, w = image.shape[:2]
        if max(h, w) < 600:
            scale = 600.0 / max(h, w)
            image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    out.append(image)

    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image
    out.append(gray)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    out.append(clahe)

    # Strong CLAHE for washed-out photos
    clahe_strong = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(4, 4)).apply(gray)
    out.append(clahe_strong)

    blur = cv2.GaussianBlur(clahe, (3, 3), 0)
    _, otsu = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    out.append(otsu)
    out.append(255 - otsu)

    adaptive = cv2.adaptiveThreshold(
        clahe, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 35, 5,
    )
    out.append(adaptive)

    # Additional: high-contrast binary with multiple thresholds
    for thresh in [100, 140, 180]:
        _, binary = cv2.threshold(gray, thresh, 255, cv2.THRESH_BINARY)
        out.append(binary)

    # Sharpen variant
    kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
    sharpened = cv2.filter2D(clahe, -1, kernel)
    out.append(sharpened)

    # Per-channel processing for color images (PIU uses colored text)
    if len(image.shape) == 3:
        for i in range(3):
            channel = image[:, :, i]
            ch_clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(channel)
            out.append(ch_clahe)

    return out


def run_ocr_multi(engine: OCREngine, image: np.ndarray, upscale: bool = False) -> List[OCRLine]:
    all_lines: List[OCRLine] = []
    seen: set[Tuple[str, int, int]] = set()

    for variant in preprocess_variants(image, upscale=upscale):
        lines = engine.run(variant)
        for line in lines:
            key = (
                normalize_space(line.text.upper()),
                int(round(line.cx / 5.0)),
                int(round(line.cy / 5.0)),
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

    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return candidates[0][0]


def _find_label_line(lines: Sequence[OCRLine], label: str, threshold: int = 60) -> Optional[OCRLine]:
    """Find the OCR line that best matches a stat label."""
    best: Optional[OCRLine] = None
    best_score = 0.0
    target = label.replace(" ", "")
    for line in lines:
        text = normalize_space(line.text.upper()).replace(" ", "")
        if not text:
            continue
        # Try both partial_ratio and ratio for robustness
        score1 = fuzz.partial_ratio(text, target)
        score2 = fuzz.ratio(text, target)
        score = max(score1, score2)
        if score > best_score and score >= threshold:
            best_score = float(score)
            best = line
    return best


def _extract_number_from_text(text: str, allow_decimal: bool = False) -> Optional[float]:
    """Extract a numeric value from a text string, stripping label parts."""
    # Remove common label words
    cleaned = text.upper()
    for label in ["PERFECT", "GREAT", "GOOD", "BAD", "MISS", "MAX", "COMBO", "KCAL"]:
        cleaned = cleaned.replace(label, " ")
    cleaned = cleaned.strip()

    if allow_decimal:
        return parse_float_token(cleaned)
    else:
        return parse_int_token(cleaned) if parse_int_token(cleaned) is not None else None


def _nearest_numeric(
    lines: Sequence[OCRLine],
    anchor: OCRLine,
    *,
    allow_decimal: bool = False,
    image_h: float = 0.0,
) -> Optional[float]:
    """Find the nearest numeric value to a label anchor."""
    best: Optional[Tuple[float, float]] = None

    # Try extracting number from the anchor's own text (handles "PERFECT 986")
    value = _extract_number_from_text(anchor.text, allow_decimal=allow_decimal)
    if value is not None:
        return float(value)

    # Adaptive vertical tolerance based on image size and text height
    if image_h > 0:
        tolerance = max(80.0, image_h * 0.06, anchor.h * 3.0)
    else:
        tolerance = max(80.0, anchor.h * 3.0)

    for line in lines:
        if line is anchor:
            continue
        dy = abs(line.cy - anchor.cy)
        if dy > tolerance:
            continue

        value = parse_float_token(line.text) if allow_decimal else None
        if value is None:
            int_val = parse_int_token(line.text)
            value = float(int_val) if int_val is not None else None
        if value is None:
            continue

        # Prefer values to the RIGHT of the label and on the same Y band
        dx = line.cx - anchor.cx
        right_bonus = 15.0 if dx > 0 else 0.0
        closeness = max(0, tolerance - dy)
        score = right_bonus + closeness + (line.confidence * 3.0)
        if best is None or score > best[0]:
            best = (score, float(value))

    if best is None:
        return None
    return best[1]


def _extract_inline_stat(text: str, label: str, allow_decimal: bool = False) -> Optional[float]:
    """Try to extract stat value from a single line like 'PERFECT 986' or '986 PERFECT'."""
    upper = normalize_space(text.upper())
    target = label.replace(" ", r"\s*")

    # Pattern: LABEL followed by number
    m = re.search(target + r"[^0-9]{0,12}([0-9OQDISBZ|l]{1,6}(?:[.,][0-9OQDISBZ|l]{1,3})?)", upper)
    if m:
        return parse_float_token(m.group(1)) if allow_decimal else (parse_int_token(m.group(1)) and float(parse_int_token(m.group(1))))

    # Pattern: number followed by LABEL
    m = re.search(r"([0-9OQDISBZ|l]{1,6}(?:[.,][0-9OQDISBZ|l]{1,3})?)[^0-9]{0,12}" + target, upper)
    if m:
        return parse_float_token(m.group(1)) if allow_decimal else (parse_int_token(m.group(1)) and float(parse_int_token(m.group(1))))

    return None


def extract_stats(lines: Sequence[OCRLine], image_h: float = 0.0) -> Dict[str, Any]:
    """Extract stat breakdown from OCR lines."""
    stats: Dict[str, Any] = {}
    blob = "\n".join(normalize_space(line.text.upper()) for line in lines)
    full_blob = " ".join(normalize_space(line.text.upper()) for line in lines)

    for key, label in STAT_LABELS.items():
        is_decimal = (key == "kcal")
        value: Optional[float] = None

        # Strategy 1: Find label line and nearest numeric value
        label_line = _find_label_line(lines, label)
        if label_line is not None:
            value = _nearest_numeric(lines, label_line, allow_decimal=is_decimal, image_h=image_h)

        # Strategy 2: Check each line for inline label+value (e.g. "PERFECT 986")
        if value is None:
            for line in lines:
                v = _extract_inline_stat(line.text, label, allow_decimal=is_decimal)
                if v is not None:
                    value = v
                    break

        # Strategy 3: Regex on the combined blob
        if value is None:
            pattern = label.replace(" ", r"\s*")
            if is_decimal:
                m = re.search(
                    pattern + r"[^0-9]{0,12}([0-9OQDISBZ|l]{1,5}(?:[.,][0-9OQDISBZ|l]{1,3})?)",
                    full_blob,
                )
                if m:
                    value = parse_float_token(m.group(1))
            else:
                m = re.search(
                    pattern + r"[^0-9]{0,12}([0-9OQDISBZ|l]{1,5})",
                    full_blob,
                )
                if m:
                    v = parse_int_token(m.group(1))
                    if v is not None:
                        value = float(v)

        # Strategy 4: Reversed regex — number before label
        if value is None:
            pattern = label.replace(" ", r"\s*")
            if is_decimal:
                m = re.search(
                    r"([0-9OQDISBZ|l]{1,5}(?:[.,][0-9OQDISBZ|l]{1,3})?)[^0-9]{0,12}" + pattern,
                    full_blob,
                )
                if m:
                    value = parse_float_token(m.group(1))
            else:
                m = re.search(
                    r"([0-9OQDISBZ|l]{1,5})[^0-9]{0,12}" + pattern,
                    full_blob,
                )
                if m:
                    v = parse_int_token(m.group(1))
                    if v is not None:
                        value = float(v)

        if value is None:
            stats[key] = None
            continue

        if is_decimal:
            stats[key] = round(float(value), 3)
        else:
            stats[key] = int(round(float(value)))

    return stats


def _extract_stats_with_layout(lines: Sequence[OCRLine], image_h: float = 0.0) -> Dict[str, Any]:
    """
    Alternative stats extraction using spatial layout analysis.
    PIU result screens have labels on the left and numbers on the right,
    arranged vertically in order: PERFECT, GREAT, GOOD, BAD, MISS, MAX COMBO, KCAL.
    """
    # Group lines into label lines and number lines based on content
    label_lines: List[Tuple[str, OCRLine]] = []  # (stat_key, line)
    number_lines: List[OCRLine] = []

    for line in lines:
        upper = normalize_space(line.text.upper()).replace(" ", "")
        if not upper:
            continue

        # Check if this line matches any stat label
        matched_key = None
        best_match_score = 0
        for key, label in STAT_LABELS.items():
            target = label.replace(" ", "")
            score = max(fuzz.ratio(upper, target), fuzz.partial_ratio(upper, target))
            if score > best_match_score and score >= 55:
                best_match_score = score
                matched_key = key

        if matched_key:
            label_lines.append((matched_key, line))
        else:
            # Check if it's a number
            cleaned = re.sub(r"[^0-9.,]", "", normalize_number_token(upper))
            if cleaned and any(c.isdigit() for c in cleaned):
                number_lines.append(line)

    stats: Dict[str, Any] = {}
    for key, label_line in label_lines:
        is_decimal = (key == "kcal")

        # First try inline extraction
        value = _extract_number_from_text(label_line.text, allow_decimal=is_decimal)

        if value is None:
            # Find the closest number line that is roughly on the same Y and to the right
            best_num: Optional[Tuple[float, float]] = None
            tolerance = max(80.0, image_h * 0.06, label_line.h * 3.0) if image_h > 0 else max(80.0, label_line.h * 3.0)

            for num_line in number_lines:
                dy = abs(num_line.cy - label_line.cy)
                if dy > tolerance:
                    continue

                raw = normalize_number_token(num_line.text)
                if is_decimal:
                    v = parse_float_token(raw)
                else:
                    v = parse_int_token(raw)
                if v is None:
                    continue

                dx = num_line.cx - label_line.cx
                right_bonus = 20.0 if dx > 0 else 0.0
                closeness = max(0, tolerance - dy)
                score = right_bonus + closeness + (num_line.confidence * 3.0)
                if best_num is None or score > best_num[0]:
                    best_num = (score, float(v))

            if best_num is not None:
                value = best_num[1]

        if value is not None:
            stats[key] = round(value, 3) if is_decimal else int(round(value))

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


def _count_found_stats(stats: Dict[str, Any]) -> int:
    """Count how many stats have non-None values."""
    return sum(1 for v in stats.values() if v is not None)


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
    warped_h = float(warped.shape[0])

    # Extract title, mode/level, and score from fixed ROIs
    roi_images: Dict[str, np.ndarray] = {}
    roi_lines: Dict[str, List[OCRLine]] = {}
    for name in ["title", "mode_level", "score"]:
        roi = ROIS[name]
        crop, _ = crop_roi(warped, roi)
        roi_images[name] = crop
        roi_lines[name] = run_ocr_multi(engine, crop)

    song_title = extract_title(roi_lines["title"])
    mode, level = extract_mode_level(roi_lines["mode_level"])
    score = extract_score(roi_lines["score"])

    # --- Stats extraction with multiple strategies ---
    best_stats: Dict[str, Any] = {}
    best_stats_count = 0
    stats_lines_used: List[OCRLine] = []

    # Strategy A: Try multiple ROI positions
    for roi in STATS_ROIS:
        crop, _ = crop_roi(warped, roi)
        crop_h = float(crop.shape[0])
        lines = run_ocr_multi(engine, crop, upscale=True)

        # Standard extraction
        stats = extract_stats(lines, image_h=crop_h)
        count = _count_found_stats(stats)
        if count > best_stats_count:
            best_stats = stats
            best_stats_count = count
            stats_lines_used = lines

        # Layout-based extraction
        layout_stats = _extract_stats_with_layout(lines, image_h=crop_h)
        layout_count = _count_found_stats(layout_stats)
        if layout_count > best_stats_count:
            best_stats = layout_stats
            best_stats_count = layout_count
            stats_lines_used = lines

        # If we got all 7 stats, stop
        if best_stats_count >= 7:
            break

    # Strategy B: Full warped image scan if ROI extraction is incomplete
    if best_stats_count < 5:
        full_lines = run_ocr_multi(engine, warped, upscale=False)

        stats = extract_stats(full_lines, image_h=warped_h)
        count = _count_found_stats(stats)
        if count > best_stats_count:
            best_stats = stats
            best_stats_count = count
            stats_lines_used = full_lines

        layout_stats = _extract_stats_with_layout(full_lines, image_h=warped_h)
        layout_count = _count_found_stats(layout_stats)
        if layout_count > best_stats_count:
            best_stats = layout_stats
            best_stats_count = layout_count
            stats_lines_used = full_lines

    # Strategy C: Full original image scan (before warping) as last resort
    if best_stats_count < 5:
        orig_lines = run_ocr_multi(engine, image, upscale=False)
        orig_h = float(image.shape[0])

        stats = extract_stats(orig_lines, image_h=orig_h)
        count = _count_found_stats(stats)
        if count > best_stats_count:
            best_stats = stats
            best_stats_count = count

        layout_stats = _extract_stats_with_layout(orig_lines, image_h=orig_h)
        layout_count = _count_found_stats(layout_stats)
        if layout_count > best_stats_count:
            best_stats = layout_stats
            best_stats_count = layout_count

    # Also try to get score from full image if ROI didn't find it
    if score is None:
        full_lines = run_ocr_multi(engine, warped, upscale=False) if not stats_lines_used else stats_lines_used
        score = extract_score(full_lines)

    # Merge: fill in any None values from best_stats using stats if available
    final_stats = best_stats

    result: Dict[str, Any] = {
        "source": str(image_path),
        "screen_detected": screen_detected,
        "song_title": song_title,
        "mode": mode,
        "level": level,
        "score": score,
        "breakdown": {
            "perfect": final_stats.get("perfect"),
            "great": final_stats.get("great"),
            "good": final_stats.get("good"),
            "bad": final_stats.get("bad"),
            "miss": final_stats.get("miss"),
            "max_combo": final_stats.get("max_combo"),
            "kcal": final_stats.get("kcal"),
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

        # Save all stats ROI crops for debugging
        for i, roi in enumerate(STATS_ROIS):
            crop, _ = crop_roi(warped, roi)
            cv2.imwrite(str(debug_dir / f"{stem}_roi_stats_{i}.jpg"), crop)

        all_ocr_lines = {}
        for name, lines_list in roi_lines.items():
            all_ocr_lines[name] = [{"text": line.text, "confidence": line.confidence} for line in lines_list]
        all_ocr_lines["stats_used"] = [{"text": line.text, "confidence": line.confidence} for line in stats_lines_used]
        (debug_dir / f"{stem}_ocr.json").write_text(json.dumps(all_ocr_lines, indent=2), encoding="utf-8")

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
