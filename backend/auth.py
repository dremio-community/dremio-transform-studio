from __future__ import annotations
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

SECRET_KEY = os.environ.get("JWT_SECRET", "transform-studio-dev-secret-change-in-prod")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24 * 7  # 1 week

# Runtime override for AUTH_ENABLED — set from DB on startup, toggled via API.
# None = not set, fall back to env var.
_auth_enabled_override: Optional[bool] = None


def set_auth_enabled_override(value: Optional[bool]) -> None:
    """Set the runtime auth_enabled state (overrides env var). Call on startup and on API toggle."""
    global _auth_enabled_override
    _auth_enabled_override = value

pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(user_id: str, username: str, is_admin: bool, role: str = "editor") -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": user_id,
        "username": username,
        "is_admin": is_admin,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            return None
        is_admin = bool(payload.get("is_admin", False))
        # Derive role: old tokens without role field fall back to is_admin check
        role = payload.get("role") or ("admin" if is_admin else "editor")
        return {
            "user_id": user_id,
            "username": payload.get("username", ""),
            "is_admin": is_admin,
            "role": role,
        }
    except JWTError:
        return None


def auth_enabled() -> bool:
    if _auth_enabled_override is not None:
        return _auth_enabled_override
    return os.environ.get("AUTH_ENABLED", "false").lower() == "true"


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Optional[dict]:
    """Returns current user dict or None if auth disabled. Raises 401 if auth enabled and token invalid."""
    if not auth_enabled():
        return {"user_id": "default", "username": "default", "is_admin": True, "role": "admin"}
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload


async def require_user(user: Optional[dict] = Depends(get_current_user)) -> dict:
    """Like get_current_user but always returns a user (raises if not authenticated)."""
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Require authenticated admin user."""
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
