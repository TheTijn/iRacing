#!/usr/bin/env bash
# Transcode source race videos (MPEG-4 Part 2, not browser-playable) to H.264 + poster.
# Usage: scripts/transcode.sh [CRF]   (540p H.264, ~10MB per 65s race; sources in "Test Videos/")
set -euo pipefail
cd "$(dirname "$0")/.."
CRF="${1:-28}"
SRC="Test Videos"
OUT="public/assets/races"
mkdir -p "$OUT"
for f in "$SRC"/*.mp4; do
  id="$(basename "$f" .mp4 | sed -E 's/.*_([0-9]+)$/\1/')"
  echo "→ $id"
  ffmpeg -v error -y -i "$f" -t 65 -an -vf scale=960:-2 \
    -c:v libx264 -profile:v high -preset slow -crf "$CRF" -pix_fmt yuv420p \
    -g 50 -movflags +faststart "$OUT/race-$id.mp4"
  ffmpeg -v error -y -ss 0.2 -i "$f" -frames:v 1 -vf scale=960:-2 -q:v 4 "$OUT/race-$id.jpg"
done
ls -lh "$OUT"
