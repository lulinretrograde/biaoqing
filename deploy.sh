#!/usr/bin/env bash
# Pull latest, rebuild with auto-stamped SW version.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

git -C "$ROOT" pull

SW_VERSION="$(git -C "$ROOT" rev-parse --short HEAD)-$(date +%s)"
export SW_VERSION

docker compose -f "$ROOT/docker-compose.yml" up -d --build

# Optional ntfy notification on success
if [[ -n "${NTFY_URL:-}" ]]; then
  curl -s -d "biaoqing deployed ${SW_VERSION}" "$NTFY_URL" > /dev/null
fi

echo "deployed ${SW_VERSION}"
