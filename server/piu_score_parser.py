#!/usr/bin/env python3
"""
Parse Pump It Up (Phoenix) result-screen photos into structured JSON.

This parser is fully dynamic and position-independent. It does NOT rely on
fixed pixel positions or ROI coordinates. Instead, it:
  1. Runs OCR on the full image with multiple preprocessing variants
  2. Finds stat labels (PERFECT, GREAT, etc.) wherever they appear
  3. Associates each label with its nearest numeric value spatially
  4. Works regardless of how the photo is framed or angled

This approach handles varied photo framing, angles, crops, and screen sizes.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np
from rapidfuzz import fuzz
from rapidocr_onnxruntime import RapidOCR


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}

# Labels we search for dynamically in the OCR output — no fixed positions.
STAT_LABELS: Dict[str, str] = {
    "perfect": "PERFECT",
    "great": "GREAT",
    "good": "GOOD",
    "bad": "BAD",
    "miss": "MISS",
    "max_combo": "MAX COMBO",
    "kcal": "KCAL",
}

STAT_ORDER = ["perfect", "great", "good", "bad", "miss", "max_combo", "kcal"]

# Aliases — OCR sometimes reads these instead of the canonical label
STAT_ALIASES: Dict[str, List[str]] = {
    "perfect": ["PERFECT", "PERFEC", "ERFECT", "PERFECI", "PERFEGT"],
    "great": ["GREAT", "GREA", "GRFAT", "GREAI"],
    "good": ["GOOD", "G00D", "GOO0"],
    "bad": ["BAD", "8AD"],
    "miss": ["MISS", "M1SS", "MIS5", "MLSS"],
    "max_combo": ["MAX COMBO", "MAXCOMBO", "MAX COMBC", "MAXCOMB0", "MAX COMB", "COMBO"],
    "kcal": ["KCAL", "KCAI", "KCA1"],
}

TITLE_STOPWORDS = {
    "SCORE", "PERFECT", "GREAT", "GOOD", "BAD", "MISS", "MAX", "COMBO",
    "KCAL", "BPM", "SINGLE", "DOUBLE", "EXPERT", "LV", "GAME",
    "ULTIMATE", "MARVELOUS", "CREDIT", "PASS", "AV", "BGA", "JT",
}

DIGIT_TRANSLATION = str.maketrans({
    "O": "0", "Q": "0", "D": "0", "o": "0",
    "I": "1", "l": "1", "|": "1",
    "S": "5", "s": "5",
    "B": "8", "Z": "2",
})


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


# ---------------------------------------------------------------------------
# Image preprocessing — generate multiple variants for OCR robustness
# ---------------------------------------------------------------------------

def preprocess_variants(image: np.ndarray) -> List[np.ndarray]:
    """Generate multiple preprocessed versions of an image for OCR."""
    out: List[np.ndarray] = []

    # Upscale small images
    h, w = image.shape[:2]
    if max(h, w) < 800:
        scale = 800.0 / max(h, w)
        image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    out.append(image)

    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image
    out.append(gray)

    # CLAHE variants
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    out.append(clahe)
    clahe_strong = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(4, 4)).apply(gray)
    out.append(clahe_strong)

    # Otsu + inverted
    blur = cv2.GaussianBlur(clahe, (3, 3), 0)
    _, otsu = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    out.append(otsu)
    out.append(255 - otsu)

    # Adaptive threshold
    adaptive = cv2.adaptiveThreshold(
        clahe, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 35, 5,
    )
    out.append(adaptive)

    # Fixed binary thresholds
    for thresh in [100, 140, 180]:
        _, binary = cv2.threshold(gray, thresh, 255, cv2.THRESH_BINARY)
        out.append(binary)

    # Sharpen
    kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
    sharpened = cv2.filter2D(clahe, -1, kernel)
    out.append(sharpened)

    # Per-channel processing for color images (PIU uses colored stat text)
    if len(image.shape) == 3:
        for i in range(3):
            channel = image[:, :, i]
            ch_clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(channel)
            out.append(ch_clahe)

    return out


def run_ocr_multi(engine: OCREngine, image: np.ndarray) -> List[OCRLine]:
    """Run OCR on multiple preprocessed variants, deduplicating results."""
    all_lines: List[OCRLine] = []
    seen: set[Tuple[str, int, int]] = set()

    for variant in preprocess_variants(image):
        lines = engine.run(variant)
        for line in lines:
            key = (
                normalize_space(line.text.upper()),
                int(round(line.cx / 8.0)),
                int(round(line.cy / 8.0)),
            )
            if key in seen:
                continue
            seen.add(key)
            all_lines.append(line)
    return sorted(all_lines, key=lambda x: (x.cy, x.cx))


# ---------------------------------------------------------------------------
# Screen detection and perspective correction
# ---------------------------------------------------------------------------

def order_points(pts: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype=np.float32)
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1).reshape(-1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
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

    if 1.20 <= ratio <= 1.45:
        dst_w, dst_h = 1600, 1200
    elif 1.55 <= ratio <= 1.95:
        dst_w, dst_h = 1920, 1080
    else:
        dst_h = 1200
        dst_w = max(int(round(dst_h * ratio)), 800)

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
        ratio_penalty = min(abs(ratio - (4.0 / 3.0)), abs(ratio - (16.0 / 9.0)))
        score = (area_ratio * 2.0) - ratio_penalty
        if score > best_score:
            best_score = score
            best_quad = rect
    return best_quad


# ---------------------------------------------------------------------------
# Text utilities
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Title, mode/level, score extraction (non-positional, scan all lines)
# ---------------------------------------------------------------------------

def extract_title(lines: Sequence[OCRLine]) -> Optional[str]:
    candidates: List[Tuple[float, str]] = []
    for line in lines:
        text = normalize_space(line.text)
        if not text:
            continue
        upper = text.upper()
        if any(stop in upper for stop in TITLE_STOPWORDS):
            continue
        alpha_count = sum(ch.isalpha() for ch in text)
        digit_count = sum(ch.isdigit() for ch in text)
        if alpha_count < 4:
            continue
        if digit_count > max(1, alpha_count // 2):
            continue
        if len(upper.replace(" ", "")) < 5:
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
            return mode_inline.group(1), int(mode_inline.group(2))

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
            # PIU Phoenix scores range from 0 to 1,000,000
            if 100000 <= value <= 1000000:
                candidates.append((value, line.confidence))
    if not candidates:
        return None
    # Prefer highest confidence, then largest value
    candidates.sort(key=lambda item: (item[1], item[0]), reverse=True)
    return candidates[0][0]


# ---------------------------------------------------------------------------
# Dynamic stat extraction — the core of the position-independent approach
# ---------------------------------------------------------------------------

def _match_stat_label(text: str) -> Optional[Tuple[str, float]]:
    """
    Check if an OCR text string matches any stat label.
    Returns (stat_key, match_score) or None.
    """
    upper = normalize_space(text.upper()).replace(" ", "")
    if len(upper) < 2:
        return None

    best_key: Optional[str] = None
    best_score = 0.0

    for key, aliases in STAT_ALIASES.items():
        for alias in aliases:
            target = alias.replace(" ", "")
            # For short labels (BAD, MISS), require higher match threshold
            min_threshold = 70 if len(target) <= 4 else 60

            # Full string match
            score = fuzz.ratio(upper, target)
            if score >= min_threshold and score > best_score:
                best_score = float(score)
                best_key = key

            # Partial match — the OCR line might contain extra text
            pscore = fuzz.partial_ratio(upper, target)
            if pscore >= min_threshold and pscore > best_score:
                # Penalize partial matches slightly to prefer exact matches
                adjusted = pscore * 0.95
                if adjusted > best_score:
                    best_score = adjusted
                    best_key = key

    if best_key is not None:
        return (best_key, best_score)
    return None


def _extract_number_from_text(text: str, allow_decimal: bool = False) -> Optional[float]:
    """Extract a numeric value from a text string, stripping known label words."""
    cleaned = text.upper()
    for label in ["PERFECT", "GREAT", "GOOD", "BAD", "MISS", "MAX", "COMBO", "KCAL"]:
        cleaned = cleaned.replace(label, " ")
    cleaned = cleaned.strip()
    if allow_decimal:
        return parse_float_token(cleaned)
    val = parse_int_token(cleaned)
    return float(val) if val is not None else None


def _is_pure_number(text: str) -> bool:
    """Check if a text string is primarily numeric (after normalization)."""
    cleaned = normalize_number_token(text.upper())
    digits = re.sub(r"[^0-9.,]", "", cleaned)
    non_digits = re.sub(r"[0-9.,\s]", "", cleaned)
    return len(digits) > 0 and len(digits) >= len(non_digits)


def _stat_range_bonus(key: str, value: float, is_decimal: bool) -> float:
    """Bonus for values in the expected range for each stat type.

    PIU Phoenix shows judgment counts with leading zeros (e.g. ``004``).
    For great/good/bad/miss the values are typically small (0-100).
    Adding a range bonus helps the spatial matching prefer the correct
    small-count value over a nearby number like BPM.
    """
    if is_decimal:
        return 0.0
    v = int(value)
    if key in ("great", "good", "bad", "miss"):
        if v <= 50:
            return 20.0
        if v <= 500:
            return 8.0
    elif key == "perfect":
        if 50 <= v <= 5000:
            return 10.0
    elif key == "max_combo":
        if 10 <= v <= 5000:
            return 5.0
    return 0.0


def _line_is_score_number(line: OCRLine) -> bool:
    """Check if this OCR line looks like a large score number (not a stat count)."""
    val = parse_int_token(line.text)
    if val is not None and val >= 100000:
        return True
    return False


def _detect_bpm_values(lines: Sequence[OCRLine]) -> set:
    """Detect numbers that appear to be BPM values (near a 'BPM' label)."""
    bpm_values: set = set()
    bpm_lines: List[OCRLine] = []

    for line in lines:
        upper = normalize_space(line.text.upper())
        if "BPM" in upper or fuzz.partial_ratio(upper.replace(" ", ""), "BPM") >= 85:
            bpm_lines.append(line)
            # Try to extract inline BPM number
            cleaned = re.sub(r"[A-Z]", "", upper).strip()
            val = parse_int_token(cleaned)
            if val is not None and 30 <= val <= 400:
                bpm_values.add(val)

    # Also check for numbers spatially near BPM labels
    for bpm_line in bpm_lines:
        for line in lines:
            if id(line) == id(bpm_line):
                continue
            if abs(line.cy - bpm_line.cy) < bpm_line.h * 3.0 and _is_pure_number(line.text):
                val = parse_int_token(line.text)
                if val is not None and 30 <= val <= 400:
                    bpm_values.add(val)

    return bpm_values


def extract_stats_dynamic(lines: Sequence[OCRLine], image_h: float) -> Dict[str, Any]:
    """
    Dynamically extract stats from OCR lines without relying on fixed positions.

    Strategy:
    1. Classify each OCR line as either a label match or a potential number
    2. For each found label, find its associated number by spatial proximity
    3. Prefer numbers to the RIGHT of or BELOW the label on the same row
    """
    # Detect BPM values to exclude from stat matching
    bpm_values = _detect_bpm_values(lines)

    # Step 1: Find all label matches and all number-containing lines
    label_matches: Dict[str, List[Tuple[float, OCRLine]]] = {k: [] for k in STAT_ORDER}
    number_lines: List[OCRLine] = []

    for line in lines:
        # Skip lines that look like the main score (6+ digit numbers)
        if _line_is_score_number(line):
            continue

        # Try to match as a stat label
        match = _match_stat_label(line.text)
        if match:
            key, score = match
            label_matches[key].append((score, line))

        # Also check if this line contains a number (it can be both label + number)
        if _is_pure_number(line.text):
            number_lines.append(line)

    # Step 2: Pick the best label match for each stat
    found_labels: Dict[str, OCRLine] = {}
    used_label_lines: set = set()

    for key in STAT_ORDER:
        matches = label_matches[key]
        if not matches:
            continue
        # Sort by match quality descending
        matches.sort(key=lambda x: x[0], reverse=True)
        for score, line in matches:
            line_id = id(line)
            if line_id not in used_label_lines:
                found_labels[key] = line
                used_label_lines.add(line_id)
                break

    # Step 3: For each label, find its associated number
    stats: Dict[str, Any] = {}
    used_numbers: set = set()

    for key in STAT_ORDER:
        if key not in found_labels:
            continue

        label_line = found_labels[key]
        is_decimal = (key == "kcal")
        value: Optional[float] = None

        # Strategy A: Try to extract number inline from the label's own text
        # Handles cases like "PERFECT 986" or "986 PERFECT" in a single OCR line
        inline_val = _extract_number_from_text(label_line.text, allow_decimal=is_decimal)
        if inline_val is not None:
            value = inline_val
        else:
            # Strategy B: Find the nearest number line spatially
            # Use adaptive tolerance based on text height and image size
            row_tolerance = max(label_line.h * 2.5, image_h * 0.04, 30.0)

            best_candidate: Optional[Tuple[float, float, int]] = None  # (score, value, line_id)

            for num_line in number_lines:
                num_id = id(num_line)
                if num_id in used_numbers:
                    continue
                if num_id == id(label_line):
                    continue

                dy = abs(num_line.cy - label_line.cy)
                if dy > row_tolerance:
                    continue

                # Parse the number
                raw = normalize_number_token(num_line.text)
                if is_decimal:
                    v = parse_float_token(raw)
                else:
                    v = parse_int_token(raw)
                if v is None:
                    continue

                # Skip suspiciously large values that look like scores
                if not is_decimal and v >= 100000:
                    continue

                # Skip values that match detected BPM numbers
                if not is_decimal and int(v) in bpm_values:
                    continue

                # Score: prefer values to the right, close vertically,
                # and in the expected range for this stat type
                dx = num_line.cx - label_line.cx
                right_bonus = 25.0 if dx > 0 else 0.0
                y_closeness = max(0, row_tolerance - dy)
                range_bonus = _stat_range_bonus(key, float(v), is_decimal)
                proximity_score = right_bonus + y_closeness + (num_line.confidence * 5.0) + range_bonus

                if best_candidate is None or proximity_score > best_candidate[0]:
                    best_candidate = (proximity_score, float(v), num_id)

            if best_candidate is not None:
                value = best_candidate[1]
                used_numbers.add(best_candidate[2])

        if value is not None:
            stats[key] = round(value, 3) if is_decimal else int(round(value))

    return stats


def extract_stats_from_blob(lines: Sequence[OCRLine]) -> Dict[str, Any]:
    """
    Fallback: extract stats using regex on all OCR text combined.
    This catches cases where spatial association fails but the text is present.
    """
    blob = " ".join(normalize_space(line.text.upper()) for line in lines)
    stats: Dict[str, Any] = {}

    for key, label in STAT_LABELS.items():
        if key in stats:
            continue

        is_decimal = (key == "kcal")
        pattern = label.replace(" ", r"\s*")
        value: Optional[float] = None

        # Label followed by number
        if is_decimal:
            m = re.search(
                pattern + r"[^0-9]{0,15}([0-9OQDISBZ|l]{1,6}(?:[.,][0-9OQDISBZ|l]{1,3})?)",
                blob,
            )
            if m:
                value = parse_float_token(m.group(1))
        else:
            m = re.search(
                pattern + r"[^0-9]{0,15}([0-9OQDISBZ|l]{1,6})",
                blob,
            )
            if m:
                v = parse_int_token(m.group(1))
                if v is not None and v < 100000:
                    value = float(v)

        # Number followed by label (reversed)
        if value is None:
            if is_decimal:
                m = re.search(
                    r"([0-9OQDISBZ|l]{1,6}(?:[.,][0-9OQDISBZ|l]{1,3})?)[^0-9]{0,15}" + pattern,
                    blob,
                )
                if m:
                    value = parse_float_token(m.group(1))
            else:
                m = re.search(
                    r"([0-9OQDISBZ|l]{1,6})[^0-9]{0,15}" + pattern,
                    blob,
                )
                if m:
                    v = parse_int_token(m.group(1))
                    if v is not None and v < 100000:
                        value = float(v)

        if value is not None:
            stats[key] = round(value, 3) if is_decimal else int(round(value))

    return stats


def extract_stats_by_vertical_order(lines: Sequence[OCRLine], image_h: float) -> Dict[str, Any]:
    """
    Extract stats using the known vertical ordering of PIU result screens.

    PIU always shows stats top-to-bottom: PERFECT, GREAT, GOOD, BAD, MISS, MAX COMBO, KCAL.
    Find any recognized labels and use their Y positions to infer the vertical layout.
    Then find numbers at matching Y positions.
    """
    # Find all lines that match stat labels
    label_positions: List[Tuple[str, float, OCRLine]] = []  # (key, y, line)
    number_positions: List[Tuple[float, OCRLine]] = []  # (y, line)

    for line in lines:
        if _line_is_score_number(line):
            continue

        match = _match_stat_label(line.text)
        if match:
            key, score = match
            if score >= 60:
                label_positions.append((key, line.cy, line))

        if _is_pure_number(line.text):
            val = parse_int_token(line.text)
            if val is not None and val < 100000:
                number_positions.append((line.cy, line))
            elif parse_float_token(normalize_number_token(line.text)) is not None:
                number_positions.append((line.cy, line))

    if len(label_positions) < 2:
        return {}

    # Sort labels by Y position (top to bottom)
    label_positions.sort(key=lambda x: x[1])
    # Sort numbers by Y position
    number_positions.sort(key=lambda x: x[0])

    # De-duplicate labels — keep best match per key
    seen_keys: set = set()
    unique_labels: List[Tuple[str, float, OCRLine]] = []
    for key, y, line in label_positions:
        if key not in seen_keys:
            seen_keys.add(key)
            unique_labels.append((key, y, line))

    stats: Dict[str, Any] = {}
    used_numbers: set = set()

    for key, label_y, label_line in unique_labels:
        is_decimal = (key == "kcal")

        # Try inline first
        inline_val = _extract_number_from_text(label_line.text, allow_decimal=is_decimal)
        if inline_val is not None:
            stats[key] = round(inline_val, 3) if is_decimal else int(round(inline_val))
            continue

        # Find the nearest number at similar Y
        row_tolerance = max(label_line.h * 2.5, image_h * 0.04, 30.0)
        best: Optional[Tuple[float, float, int]] = None

        for num_y, num_line in number_positions:
            num_id = id(num_line)
            if num_id in used_numbers:
                continue

            dy = abs(num_y - label_y)
            if dy > row_tolerance:
                continue

            raw = normalize_number_token(num_line.text)
            if is_decimal:
                v = parse_float_token(raw)
            else:
                v = parse_int_token(raw)
            if v is None:
                continue
            if not is_decimal and v >= 100000:
                continue

            dx = num_line.cx - label_line.cx
            right_bonus = 25.0 if dx > 0 else 0.0
            y_closeness = max(0, row_tolerance - dy)
            range_bonus = _stat_range_bonus(key, float(v), is_decimal)
            score = right_bonus + y_closeness + (num_line.confidence * 5.0) + range_bonus

            if best is None or score > best[0]:
                best = (score, float(v), num_id)

        if best is not None:
            value = best[1]
            used_numbers.add(best[2])
            stats[key] = round(value, 3) if is_decimal else int(round(value))

    return stats


# ---------------------------------------------------------------------------
# Tiled OCR — split image into overlapping tiles for better small-text detection
# ---------------------------------------------------------------------------

def run_ocr_tiled(engine: OCREngine, image: np.ndarray, tiles: int = 4) -> List[OCRLine]:
    """
    Split image into overlapping tiles and run OCR on each.
    This helps when OCR misses small text in a large image.
    Coordinates are mapped back to the full image coordinate space.
    """
    h, w = image.shape[:2]
    all_lines: List[OCRLine] = []
    seen: set[Tuple[str, int, int]] = set()

    # Generate tile grid with 20% overlap
    rows = tiles
    cols = tiles
    tile_h = h // rows
    tile_w = w // cols
    overlap_y = int(tile_h * 0.2)
    overlap_x = int(tile_w * 0.2)

    for r in range(rows):
        for c in range(cols):
            y0 = max(0, r * tile_h - overlap_y)
            y1 = min(h, (r + 1) * tile_h + overlap_y)
            x0 = max(0, c * tile_w - overlap_x)
            x1 = min(w, (c + 1) * tile_w + overlap_x)

            tile = image[y0:y1, x0:x1]
            if tile.size == 0:
                continue

            # Run OCR on this tile
            lines = engine.run(tile)
            for line in lines:
                # Map coordinates back to full image
                mapped_box = line.box.copy()
                mapped_box[:, 0] += x0
                mapped_box[:, 1] += y0

                mapped = OCRLine(text=line.text, confidence=line.confidence, box=mapped_box)
                key = (
                    normalize_space(mapped.text.upper()),
                    int(round(mapped.cx / 8.0)),
                    int(round(mapped.cy / 8.0)),
                )
                if key in seen:
                    continue
                seen.add(key)
                all_lines.append(mapped)

    return sorted(all_lines, key=lambda x: (x.cy, x.cx))


# ---------------------------------------------------------------------------
# Quadrant-based OCR — focus on lower-left where stats typically appear
# ---------------------------------------------------------------------------

def run_ocr_quadrants(engine: OCREngine, image: np.ndarray) -> List[OCRLine]:
    """
    Run OCR on each quadrant of the image separately, then merge.
    This is a middle-ground between full-image and fixed-ROI.
    No position assumptions — we just split to give OCR smaller images.
    """
    h, w = image.shape[:2]
    all_lines: List[OCRLine] = []
    seen: set[Tuple[str, int, int]] = set()

    # Split into quadrants with overlap
    halves = [
        (0, 0, w, h // 2 + h // 10),            # Top half (+ overlap)
        (0, h // 2 - h // 10, w, h),             # Bottom half (+ overlap)
        (0, 0, w // 2 + w // 10, h),             # Left half (+ overlap)
        (w // 2 - w // 10, 0, w, h),             # Right half (+ overlap)
        (0, h // 3, w * 2 // 3, h),              # Lower-left 2/3
        (0, h // 4, w * 3 // 4, h * 3 // 4),    # Middle section
    ]

    for x0, y0, x1, y1 in halves:
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(w, x1), min(h, y1)
        region = image[y0:y1, x0:x1]
        if region.size == 0:
            continue

        # Run OCR with preprocessing variants on this region
        for variant in preprocess_variants(region):
            lines = engine.run(variant)
            for line in lines:
                mapped_box = line.box.copy()
                mapped_box[:, 0] += x0
                mapped_box[:, 1] += y0
                mapped = OCRLine(text=line.text, confidence=line.confidence, box=mapped_box)
                key = (
                    normalize_space(mapped.text.upper()),
                    int(round(mapped.cx / 8.0)),
                    int(round(mapped.cy / 8.0)),
                )
                if key in seen:
                    continue
                seen.add(key)
                all_lines.append(mapped)

    return sorted(all_lines, key=lambda x: (x.cy, x.cx))


# ---------------------------------------------------------------------------
# Main parse function — cascading strategies, all position-independent
# ---------------------------------------------------------------------------

def _count_found(stats: Dict[str, Any]) -> int:
    return sum(1 for v in stats.values() if v is not None)


def _merge_stats(base: Dict[str, Any], extra: Dict[str, Any]) -> Dict[str, Any]:
    """Fill in missing stats from extra into base."""
    merged = dict(base)
    for key in STAT_ORDER:
        if merged.get(key) is None and extra.get(key) is not None:
            merged[key] = extra[key]
    return merged


def parse_image(image_path: Path, engine: OCREngine, debug_dir: Optional[Path] = None) -> Dict[str, Any]:
    image = cv2.imread(str(image_path))
    if image is None:
        raise ValueError(f"Could not load image: {image_path}")

    img_h = float(image.shape[0])

    # Try to detect and correct perspective
    quad = detect_screen_quad(image)
    if quad is None:
        h, w = image.shape[:2]
        quad = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype=np.float32)
        screen_detected = False
    else:
        screen_detected = True

    warped = warp_screen(image, quad)
    warped_h = float(warped.shape[0])

    # ---- STEP 1: Full-image OCR (primary approach — no ROI cropping) ----
    # Run OCR on both the warped and original images
    warped_lines = run_ocr_multi(engine, warped)
    original_lines = run_ocr_multi(engine, image)

    # Combine all lines for title/mode/score extraction
    all_lines_warped = warped_lines
    all_lines_original = original_lines

    # Extract title, mode/level, score from all detected text
    song_title = extract_title(all_lines_warped) or extract_title(all_lines_original)
    mode_w, level_w = extract_mode_level(all_lines_warped)
    mode_o, level_o = extract_mode_level(all_lines_original)
    mode = mode_w or mode_o
    level = level_w or level_o
    score = extract_score(all_lines_warped) or extract_score(all_lines_original)

    # ---- STEP 2: Dynamic stat extraction on full images ----
    best_stats: Dict[str, Any] = {}
    best_count = 0

    # Try dynamic extraction on warped image
    stats = extract_stats_dynamic(all_lines_warped, warped_h)
    count = _count_found(stats)
    if count > best_count:
        best_stats = stats
        best_count = count

    # Try dynamic extraction on original image
    if best_count < 7:
        stats = extract_stats_dynamic(all_lines_original, img_h)
        count = _count_found(stats)
        if count > best_count:
            best_stats = stats
            best_count = count
        else:
            best_stats = _merge_stats(best_stats, stats)
            best_count = _count_found(best_stats)

    # Try vertical-order extraction
    if best_count < 7:
        stats = extract_stats_by_vertical_order(all_lines_warped, warped_h)
        count = _count_found(stats)
        if count > best_count:
            best_stats = stats
            best_count = count
        else:
            best_stats = _merge_stats(best_stats, stats)
            best_count = _count_found(best_stats)

    if best_count < 7:
        stats = extract_stats_by_vertical_order(all_lines_original, img_h)
        best_stats = _merge_stats(best_stats, stats)
        best_count = _count_found(best_stats)

    # ---- STEP 3: Blob-based regex extraction as fallback ----
    if best_count < 7:
        blob_stats = extract_stats_from_blob(all_lines_warped)
        best_stats = _merge_stats(best_stats, blob_stats)
        best_count = _count_found(best_stats)

    if best_count < 7:
        blob_stats = extract_stats_from_blob(all_lines_original)
        best_stats = _merge_stats(best_stats, blob_stats)
        best_count = _count_found(best_stats)

    # ---- STEP 4: Quadrant-based OCR for stubborn images ----
    if best_count < 5:
        quad_lines_warped = run_ocr_quadrants(engine, warped)
        stats = extract_stats_dynamic(quad_lines_warped, warped_h)
        best_stats = _merge_stats(best_stats, stats)
        best_count = _count_found(best_stats)

        if best_count < 5:
            stats = extract_stats_by_vertical_order(quad_lines_warped, warped_h)
            best_stats = _merge_stats(best_stats, stats)
            best_count = _count_found(best_stats)

        if best_count < 5:
            blob_stats = extract_stats_from_blob(quad_lines_warped)
            best_stats = _merge_stats(best_stats, blob_stats)
            best_count = _count_found(best_stats)

    if best_count < 5:
        quad_lines_orig = run_ocr_quadrants(engine, image)
        stats = extract_stats_dynamic(quad_lines_orig, img_h)
        best_stats = _merge_stats(best_stats, stats)
        best_count = _count_found(best_stats)

        if best_count < 5:
            blob_stats = extract_stats_from_blob(quad_lines_orig)
            best_stats = _merge_stats(best_stats, blob_stats)
            best_count = _count_found(best_stats)

    # ---- STEP 5: Tiled OCR — last resort for difficult images ----
    if best_count < 4:
        tiled_lines = run_ocr_tiled(engine, warped, tiles=3)
        stats = extract_stats_dynamic(tiled_lines, warped_h)
        best_stats = _merge_stats(best_stats, stats)
        best_count = _count_found(best_stats)

        blob_stats = extract_stats_from_blob(tiled_lines)
        best_stats = _merge_stats(best_stats, blob_stats)
        best_count = _count_found(best_stats)

    # Also try to get score from combined lines if ROI didn't find it
    if score is None:
        score = extract_score(all_lines_warped) or extract_score(all_lines_original)

    # Build final result
    breakdown = {
        "perfect": best_stats.get("perfect"),
        "great": best_stats.get("great"),
        "good": best_stats.get("good"),
        "bad": best_stats.get("bad"),
        "miss": best_stats.get("miss"),
        "max_combo": best_stats.get("max_combo"),
        "kcal": best_stats.get("kcal"),
    }

    result: Dict[str, Any] = {
        "source": str(image_path),
        "screen_detected": screen_detected,
        "song_title": song_title,
        "mode": mode,
        "level": level,
        "score": score,
        "breakdown": breakdown,
        # Flat fields for frontend compatibility
        **{k: v for k, v in breakdown.items()},
    }

    if debug_dir is not None:
        debug_dir.mkdir(parents=True, exist_ok=True)
        stem = image_path.stem
        cv2.imwrite(str(debug_dir / f"{stem}_01_quad.jpg"), draw_quad(image, quad))
        cv2.imwrite(str(debug_dir / f"{stem}_02_warped.jpg"), warped)

        all_ocr = {
            "warped_lines": [{"text": l.text, "confidence": l.confidence, "cx": l.cx, "cy": l.cy} for l in all_lines_warped],
            "original_lines": [{"text": l.text, "confidence": l.confidence, "cx": l.cx, "cy": l.cy} for l in all_lines_original],
        }
        (debug_dir / f"{stem}_ocr.json").write_text(json.dumps(all_ocr, indent=2), encoding="utf-8")

    return result


def draw_quad(image: np.ndarray, quad: np.ndarray) -> np.ndarray:
    out = image.copy()
    q = quad.astype(int)
    cv2.polylines(out, [q.reshape((-1, 1, 2))], True, (0, 255, 0), 4)
    return out


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
            results.append({
                "source": str(image_path),
                "error": str(exc),
            })

    payload: Any = results[0] if len(results) == 1 else results
    if args.pretty:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    else:
        print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
