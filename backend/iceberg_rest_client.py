"""
Iceberg REST Catalog client.

Implements the Iceberg REST Catalog spec (Apache Iceberg spec v1):
  GET  /v1/config
  GET  /v1/namespaces
  GET  /v1/namespaces/{ns}
  GET  /v1/namespaces/{ns}/tables
  GET  /v1/namespaces/{ns}/tables/{table}

Auth:
  - none
  - bearer: static Authorization: Bearer <token>
  - oauth2: POST /v1/oauth/tokens with client_id + client_secret (client_credentials grant)
  - dremio_pat: Dremio personal access token — Authorization: Bearer <pat>

Namespace encoding:
  The REST spec encodes multi-level namespaces as unit-separator (%1F) delimited strings.
  e.g. namespace ["db", "schema"] → URL path "db%1Fschema"
  Internally we represent namespaces as dot-separated strings for simplicity, e.g. "db.schema".
"""
from __future__ import annotations
import time
from typing import Generator, Optional
import httpx


class _SigV4Auth(httpx.Auth):
    """httpx auth class that signs every request with AWS SigV4 for the Glue service."""

    def __init__(self, access_key: str, secret_key: str, region: str, session_token: str = ""):
        import botocore.auth
        import botocore.credentials
        creds = botocore.credentials.Credentials(
            access_key=access_key,
            secret_key=secret_key,
            token=session_token or None,
        )
        self._signer = botocore.auth.SigV4Auth(creds, "glue", region)

    def auth_flow(self, request: httpx.Request) -> Generator:
        import botocore.awsrequest
        aws_req = botocore.awsrequest.AWSRequest(
            method=request.method,
            url=str(request.url),
            data=bytes(request.content),
            headers={k: v for k, v in request.headers.items()},
        )
        self._signer.add_auth(aws_req)
        for k, v in aws_req.headers.items():
            request.headers[k] = v
        yield request


# ── Namespace encoding ────────────────────────────────────────────────────────

UNIT_SEP = "\x1f"  # %1F


def ns_to_url(ns_dot: str) -> str:
    """'db.schema' → 'db%1Fschema' for use in URL paths."""
    parts = ns_dot.split(".")
    return UNIT_SEP.join(parts)


def ns_from_parts(parts: list[str]) -> str:
    """['db', 'schema'] → 'db.schema'"""
    return ".".join(parts)


# ── Iceberg field type normaliser ─────────────────────────────────────────────

def _type_name(t: object) -> str:
    """Return a human-readable type name from an Iceberg field type."""
    if isinstance(t, str):
        return t.upper()
    if isinstance(t, dict):
        kind = t.get("type", "")
        if kind == "list":
            return f"LIST<{_type_name(t.get('element-type', 'unknown'))}>"
        if kind == "map":
            return f"MAP<{_type_name(t.get('key-type', 'unknown'))},{_type_name(t.get('value-type', 'unknown'))}>"
        if kind == "struct":
            return "STRUCT"
        return kind.upper() or "UNKNOWN"
    return "UNKNOWN"


# ── Client ────────────────────────────────────────────────────────────────────

class IcebergRestClient:
    """
    A single configured connection to an Iceberg REST catalog.
    Pass config dict from the catalog_connections store.

    config keys:
      url               - base URL of the catalog, e.g. https://polaris.example.com/api/catalog
      warehouse         - warehouse name (sent as ?warehouse= query param)
      auth_type         - "none" | "bearer" | "oauth2" | "dremio_pat" | "sigv4"
      token             - for auth_type "bearer" or "dremio_pat"
      client_id         - for auth_type "oauth2"
      client_secret     - for auth_type "oauth2"
      oauth_scope       - for auth_type "oauth2", defaults to "PRINCIPAL_ROLE:ALL"
      prefix            - optional REST prefix, default "v1"
      aws_access_key_id     - for auth_type "sigv4"
      aws_secret_access_key - for auth_type "sigv4"
      aws_region            - for auth_type "sigv4", e.g. "us-east-1"
      aws_session_token     - for auth_type "sigv4", optional (temp credentials)
    """

    def __init__(self, config: dict):
        self.url = config["url"].rstrip("/")
        self.warehouse = config.get("warehouse", "")
        self.auth_type = config.get("auth_type", "none")
        self.token = config.get("token", "")
        self.client_id = config.get("client_id", "")
        self.client_secret = config.get("client_secret", "")
        self.oauth_scope = config.get("oauth_scope", "PRINCIPAL_ROLE:ALL")
        self.prefix = config.get("prefix", "v1").strip("/")
        self.aws_access_key_id = config.get("aws_access_key_id", "")
        self.aws_secret_access_key = config.get("aws_secret_access_key", "")
        self.aws_region = config.get("aws_region", "")
        self.aws_session_token = config.get("aws_session_token", "")

        self._cached_token: Optional[str] = None
        self._token_expires: float = 0.0
        self._sigv4_auth: Optional[_SigV4Auth] = None
        if self.auth_type == "sigv4":
            self._sigv4_auth = _SigV4Auth(
                self.aws_access_key_id,
                self.aws_secret_access_key,
                self.aws_region,
                self.aws_session_token,
            )

    def _api(self, path: str) -> str:
        return f"{self.url}/{self.prefix}/{path.lstrip('/')}"

    async def _get_token(self) -> str:
        if self.auth_type in ("bearer", "dremio_pat"):
            return self.token
        if self.auth_type == "oauth2":
            # Return cached token if still valid (with 60s buffer)
            if self._cached_token and time.time() < self._token_expires - 60:
                return self._cached_token
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    self._api("oauth/tokens"),
                    data={
                        "grant_type": "client_credentials",
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                        "scope": self.oauth_scope,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                self._cached_token = data["access_token"]
                self._token_expires = time.time() + data.get("expires_in", 3600)
                return self._cached_token
        return ""  # auth_type == "none" or "sigv4" (sigv4 uses httpx auth class, not a header token)

    async def _headers(self) -> dict:
        token = await self._get_token()
        h = {"Accept": "application/json", "Content-Type": "application/json"}
        if token:
            h["Authorization"] = f"Bearer {token}"
        return h

    def _client(self, timeout: float = 30.0) -> httpx.AsyncClient:
        """Return an AsyncClient pre-configured with SigV4 auth if applicable."""
        if self._sigv4_auth:
            return httpx.AsyncClient(timeout=timeout, auth=self._sigv4_auth)
        return httpx.AsyncClient(timeout=timeout)

    def _params(self, extra: dict | None = None) -> dict:
        p = {}
        if self.warehouse:
            p["warehouse"] = self.warehouse
        if extra:
            p.update(extra)
        return p

    async def test_connection(self) -> dict:
        """Test connectivity by calling /v1/config. Returns the config response."""
        headers = await self._headers()
        async with self._client(15.0) as client:
            resp = await client.get(self._api("config"), headers=headers, params=self._params())
            resp.raise_for_status()
            return resp.json()

    async def list_namespaces(self, parent: str | None = None) -> list[str]:
        """
        List namespaces. parent is dot-separated (e.g. 'db') or None for top-level.
        Returns list of dot-separated namespace strings.
        """
        headers = await self._headers()
        params = self._params()
        if parent:
            params["parent"] = ns_to_url(parent)

        async with self._client(30.0) as client:
            resp = await client.get(self._api("namespaces"), headers=headers, params=params)
            if resp.status_code == 404:
                return []
            resp.raise_for_status()
            data = resp.json()
            result = []
            for ns in data.get("namespaces", []):
                # ns is a list of parts e.g. ["db", "schema"] or ["db"]
                if isinstance(ns, list):
                    result.append(ns_from_parts(ns))
                elif isinstance(ns, str):
                    result.append(ns)
            return result

    async def list_tables(self, namespace: str) -> list[dict]:
        """
        List tables in a namespace (dot-separated). Returns [{name, type}].
        """
        headers = await self._headers()
        ns_encoded = ns_to_url(namespace)

        async with self._client(30.0) as client:
            resp = await client.get(
                self._api(f"namespaces/{ns_encoded}/tables"),
                headers=headers,
                params=self._params(),
            )
            if resp.status_code == 404:
                return []
            resp.raise_for_status()
            data = resp.json()
            result = []
            for ident in data.get("identifiers", []):
                name = ident.get("name", "")
                if name:
                    result.append({"name": name, "type": "DATASET", "datasetType": "ICEBERG"})
            return result

    async def get_table_schema(self, namespace: str, table: str) -> list[dict]:
        """
        Get fields for a table. Returns [{name, type}].
        """
        headers = await self._headers()
        ns_encoded = ns_to_url(namespace)

        async with self._client(30.0) as client:
            resp = await client.get(
                self._api(f"namespaces/{ns_encoded}/tables/{table}"),
                headers=headers,
                params=self._params(),
            )
            if resp.status_code == 404:
                return []
            resp.raise_for_status()
            data = resp.json()

        # Iceberg table metadata schema location
        metadata = data.get("metadata", {})
        schema = metadata.get("schema", metadata.get("current-schema", {}))
        fields = schema.get("fields", [])
        return [
            {"name": f.get("name", ""), "type": _type_name(f.get("type", "unknown"))}
            for f in fields
            if f.get("name")
        ]

    async def list_sub_namespaces(self, parent: str) -> list[dict]:
        """
        Return both sub-namespaces (as CONTAINER) and tables (as DATASET)
        under a given parent namespace.
        """
        sub_ns, tables = [], []
        try:
            sub_ns = await self.list_namespaces(parent=parent)
        except Exception:
            pass
        try:
            tables = await self.list_tables(parent)
        except Exception:
            pass

        result = []
        for ns in sub_ns:
            # Return just the leaf name, not the full path
            leaf = ns.split(".")[-1]
            result.append({"name": leaf, "type": "CONTAINER"})
        result.extend(tables)
        return result

    async def update_table_properties(self, namespace: str, table: str, properties: dict) -> None:
        """
        Stamp key/value properties on an Iceberg table via the REST catalog UpdateRequirements API.
        Uses the setProperties update action — leaves all other metadata unchanged.
        """
        headers = await self._headers()
        ns_encoded = ns_to_url(namespace)
        body = {
            "identifier": {"namespace": {"levels": namespace.split(".")}, "name": table},
            "requirements": [],
            "updates": [
                {
                    "action": "set-properties",
                    "updates": properties,
                }
            ],
        }
        async with self._client(15.0) as client:
            resp = await client.post(
                self._api(f"namespaces/{ns_encoded}/tables/{table}"),
                headers=headers,
                params=self._params(),
                json=body,
            )
            resp.raise_for_status()
