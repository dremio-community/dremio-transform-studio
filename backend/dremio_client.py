from __future__ import annotations
import asyncio
import time
import httpx
from config import settings


class DremioClient:
    def __init__(self):
        self._token: str | None = None
        self._token_ts: float = 0
        self._token_ttl: float = 3600  # 1 hour

    def _make_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=settings.dremio_base_url, timeout=60.0)

    # ── Auth ──────────────────────────────────────────────────────────────────

    def _is_pat(self) -> bool:
        return settings.dremio_auth_type == "pat"

    async def login(self) -> str:
        """Login with username/password. Returns session token."""
        async with self._make_client() as client:
            resp = await client.post(
                "/apiv2/login",
                json={"userName": settings.dremio_user, "password": settings.dremio_pass},
            )
            resp.raise_for_status()
            token = resp.json()["token"]
            self._token = token
            self._token_ts = time.time()
            return token

    async def _get_token(self) -> str:
        """Return a valid auth token (PAT or session token)."""
        if self._is_pat():
            return settings.dremio_pat
        if self._token is None or (time.time() - self._token_ts) > self._token_ttl:
            await self.login()
        return self._token  # type: ignore[return-value]

    def _auth_headers(self, token: str) -> dict:
        """Build the correct Authorization header for the auth type."""
        if self._is_pat():
            return {"Authorization": f"Bearer {token}"}
        return {"Authorization": f"_dremio{token}"}

    def invalidate_token(self) -> None:
        self._token = None
        self._token_ts = 0

    # ── SQL execution ─────────────────────────────────────────────────────────

    def _sql_path(self) -> str:
        return f"{settings.api_prefix}/sql" if settings.api_prefix else "/api/v3/sql"

    def _job_path(self, job_id: str) -> str:
        return f"{settings.api_prefix}/job/{job_id}" if settings.api_prefix else f"/api/v3/job/{job_id}"

    def _catalog_path(self) -> str:
        return f"{settings.api_prefix}/catalog" if settings.api_prefix else "/api/v3/catalog"

    async def sql(self, query: str, token: str) -> dict:
        async with self._make_client() as client:
            resp = await client.post(
                self._sql_path(),
                json={"sql": query},
                headers=self._auth_headers(token),
            )
            if resp.status_code == 401 and not self._is_pat():
                token = await self.login()
                resp = await client.post(
                    self._sql_path(),
                    json={"sql": query},
                    headers=self._auth_headers(token),
                )
            resp.raise_for_status()
            return resp.json()

    async def poll_job(self, job_id: str, token: str, timeout: int = 120) -> dict:
        deadline = time.time() + timeout
        async with self._make_client() as client:
            while time.time() < deadline:
                resp = await client.get(
                    self._job_path(job_id),
                    headers=self._auth_headers(token),
                )
                if resp.status_code == 401 and not self._is_pat():
                    token = await self.login()
                    continue
                resp.raise_for_status()
                data = resp.json()
                state = data.get("jobState", "")
                if state in ("COMPLETED", "FAILED", "CANCELED"):
                    return data
                await asyncio.sleep(0.5)
        raise TimeoutError(f"Job {job_id} did not complete within {timeout}s")

    async def job_results(self, job_id: str, token: str, offset: int = 0, limit: int = 500) -> dict:
        async with self._make_client() as client:
            resp = await client.get(
                f"{self._job_path(job_id)}/results",
                params={"offset": offset, "limit": limit},
                headers=self._auth_headers(token),
            )
            if resp.status_code == 401 and not self._is_pat():
                token = await self.login()
                resp = await client.get(
                    f"{self._job_path(job_id)}/results",
                    params={"offset": offset, "limit": limit},
                    headers=self._auth_headers(token),
                )
            resp.raise_for_status()
            return resp.json()

    async def run_ddl(self, query: str) -> None:
        """Execute a DDL statement (CREATE TABLE, etc.) and wait for completion.
        Does NOT attempt to fetch job results (DDL has none)."""
        token = await self._get_token()
        job_info = await self.sql(query, token)
        job_id = job_info["id"]
        result = await self.poll_job(job_id, token)
        if result.get("jobState") == "FAILED":
            error_msg = result.get("errorMessage", "Unknown error")
            raise RuntimeError(f"Dremio job failed: {error_msg}")

    async def run_query(self, query: str) -> list[dict]:
        token = await self._get_token()
        job_info = await self.sql(query, token)
        job_id = job_info["id"]
        result = await self.poll_job(job_id, token)
        if result.get("jobState") == "FAILED":
            error_msg = result.get("errorMessage", "Unknown error")
            raise RuntimeError(f"Dremio job failed: {error_msg}")
        rows_data = await self.job_results(job_id, token)
        rows = rows_data.get("rows", [])
        return rows

    async def test_connection(self) -> dict:
        """Test the current connection config. Returns {ok, message}."""
        try:
            if self._is_pat():
                if not settings.dremio_pat:
                    return {"ok": False, "message": "PAT is empty"}
                # Validate by calling the catalog endpoint
                async with self._make_client() as client:
                    resp = await client.get(
                        self._catalog_path(),
                        headers=self._auth_headers(settings.dremio_pat),
                    )
                    if resp.status_code == 401:
                        return {"ok": False, "message": "PAT is invalid or expired"}
                    if resp.status_code == 403:
                        return {"ok": False, "message": "PAT lacks required permissions"}
                    resp.raise_for_status()
                    return {"ok": True, "message": f"Connected to {settings.dremio_base_url}"}
            else:
                token = await self.login()
                if token:
                    return {"ok": True, "message": f"Connected to {settings.dremio_base_url}"}
                return {"ok": False, "message": "Login returned empty token"}
        except httpx.ConnectError:
            return {"ok": False, "message": f"Cannot reach {settings.dremio_base_url} — check host/port"}
        except httpx.HTTPStatusError as e:
            return {"ok": False, "message": f"HTTP {e.response.status_code}: {e.response.text[:200]}"}
        except Exception as e:
            return {"ok": False, "message": str(e)}


dremio_client = DremioClient()
