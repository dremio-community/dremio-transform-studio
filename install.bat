@echo off
REM ── Dremio Transform Studio — Windows Docker Installer ─────────────────────
REM Requires Docker Desktop for Windows
setlocal

set DOCKER_IMAGE=mshainman/transform-studio:latest
set CONTAINER_NAME=transform-studio
set PORT=8000
set DATA_VOLUME=ts-data

echo.
echo ════════════════════════════════════════════════════
echo    Dremio Transform Studio — Installer
echo ════════════════════════════════════════════════════
echo.

REM Check Docker
docker info >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker is not running.
    echo.
    echo Install Docker Desktop from: https://www.docker.com/products/docker-desktop/
    echo Then re-run this script.
    pause
    exit /b 1
)
echo [OK] Docker is running

REM Stop existing container
docker stop %CONTAINER_NAME% >nul 2>&1
docker rm %CONTAINER_NAME% >nul 2>&1

REM Pull latest
echo Pulling latest image...
docker pull %DOCKER_IMAGE%

REM Start
echo Starting Transform Studio on port %PORT%...
docker run -d ^
  --name %CONTAINER_NAME% ^
  --restart unless-stopped ^
  -p %PORT%:8000 ^
  -v %DATA_VOLUME%:/data ^
  %DOCKER_IMAGE%

echo.
echo ════════════════════════════════════════════════════
echo  Transform Studio is running!
echo  Open: http://localhost:%PORT%
echo ════════════════════════════════════════════════════
echo.
echo  To stop:    docker stop %CONTAINER_NAME%
echo  To restart: docker start %CONTAINER_NAME%
echo  To update:  run this script again
echo.
timeout /t 2 >nul
start http://localhost:%PORT%
