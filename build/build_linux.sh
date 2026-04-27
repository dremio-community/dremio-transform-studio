#!/usr/bin/env bash
# ── Dremio Transform Studio — Linux build ────────────────────────────────────
# Produces: dist/TransformStudio-linux.tar.gz  +  TransformStudio-linux.deb
# Requires: Python 3.9+, Node 18+, pip, dpkg-deb (for .deb)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "━━━ [1/4] Building React frontend ━━━"
cd frontend
npm ci
npm run build
cd ..

echo "━━━ [2/4] Installing Python dependencies ━━━"
pip3 install -r backend/requirements.txt pyinstaller --quiet

echo "━━━ [3/4] Running PyInstaller ━━━"
pyinstaller --clean --noconfirm transform_studio.spec

echo "━━━ [4/4] Packaging ━━━"

# --- tar.gz (universal) ---
TAR="dist/TransformStudio-linux.tar.gz"
tar -czf "$TAR" -C dist TransformStudio
echo "  → $TAR"

# --- .deb package (Debian / Ubuntu / Mint) ---
if command -v dpkg-deb &>/dev/null; then
  DEB_ROOT="dist/deb/transform-studio"
  BIN_DIR="$DEB_ROOT/usr/local/bin/transform-studio"
  DEST_DIR="$DEB_ROOT/opt/transform-studio"
  APPS_DIR="$DEB_ROOT/usr/share/applications"

  rm -rf "$DEB_ROOT"
  mkdir -p "$DEST_DIR" "$APPS_DIR" "$(dirname "$BIN_DIR")"

  # Copy app bundle
  cp -r dist/TransformStudio/. "$DEST_DIR/"

  # Launcher wrapper
  cat > "$BIN_DIR" << 'EOF'
#!/bin/bash
exec /opt/transform-studio/TransformStudio "$@"
EOF
  chmod +x "$BIN_DIR"

  # Desktop entry
  cat > "$APPS_DIR/transform-studio.desktop" << 'EOF'
[Desktop Entry]
Name=Transform Studio
Comment=Dremio Transform Studio — low-code pipeline builder
Exec=/opt/transform-studio/TransformStudio
Icon=utilities-terminal
Terminal=false
Type=Application
Categories=Development;DataScience;
EOF

  # Control file
  mkdir -p "$DEB_ROOT/DEBIAN"
  cat > "$DEB_ROOT/DEBIAN/control" << 'EOF'
Package: transform-studio
Version: 1.12.0
Section: devel
Priority: optional
Architecture: amd64
Maintainer: Mark Shainman <mark@shainman.com>
Description: Dremio Transform Studio
 Low-code SQL pipeline builder for Dremio.
EOF

  DEB="dist/TransformStudio-linux.deb"
  dpkg-deb --build "$DEB_ROOT" "$DEB"
  echo "  → $DEB"
fi

echo ""
echo "✅  Done!"
echo "   tar.gz: extract and run ./TransformStudio/TransformStudio"
if [ -f "dist/TransformStudio-linux.deb" ]; then
  echo "   .deb:   sudo dpkg -i dist/TransformStudio-linux.deb"
  echo "           then launch from app menu or run: transform-studio"
fi
