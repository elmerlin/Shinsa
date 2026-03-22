#!/bin/bash
# Download all .ssc simfiles from the PIU-Simfiles PHOENIX pack

set -e

REPO="rayden-61/PIU-Simfiles"
BRANCH="stepp1-phoenix"
BASE_PATH="16 - PHOENIX"
OUT_DIR="$(dirname "$0")/../public/presets/PHOENIX"

mkdir -p "$OUT_DIR"

echo "Fetching song list from GitHub..."

TREE_URL="https://api.github.com/repos/$REPO/contents/$(python3 -c "import urllib.parse; print(urllib.parse.quote('$BASE_PATH'))")?ref=$BRANCH"

# Fetch all folder names into a temp file
TMPFILE=$(mktemp)
curl -s "$TREE_URL" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for item in data:
    if item['type'] == 'dir':
        print(item['path'])
" > "$TMPFILE"

TOTAL=$(wc -l < "$TMPFILE" | tr -d ' ')
COUNT=0

echo "Found $TOTAL song folders. Downloading .ssc files..."

while IFS= read -r folder_path; do
    COUNT=$((COUNT + 1))

    ENCODED_FOLDER=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.stdin.read().strip()))" <<< "$folder_path")
    CONTENTS_URL="https://api.github.com/repos/$REPO/contents/$ENCODED_FOLDER?ref=$BRANCH"

    curl -s "$CONTENTS_URL" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if isinstance(data, list):
    for item in data:
        if item['name'].endswith('.ssc'):
            print(item['download_url'])
" 2>/dev/null | while IFS= read -r url; do
        FILENAME=$(python3 -c "import urllib.parse, sys; print(urllib.parse.unquote(sys.stdin.read().strip().split('/')[-1]))" <<< "$url")
        if [ ! -f "$OUT_DIR/$FILENAME" ]; then
            curl -sL "$url" -o "$OUT_DIR/$FILENAME"
            echo "[$COUNT/$TOTAL] Downloaded: $FILENAME"
        else
            echo "[$COUNT/$TOTAL] Exists: $FILENAME"
        fi
    done

done < "$TMPFILE"

rm -f "$TMPFILE"

echo "Done! Downloaded .ssc files to $OUT_DIR"
ls "$OUT_DIR" | wc -l | xargs -I{} echo "{} files total"
