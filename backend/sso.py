"""
SSO / OIDC integration for Transform Studio.

Supports any OIDC-compliant identity provider:
  - Google Workspace  (discovery: https://accounts.google.com)
  - Okta              (discovery: https://<domain>.okta.com)
  - Azure AD          (discovery: https://login.microsoftonline.com/<tenant>/v2.0)
  - Any other OIDC IdP via custom discovery URL

Flow:
  1. Admin configures provider in Settings → SSO tab (client_id, secret, discovery_url)
  2. User clicks "Sign in with <Provider>" on login screen
  3. GET /api/auth/sso/<provider>/login  → 302 to IdP authorization URL
  4. IdP redirects to GET /api/auth/sso/<provider>/callback?code=...&state=...
  5. Backend exchanges code → ID token → extracts email + name + sub
  6. Finds or creates local user (sso_provider + sso_sub columns)
  7. Issues normal JWT, redirects to /?sso_token=<JWT>
  8. Frontend picks up sso_token from URL on load and stores it
"""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import time
from typing import Optional
from urllib.parse import urlencode

import httpx

# In-memory state store for CSRF protection (state → provider, expires_at)
# Fine for single-instance; a shared Redis would be needed for multi-instance.
_pending_states: dict[str, dict] = {}
_DISCOVERY_CACHE: dict[str, dict] = {}
_DISCOVERY_CACHE_TTL = 3600  # 1 hour


# ── Provider icon/display map ─────────────────────────────────────────────────

PROVIDER_ICONS: dict[str, str] = {
    "google":    "https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg",
    "okta":      "https://www.okta.com/sites/default/files/Okta_Logo_BrightBlue_Medium.png",
    "azure":     "https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg",
    "microsoft": "https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg",
}

PROVIDER_LABELS: dict[str, str] = {
    "google":    "Google Workspace",
    "okta":      "Okta",
    "azure":     "Azure AD",
    "microsoft": "Microsoft",
}

# ── Discovery document ────────────────────────────────────────────────────────

async def _fetch_discovery(discovery_url: str) -> dict:
    """Fetch (and cache) the OIDC discovery document from /.well-known/openid-configuration."""
    cache_entry = _DISCOVERY_CACHE.get(discovery_url)
    if cache_entry and cache_entry["expires_at"] > time.time():
        return cache_entry["doc"]

    well_known = discovery_url.rstrip("/") + "/.well-known/openid-configuration"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(well_known)
        resp.raise_for_status()
        doc = resp.json()

    _DISCOVERY_CACHE[discovery_url] = {"doc": doc, "expires_at": time.time() + _DISCOVERY_CACHE_TTL}
    return doc


# ── Authorization URL ─────────────────────────────────────────────────────────

async def build_auth_url(provider_name: str, config: dict, redirect_uri: str) -> str:
    """Build the IdP authorization URL and register a CSRF state token."""
    discovery_url = config["discovery_url"]
    client_id = config["client_id"]

    doc = await _fetch_discovery(discovery_url)
    auth_endpoint = doc["authorization_endpoint"]

    state = secrets.token_urlsafe(32)
    _pending_states[state] = {
        "provider": provider_name,
        "expires_at": time.time() + 600,  # 10-minute window
    }

    params = {
        "client_id":     client_id,
        "redirect_uri":  redirect_uri,
        "response_type": "code",
        "scope":         "openid email profile",
        "state":         state,
        "prompt":        "select_account",
    }
    return f"{auth_endpoint}?{urlencode(params)}"


# ── Token exchange + user info ────────────────────────────────────────────────

async def exchange_code(
    provider_name: str,
    config: dict,
    code: str,
    state: str,
    redirect_uri: str,
) -> dict:
    """
    Validate state, exchange authorization code for tokens, return user info dict:
    { sub, email, name, given_name, family_name }
    """
    # Validate state
    pending = _pending_states.pop(state, None)
    if pending is None or pending["expires_at"] < time.time():
        raise ValueError("Invalid or expired state parameter — possible CSRF attack")
    if pending["provider"] != provider_name:
        raise ValueError("State provider mismatch")

    discovery_url = config["discovery_url"]
    doc = await _fetch_discovery(discovery_url)
    token_endpoint = doc["token_endpoint"]
    userinfo_endpoint = doc.get("userinfo_endpoint")

    async with httpx.AsyncClient(timeout=15.0) as client:
        # Exchange code for tokens
        token_resp = await client.post(token_endpoint, data={
            "grant_type":    "authorization_code",
            "code":          code,
            "redirect_uri":  redirect_uri,
            "client_id":     config["client_id"],
            "client_secret": config["client_secret"],
        })
        token_resp.raise_for_status()
        tokens = token_resp.json()

        access_token = tokens.get("access_token", "")
        id_token = tokens.get("id_token", "")

        # Decode ID token claims (no signature verification — we trust the IdP HTTPS TLS)
        user_info: dict = {}
        if id_token:
            try:
                payload_b64 = id_token.split(".")[1]
                # Pad base64
                payload_b64 += "=" * (4 - len(payload_b64) % 4)
                import base64
                user_info = json.loads(base64.urlsafe_b64decode(payload_b64))
            except Exception:
                pass

        # Supplement with userinfo endpoint if needed
        if userinfo_endpoint and access_token and not user_info.get("email"):
            ui_resp = await client.get(
                userinfo_endpoint,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if ui_resp.status_code == 200:
                user_info.update(ui_resp.json())

    if not user_info.get("email"):
        raise ValueError("IdP did not return an email address — check scopes include 'email'")

    return {
        "sub":         user_info.get("sub", ""),
        "email":       user_info.get("email", ""),
        "name":        user_info.get("name", user_info.get("email", "")),
        "given_name":  user_info.get("given_name", ""),
        "family_name": user_info.get("family_name", ""),
    }


# ── Redirect URI helper ───────────────────────────────────────────────────────

def get_redirect_uri(request_base_url: str, provider_name: str) -> str:
    """Build the absolute callback URL from the incoming request's base URL."""
    base = request_base_url.rstrip("/")
    return f"{base}/api/auth/sso/{provider_name}/callback"
