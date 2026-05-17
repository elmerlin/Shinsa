#!/usr/bin/env bash
# Shrink the bundled jackets in mobile/assets/jackets/pump to thumbnail size.
#
# Why: the source jackets are 700×393 JPEGs. The tier grid renders cells
# at ~60×37 px on mobile and expo-image was decoding bundled (numeric
# require) sources at full resolution — a single decoded bitmap is ~1.1 MB.
# With ~200 cells visible, that's ~220 MB of bitmap memory, which causes
# GC pressure and tanks scrolling. Resizing to 256 max gives us cells that
# read identically at thumbnail sizes and 99% smaller bitmap memory.
#
# Run after sync-jackets.sh and before each release build. Idempotent.
#
# Usage:
#   ./scripts/shrink-jackets.sh [maxDimension]
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
MOBILE_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
DEST_DIR="$MOBILE_DIR/assets/jackets/pump"

MAX_DIM="${1:-256}"

if [[ ! -d "$DEST_DIR" ]]; then
  echo "Jackets dir not found: $DEST_DIR" >&2
  echo "Run ./scripts/sync-jackets.sh first." >&2
  exit 1
fi

BEFORE_SIZE=$(du -sh "$DEST_DIR" | awk '{print $1}')
COUNT=$(find "$DEST_DIR" -maxdepth 1 \( -name '*.jpg' -o -name '*.png' \) | wc -l | tr -d ' ')

echo "→ shrinking $COUNT jackets to max ${MAX_DIM}px (was $BEFORE_SIZE total)"

# sips is single-threaded; parallelize 8-wide via xargs.
find "$DEST_DIR" -maxdepth 1 \( -name '*.jpg' -o -name '*.png' \) -print0 \
  | xargs -0 -n 1 -P 8 -I {} sips -Z "$MAX_DIM" -s formatOptions 80 "{}" --out "{}" >/dev/null

AFTER_SIZE=$(du -sh "$DEST_DIR" | awk '{print $1}')
echo "→ done. $BEFORE_SIZE → $AFTER_SIZE"
echo
echo "Rebuild the APK to pick up the smaller jackets."
