"""Config and auth management.

Priority (highest first):
  1. CLI flags (--url, --token)
  2. TS_URL / TS_TOKEN env vars
  3. ~/.config/ts/config.json (written by `ts login`)
  4. ~/.transform_studio/desktop.json (written by desktop app on startup)
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

_CONFIG_PATH = Path.home() / ".config" / "ts" / "config.json"
_DESKTOP_STATE = Path.home() / ".transform_studio" / "desktop.json"


def _load_file() -> dict:
    if _CONFIG_PATH.exists():
        try:
            return json.loads(_CONFIG_PATH.read_text())
        except Exception:
            return {}
    return {}


def _load_desktop() -> dict:
    """Read port + token written by the desktop launcher on startup."""
    if _DESKTOP_STATE.exists():
        try:
            return json.loads(_DESKTOP_STATE.read_text())
        except Exception:
            return {}
    return {}


def get_url(override: Optional[str] = None) -> str:
    if override:
        return override.rstrip("/")
    v = (
        os.environ.get("TS_URL")
        or _load_file().get("url")
        or _load_desktop().get("url")
    )
    if not v:
        raise RuntimeError(
            "Transform Studio URL not set. "
            "Start the desktop app, or run `ts login --url http://localhost:8000`, "
            "or set TS_URL=http://localhost:8000"
        )
    return v.rstrip("/")


def get_token(override: Optional[str] = None) -> Optional[str]:
    if override:
        return override
    return (
        os.environ.get("TS_TOKEN")
        or _load_file().get("token")
        or _load_desktop().get("token")
    )


def save(url: str, token: str) -> None:
    _CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    _CONFIG_PATH.write_text(json.dumps({"url": url, "token": token}, indent=2))
    _CONFIG_PATH.chmod(0o600)


def clear() -> None:
    if _CONFIG_PATH.exists():
        _CONFIG_PATH.unlink()
