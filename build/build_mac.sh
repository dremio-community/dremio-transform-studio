#!/usr/bin/env bash
# ── Dremio Transform Studio — Mac build ──────────────────────────────────────
# Produces: dist/TransformStudio-mac.dmg
# Requires: Python 3.9+, Node 18+, pip, hdiutil (built into macOS)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "━━━ [1/4] Building React frontend ━━━"
cd frontend
npm install
npm run build
cd ..

echo "━━━ [2/4] Installing Python dependencies ━━━"
pip3 install -r backend/requirements.txt pyinstaller --quiet

echo "━━━ [3/4] Running PyInstaller ━━━"
pyinstaller --clean --noconfirm transform_studio.spec

echo "━━━ [4/4] Creating DMG ━━━"
DMG="dist/TransformStudio-mac.dmg"
rm -f "$DMG"
hdiutil create \
  -volname "Transform Studio" \
  -srcfolder "dist/TransformStudio.app" \
  -ov -format UDZO \
  "$DMG"

echo ""
echo "✅  Done!  →  $DMG"
echo "     Share this file — boss drags TransformStudio.app to /Applications and clicks it."
