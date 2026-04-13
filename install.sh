#!/usr/bin/env bash
# ── Dremio Transform Studio — Docker Installer ───────────────────────────────
# Run this on any Mac, Linux, or WSL machine with Docker installed:
#   curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/YOUR_REPO/main/install.sh | bash
#
# Or download and run locally:
#   chmod +x install.sh && ./install.sh

set -euo pipefail

DOCKER_IMAGE="mshainman/transform-studio:latest"
CONTAINER_NAME="transform-studio"
PORT="${TS_PORT:-8000}"
DATA_VOLUME="ts-data"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}   Dremio Transform Studio — Installer${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── Check Docker is installed ─────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "❌  Docker is not installed."
  echo ""
  echo "    Install Docker Desktop from: https://www.docker.com/products/docker-desktop/"
  echo "    Then re-run this script."
  exit 1
fi

if ! docker info &>/dev/null; then
  echo "❌  Docker is installed but not running."
  echo "    Please start Docker Desktop and re-run this script."
  exit 1
fi

echo -e "${GREEN}✓${NC}  Docker is running"

# ── Stop existing container if running ────────────────────────────────────────
if docker ps -q --filter "name=$CONTAINER_NAME" | grep -q .; then
  echo "   Stopping existing container..."
  docker stop "$CONTAINER_NAME" >/dev/null
fi
if docker ps -aq --filter "name=$CONTAINER_NAME" | grep -q .; then
  docker rm "$CONTAINER_NAME" >/dev/null
fi

# ── Pull latest image ─────────────────────────────────────────────────────────
echo "   Pulling latest image..."
docker pull "$DOCKER_IMAGE"

# ── Start container ───────────────────────────────────────────────────────────
echo "   Starting Transform Studio on port $PORT..."
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "$PORT:8000" \
  -v "$DATA_VOLUME:/data" \
  "$DOCKER_IMAGE"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅  Transform Studio is running!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "   Open in browser: ${BLUE}http://localhost:$PORT${NC}"
echo ""
echo "   To stop:    docker stop $CONTAINER_NAME"
echo "   To restart: docker start $CONTAINER_NAME"
echo "   To update:  ./install.sh"
echo ""
echo -e "${YELLOW}   First time? Click ⚙️  Settings to configure your Dremio connection.${NC}"
echo ""

# Auto-open browser if possible
if command -v open &>/dev/null; then          # Mac
  sleep 2 && open "http://localhost:$PORT" &
elif command -v xdg-open &>/dev/null; then    # Linux
  sleep 2 && xdg-open "http://localhost:$PORT" &
fi
