"""
Dremio Transform Studio — Desktop Launcher
Starts the FastAPI server and opens the browser automatically.
This is the entry point used by PyInstaller.
"""
from __future__ import annotations
import os
import socket
import sys
import threading
import time
import webbrowser


def get_resource_path(relative_path: str) -> str:
    """Resolve path to a bundled resource (works both in dev and PyInstaller)."""
    if hasattr(sys, "_MEIPASS"):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), relative_path)


def find_free_port(start: int = 8000) -> int:
    """Find the first available TCP port starting from `start`."""
    for port in range(start, start + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return start  # fallback, may fail — but very unlikely


def open_browser(port: int) -> None:
    """Wait a moment for the server to start, then open the browser."""
    time.sleep(2.0)
    webbrowser.open(f"http://localhost:{port}")


def load_config(data_dir: str) -> dict:
    """Load ~/.transform_studio/config.json if it exists."""
    import json
    config_path = os.path.join(data_dir, "config.json")
    if os.path.exists(config_path):
        try:
            with open(config_path, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def main() -> None:
    # ── Data directory in user home ────────────────────────────────────────────
    data_dir = os.path.join(os.path.expanduser("~"), ".transform_studio")
    os.makedirs(data_dir, exist_ok=True)

    # Check config.json for a user-specified DB path; fall back to default
    config = load_config(data_dir)
    default_db = os.path.join(data_dir, "transforms.db")
    db_path = config.get("db_path") or default_db
    os.environ["DB_PATH"] = db_path
    os.environ["TS_DEFAULT_DB_PATH"] = default_db

    # Store the resource base so main.py can find the bundled frontend dist
    os.environ["_TS_RESOURCE_BASE"] = get_resource_path("")

    # Flag so the backend knows it's running as a desktop app (shows Quit button)
    os.environ["TS_DESKTOP_MODE"] = "1"

    # In a PyInstaller bundle sys._MEIPASS holds all frozen modules, but
    # uvicorn's string-based "main:app" import won't find them.  Fix: ensure
    # the bundle directory is on sys.path BEFORE importing main, then pass the
    # live app object (not a string) to uvicorn.
    bundle_dir = get_resource_path("")
    if bundle_dir not in sys.path:
        sys.path.insert(0, bundle_dir)

    # ── Port ───────────────────────────────────────────────────────────────────
    port = find_free_port(8000)

    # ── Open browser in background ─────────────────────────────────────────────
    threading.Thread(target=open_browser, args=(port,), daemon=True).start()

    # ── Start server ───────────────────────────────────────────────────────────
    # Import app *after* setting env vars so config/DB path are picked up.
    # Passing the object (not a string) avoids PyInstaller's import discovery issues.
    import uvicorn
    from main import app as fastapi_app  # noqa: E402  (late import intentional)
    uvicorn.run(
        fastapi_app,
        host="127.0.0.1",
        port=port,
        log_level="warning",
        reload=False,
    )


if __name__ == "__main__":
    main()
