@echo off
REM ── Dremio Transform Studio — Windows build ──────────────────────────────────
REM Produces: dist\TransformStudio-windows.exe  (single-file installer)
REM Requires: Python 3.9+, Node 18+, pip
setlocal enabledelayedexpansion

cd /d "%~dp0\.."

echo ━━━ [1/3] Building React frontend ━━━
cd frontend
call npm ci
call npm run build
cd ..
if errorlevel 1 ( echo ERROR: Frontend build failed & exit /b 1 )

echo ━━━ [2/3] Installing Python dependencies ━━━
pip install -r backend\requirements.txt pyinstaller --quiet
if errorlevel 1 ( echo ERROR: pip install failed & exit /b 1 )

echo ━━━ [3/3] Running PyInstaller ━━━
pyinstaller --clean --noconfirm transform_studio.spec
if errorlevel 1 ( echo ERROR: PyInstaller failed & exit /b 1 )

echo.
echo ✅  Done!
echo    Installer: dist\TransformStudio.exe
echo    Share this .exe — boss double-clicks it and the app opens in their browser.
