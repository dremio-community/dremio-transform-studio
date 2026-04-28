"""
Secrets resolution: environment variables and HashiCorp Vault (KV v2).

Supports two reference syntaxes anywhere in stored config values:
  ${ENV_VAR}               resolved from environment
  vault:secret/path#field  resolved from Vault KV v2
  prefix_${VAR}_suffix     inline substitution within a string

Vault config stored in app_settings under vault_* keys:
  vault_url, vault_auth_method, vault_token, vault_role_id,
  vault_secret_id, vault_namespace, vault_mount
"""
from __future__ import annotations

import os
import re
from typing import Any, Dict, Optional

_ENV_RE = re.compile(r"\$\{([^}]+)\}")
_VAULT_PREFIX = "vault:"


class VaultClient:
    def __init__(self, cfg: Dict[str, Any]):
        try:
            import hvac
        except ImportError:
            raise SystemExit(
                "hvac is required for Vault integration: pip install hvac"
            )

        url = cfg.get("url") or os.environ.get("VAULT_ADDR", "http://127.0.0.1:8200")
        namespace = cfg.get("namespace") or os.environ.get("VAULT_NAMESPACE", "")
        self._mount = cfg.get("mount", "secret")

        self._client = hvac.Client(url=url, namespace=namespace or None)
        auth_method = cfg.get("auth_method", "token")

        if auth_method == "approle":
            role_id = cfg.get("role_id") or os.environ.get("VAULT_ROLE_ID", "")
            secret_id = cfg.get("secret_id") or os.environ.get("VAULT_SECRET_ID", "")
            if not role_id or not secret_id:
                raise ValueError("Vault AppRole auth requires role_id and secret_id")
            self._client.auth.approle.login(role_id=role_id, secret_id=secret_id)
        else:
            token = cfg.get("token") or os.environ.get("VAULT_TOKEN", "")
            if not token:
                raise ValueError(
                    "Vault token auth requires a token (config 'token:' or VAULT_TOKEN env var)"
                )
            self._client.token = token

        if not self._client.is_authenticated():
            raise ValueError("Vault authentication failed — check credentials")

        self._cache: Dict[str, Dict[str, Any]] = {}

    def get(self, path: str, field: str) -> str:
        if path not in self._cache:
            resp = self._client.secrets.kv.v2.read_secret_version(
                path=path, mount_point=self._mount
            )
            self._cache[path] = resp["data"]["data"]
        secret_data = self._cache[path]
        if field not in secret_data:
            raise KeyError(f"Field '{field}' not found in Vault path '{path}'")
        return str(secret_data[field])


class SecretsResolver:
    def __init__(self, vault_client: Optional[VaultClient] = None):
        self._vault = vault_client

    def resolve(self, value: Any) -> Any:
        if not isinstance(value, str):
            return value

        if value.startswith(_VAULT_PREFIX):
            ref = value[len(_VAULT_PREFIX):]
            if "#" not in ref:
                raise ValueError(
                    f"Invalid vault reference '{value}' — expected vault:path#field"
                )
            path, field = ref.rsplit("#", 1)
            if self._vault is None:
                raise ValueError(
                    f"Vault reference '{value}' found but no Vault config provided"
                )
            return self._vault.get(path, field)

        def _sub(m: re.Match) -> str:
            var = m.group(1)
            val = os.environ.get(var)
            if val is None:
                return m.group(0)  # leave unresolved if var not set
            return val

        return _ENV_RE.sub(_sub, value)


# Module-level singleton — initialized at startup from DB vault config
_resolver: SecretsResolver = SecretsResolver()


def get_resolver() -> SecretsResolver:
    return _resolver


def init_resolver(vault_cfg: Optional[Dict[str, Any]] = None) -> None:
    """Call at startup after loading vault config from DB."""
    global _resolver
    vault_client = None
    if vault_cfg and vault_cfg.get("url"):
        try:
            vault_client = VaultClient(vault_cfg)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning(
                "Vault init failed — vault references will not resolve: %s", exc
            )
    _resolver = SecretsResolver(vault_client)


def resolve(value: Any) -> Any:
    """Resolve a single value using the module-level resolver."""
    return _resolver.resolve(value)
