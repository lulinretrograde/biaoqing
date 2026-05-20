#!/usr/bin/env bash
# Drop a local image into the collection. Assigns next ID (>=10000).
# Converts non-jpg via ImageMagick if available.
set -euo pipefail

SRC="${1:-}"
[[ -n "$SRC" && -f "$SRC" ]] || { echo "usage: add.sh <image-file>" >&2; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMG="$ROOT/site/img"
mkdir -p "$IMG"

last=$(find "$IMG" -maxdepth 1 -name '*.jpg' -printf '%f\n' 2>/dev/null \
       | sed 's/\.jpg$//' \
       | grep -E '^[0-9]+$' \
       | awk '$1 >= 10000' \
       | sort -n | tail -1)
next=$(( ${last:-9999} + 1 ))
out="$IMG/$next.jpg"

ext="${SRC##*.}"
ext="${ext,,}"
case "$ext" in
  jpg|jpeg) cp "$SRC" "$out" ;;
  png|webp|gif|bmp|avif)
    if command -v magick >/dev/null; then magick "$SRC" "$out"
    elif command -v convert >/dev/null; then convert "$SRC" "$out"
    else echo "install imagemagick to convert $ext" >&2; exit 1
    fi ;;
  *) echo "unsupported: .$ext" >&2; exit 1 ;;
esac

echo "added #$next ($(stat -c%s "$out") bytes)"
"$ROOT/tools/regen-meta.sh"
