"""Audit logging helper — fire-and-forget, never raises."""
from __future__ import annotations
from typing import Optional
from store import store


async def log_event(
    action: str,
    user: Optional[dict] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    resource_name: Optional[str] = None,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None,
) -> None:
    await store.write_audit_log(
        action=action,
        user_id=user.get("user_id") if user else None,
        username=user.get("username") if user else None,
        resource_type=resource_type,
        resource_id=resource_id,
        resource_name=resource_name,
        details=details,
        ip_address=ip_address,
    )
