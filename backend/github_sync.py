"""GitHub sync — push pipeline definitions to a GitHub repo as JSON files."""
from __future__ import annotations

import base64
import json
import re
from typing import Optional, TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from models import Pipeline

GITHUB_API = "https://api.github.com"


def _slug(name: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", name.lower())
    slug = re.sub(r"[\s_-]+", "_", slug).strip("_")
    return slug or "pipeline"


def _pipeline_to_json(pipeline: "Pipeline") -> str:
    data = pipeline.model_dump(exclude={
        "user_id", "shared_access", "owner_username",
        "github_synced_at", "github_sync_error",
        "webhook_token", "pending_approval_id",
    })
    return json.dumps(data, indent=2, default=str)


async def _get_file_sha(
    token: str, owner: str, repo: str, path: str, branch: str
) -> Optional[str]:
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }
    url = f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}?ref={branch}"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url, headers=headers)
        if r.status_code == 200:
            return r.json().get("sha")
        return None


async def push_pipeline(
    pipeline: "Pipeline",
    token: str,
    owner: str,
    repo: str,
    branch: str,
    directory: str,
) -> None:
    """Commit a single pipeline JSON file to GitHub. Creates or updates."""
    slug = _slug(pipeline.name)
    path = f"{directory.strip('/')}/{slug}.json"
    content_str = _pipeline_to_json(pipeline)
    encoded = base64.b64encode(content_str.encode()).decode()

    sha = await _get_file_sha(token, owner, repo, path, branch)

    payload: dict = {
        "message": f"chore: sync pipeline '{pipeline.name}'",
        "content": encoded,
        "branch": branch,
    }
    if sha:
        payload["sha"] = sha

    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }
    url = f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}"
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.put(url, headers=headers, json=payload)
        if r.status_code not in (200, 201):
            raise RuntimeError(f"GitHub {r.status_code}: {r.json().get('message', r.text[:200])}")


async def delete_pipeline(
    pipeline_name: str,
    token: str,
    owner: str,
    repo: str,
    branch: str,
    directory: str,
) -> None:
    """Delete a pipeline file from GitHub when the pipeline is deleted."""
    slug = _slug(pipeline_name)
    path = f"{directory.strip('/')}/{slug}.json"
    sha = await _get_file_sha(token, owner, repo, path, branch)
    if not sha:
        return

    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }
    payload = {
        "message": f"chore: remove pipeline '{pipeline_name}'",
        "sha": sha,
        "branch": branch,
    }
    url = f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}"
    async with httpx.AsyncClient(timeout=15) as client:
        await client.request("DELETE", url, headers=headers, json=payload)


async def test_connection(token: str, owner: str, repo: str) -> dict:
    """Verify token + repo access. Returns {ok, message}."""
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"{GITHUB_API}/repos/{owner}/{repo}", headers=headers)
    if r.status_code == 200:
        data = r.json()
        perms = data.get("permissions", {})
        can_push = perms.get("push", False)
        msg = f"Connected to {data['full_name']} ({data['default_branch']})"
        if not can_push:
            msg += " — WARNING: token has read-only access, cannot push"
        return {"ok": True, "message": msg}
    if r.status_code == 401:
        return {"ok": False, "message": "Invalid token — check your Personal Access Token"}
    if r.status_code == 404:
        return {"ok": False, "message": f"Repo '{owner}/{repo}' not found or not accessible with this token"}
    return {"ok": False, "message": f"GitHub API error {r.status_code}"}
