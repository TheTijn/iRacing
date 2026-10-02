#!/usr/bin/env bash
# Transcode source race videos to browser-friendly 540p H.264 (+faststart) + a poster JPG.
# Usage: scripts/transcode.sh [CRF] [horses|dogs]   (default: both sports)
#   horses: "Test Videos/*.mp4" (MPEG-4 Part 2, 25fps) → public/assets/races/race-<id>.mp4, trimmed to 65s
#   dogs:   "Dog racing videos/*.mp4" (1080p30)        → public/assets/races/dogs/dog-<nn>.mp4, full length
set -euo pipefail
cd "$(dirname "$0")/.."
CRF="${1:-28}"
ONLY="${2:-}"

encode() { # src out poster gop [trim-seconds]
  local src="$1" out="$2" poster="$3" gop="$4" trim="${5:-}"
  ffmpeg -v error -y -i "$src" ${trim:+-t "$trim"} -an -vf scale=960:-2 \
    -c:v libx264 -profile:v high -preset slow -crf "$CRF" -pix_fmt yuv420p \
    -g "$gop" -movflags +faststart "$out"
  ffmpeg -v error -y -ss 0.2 -i "$src" -frames:v 1 -vf scale=960:-2 -q:v 4 "$poster"
}

if [[ -z "$ONLY" || "$ONLY" == horses ]]; then
  OUT="public/assets/races"
  mkdir -p "$OUT"
  for f in "Test Videos"/*.mp4; do
    id="$(basename "$f" .mp4 | sed -E 's/.*_([0-9]+)$/\1/')"
    echo "→ horses $id"
    encode "$f" "$OUT/race-$id.mp4" "$OUT/race-$id.jpg" 50 65
  done
fi

if [[ -z "$ONLY" || "$ONLY" == dogs ]]; then
  OUT="public/assets/races/dogs"
  mkdir -p "$OUT"
  for f in "Dog racing videos"/*.mp4; do
    id="$(basename "$f" .mp4 | sed -E 's/.*-([0-9]+)$/\1/')"
    echo "→ dogs $id"
    encode "$f" "$OUT/dog-$id.mp4" "$OUT/dog-$id.jpg" 60
  done
fi
ls -lh public/assets/races public/assets/races/dogs 2>/dev/null
