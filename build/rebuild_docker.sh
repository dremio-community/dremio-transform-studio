#!/usr/bin/env bash
# ── Rebuild and restart the Docker container (no cache) ──────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

echo "━━━ Building Docker image (no cache) ━━━"
docker build --no-cache -t mshainman/transform-studio:latest .
docker tag mshainman/transform-studio:latest transform-studio:latest

echo "━━━ Recreating container ━━━"
docker stop transform-studio 2>/dev/null || true
docker rm transform-studio 2>/dev/null || true
docker compose up -d

echo ""
echo "✅  Done! Open http://localhost:8000"
