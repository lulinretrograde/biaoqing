#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMG="$ROOT/site/img"
META="$ROOT/site/meta.json"

ids=$(find "$IMG" -maxdepth 1 -name '*.jpg' -printf '%f\n' 2>/dev/null \
      | sed 's/\.jpg$//' \
      | grep -E '^[0-9]+$' \
      | sort -n \
      | paste -sd,)

if [[ -z "$ids" ]]; then
  echo '{"ids":[]}' > "$META"
  echo "no images in $IMG"
  exit 0
fi

echo "{\"ids\":[$ids]}" > "$META"
n=$(echo "$ids" | tr ',' '\n' | wc -l)
echo "wrote $META ($n ids)"
