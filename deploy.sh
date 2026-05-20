#!/usr/bin/env bash
# Pull latest, bump SW cache version, rebuild.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

git -C "$ROOT" pull

# Bump VERSION in sw.js to force PWA clients to flush cached shell
TS=$(date +%s)
sed -i "s/const VERSION = '[^']*'/const VERSION = 'v${TS}'/" "$ROOT/site/sw.js"
git -C "$ROOT" add "$ROOT/site/sw.js"
git -C "$ROOT" commit -m "bump sw version ${TS}" --allow-empty

docker compose -f "$ROOT/docker-compose.yml" up -d --build

# Optional ntfy notification on success
if [[ -n "${NTFY_URL:-}" ]]; then
  curl -s -d "biaoqing deployed" "$NTFY_URL" > /dev/null
fi

echo "deployed"
