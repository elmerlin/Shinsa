#!/bin/bash
# Download PixelLab-generated Pet Battle character assets
# Run from repo root: bash scripts/download-pet-battle-assets.sh

set -e

BASE_URL="https://backblaze.pixellab.ai/file/pixellab-characters/ab102b50-5637-475b-a557-0ceea5e739c2"
DEST="client/public/pet-battle/characters"

# Character ID registry: hero-role -> pixellab character UUID
declare -A CHARS=(
  # Dojocat variants
  ["dojocat-meatshield"]="358fbeab-ce1b-4b48-8e2c-26f2e9f65926"
  ["dojocat-brawler"]="cd6eb028-35eb-445c-8eb6-d875deff9280"
  ["dojocat-ranged"]="3c580d53-41c7-4d8f-9aca-86111248a50a"
  ["dojocat-tank"]="772757a0-847b-43d3-acc8-809ce2cc4532"
  # Buu variants
  ["buu-meatshield"]="f1768794-39a9-474e-a279-5cb617908e76"
  ["buu-brawler"]="a516b552-a0e5-4c8d-9b2b-20e584ffd6b4"
  ["buu-ranged"]="3679d6f9-8b2a-4d7d-9577-85d008ed2386"
  ["buu-tank"]="f896f8f2-df59-41dc-90de-63006d4abc3a"
  # Devit variants
  ["devit-meatshield"]="09c0c64c-5c33-498f-b268-8a46aabbd4cd"
  ["devit-brawler"]="66c96b1d-3627-439c-9d65-45554734a041"
  ["devit-ranged"]="660b98aa-f598-4749-a404-d5dbd6958c4b"
  ["devit-tank"]="f3014b90-ed33-4594-b629-e1e3e9a846a2"
  # Pixiu variants
  ["pixiu-meatshield"]="c17f0f99-0daf-47d3-adc1-4ddf1ae2f4af"
  ["pixiu-brawler"]="451a85a8-50cb-4c2a-b331-e5b4ae7e277c"
  ["pixiu-ranged"]="61cd5a60-1baa-4909-aa47-641f1c834552"
  ["pixiu-tank"]="4fb41b27-d463-4f5b-a816-3a133f54451a"
)

DIRECTIONS=("south" "east" "north" "west")

echo "=== Downloading Pet Battle character assets ==="

for key in "${!CHARS[@]}"; do
  uuid="${CHARS[$key]}"
  dir="$DEST/$key"
  mkdir -p "$dir"

  echo "--- $key ($uuid) ---"

  # Download rotation (idle) images
  for d in "${DIRECTIONS[@]}"; do
    out="$dir/idle_${d}.png"
    if [ ! -f "$out" ]; then
      url="$BASE_URL/$uuid/rotations/${d}.png"
      echo "  idle_${d}.png"
      curl -sf "$url" -o "$out" || echo "  WARN: failed idle_${d}"
    fi
  done

  # Download walk animation frames (if they exist)
  for d in "${DIRECTIONS[@]}"; do
    # Animation frames are at: /animations/walking-4-frames/{direction}/frame_N.png
    frame=0
    while true; do
      out="$dir/walk_${d}_${frame}.png"
      url="$BASE_URL/$uuid/animations/walking-4-frames/${d}/frame_${frame}.png"
      resp=$(curl -sf -o "$out" -w "%{http_code}" "$url" 2>/dev/null || echo "000")
      if [ "$resp" != "200" ] && [ "$resp" != "000" ]; then
        rm -f "$out"
        break
      fi
      if [ ! -s "$out" ]; then
        rm -f "$out"
        break
      fi
      echo "  walk_${d}_${frame}.png"
      frame=$((frame + 1))
      if [ $frame -gt 10 ]; then break; fi
    done
  done

  # Download attack animation frames
  for anim in "cross-punch" "fireball" "fight-stance-idle-8-frames" "falling-back-death"; do
    for d in "${DIRECTIONS[@]}"; do
      frame=0
      while true; do
        short="${anim//[-]/_}"
        out="$dir/${short}_${d}_${frame}.png"
        url="$BASE_URL/$uuid/animations/${anim}/${d}/frame_${frame}.png"
        resp=$(curl -sf -o "$out" -w "%{http_code}" "$url" 2>/dev/null || echo "000")
        if [ "$resp" != "200" ] && [ "$resp" != "000" ]; then
          rm -f "$out"
          break
        fi
        if [ ! -s "$out" ]; then
          rm -f "$out"
          break
        fi
        echo "  ${short}_${d}_${frame}.png"
        frame=$((frame + 1))
        if [ $frame -gt 20 ]; then break; fi
      done
    done
  done
done

echo ""
echo "=== Download complete ==="
echo "Assets saved to: $DEST"
find "$DEST" -name '*.png' | wc -l | xargs echo "Total PNG files:"
