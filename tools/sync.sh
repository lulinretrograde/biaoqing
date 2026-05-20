#!/usr/bin/env bash
# Pull upstream images from atanet90/expression-pack.
# Upstream IDs occupy 0..N-1; local IDs start at 10000.
set -euo pipefail

BASE="https://atanet90.github.io/expression-pack"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMG="$ROOT/site/img"
mkdir -p "$IMG"

remote=$(curl -fsSL "$BASE/meta" | tr -d '[:space:]')
[[ "$remote" =~ ^[0-9]+$ ]] || { echo "bad remote meta: $remote" >&2; exit 1; }
echo "upstream: $remote images"

seq 0 $((remote - 1)) | xargs -P 12 -I{} bash -c '
  out="'"$IMG"'/{}.jpg"
  [[ -s "$out" ]] && exit 0
  if curl -fsSL "'"$BASE"'/img/{}.jpg" -o "$out.tmp"; then
    mv "$out.tmp" "$out"
  else
    rm -f "$out.tmp"
  fi
'

"$ROOT/tools/regen-meta.sh"
