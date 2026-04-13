from __future__ import annotations
import httpx
from config import settings
from dremio_client import dremio_client


class CatalogClient:
    def _make_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=settings.dremio_base_url, timeout=30.0)

    async def _auth_headers(self) -> dict:
        token = await dremio_client._get_token()
        return dremio_client._auth_headers(token)

    def _catalog_base(self) -> str:
        """Returns the catalog base path — project-prefixed for Cloud, /api/v3 for self-hosted."""
        return f"{settings.api_prefix}/catalog" if settings.api_prefix else "/api/v3/catalog"

    async def _get_by_path(self, client: httpx.AsyncClient, headers: dict, path_parts: list[str]) -> dict:
        """Fetch a catalog entity by its path parts."""
        encoded = "/".join(p.replace("/", "%2F") for p in path_parts)
        resp = await client.get(f"{self._catalog_base()}/by-path/{encoded}", headers=headers)
        if resp.status_code == 404:
            return {}
        if not resp.is_success:
            return {}
        return resp.json()

    async def list_namespaces(self, parent: str | None = None) -> list[str]:
        """
        List top-level sources/spaces, or sub-folders within a namespace.
        Returns names of CONTAINERs (folders, sources, spaces).
        """
        headers = await self._auth_headers()
        async with self._make_client() as client:
            if parent is None:
                resp = await client.get(self._catalog_base(), headers=headers)
                if not resp.is_success:
                    return []
                data = resp.json()
                entries = data.get("data", [])
                result = []
                for entry in entries:
                    path = entry.get("path", [])
                    entity_type = entry.get("type", "")
                    if path and entity_type == "CONTAINER":
                        result.append(path[-1])
                return result
            else:
                path_parts = parent.split(".")
                data = await self._get_by_path(client, headers, path_parts)
                children = data.get("children", [])
                result = []
                for child in children:
                    child_type = child.get("type", "")
                    child_path = child.get("path", [])
                    if child_type == "CONTAINER" and child_path:
                        result.append(child_path[-1])
                return result

    async def list_tables(self, namespace: str) -> list[str]:
        """
        List datasets (tables/views) within a namespace path (dot-separated).
        Also returns sub-folders so the UI can browse deeper.
        Returns list of {name, type} dicts.
        """
        headers = await self._auth_headers()
        path_parts = namespace.split(".")
        async with self._make_client() as client:
            data = await self._get_by_path(client, headers, path_parts)
            children = data.get("children", [])
            result = []
            for child in children:
                child_type = child.get("type", "")
                child_path = child.get("path", [])
                if not child_path:
                    continue
                name = child_path[-1]
                if child_type == "DATASET":
                    result.append({"name": name, "type": "DATASET", "datasetType": child.get("datasetType", "")})
                elif child_type == "CONTAINER":
                    result.append({"name": name, "type": "CONTAINER"})
            return result

    async def get_table_schema(self, namespace: str, table: str) -> list[dict]:
        """
        Get fields for a table. namespace is dot-separated, table is the final name.
        """
        headers = await self._auth_headers()
        path_parts = namespace.split(".") + [table]
        async with self._make_client() as client:
            data = await self._get_by_path(client, headers, path_parts)
            fields = data.get("fields", [])
            result = []
            for f in fields:
                result.append({
                    "name": f.get("name", ""),
                    "type": f.get("type", {}).get("name", "UNKNOWN"),
                })
            return result


catalog_client = CatalogClient()
