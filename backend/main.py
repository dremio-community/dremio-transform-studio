from __future__ import annotations
import asyncio as _asyncio
import os
import signal
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import csv
import io
import json as _json_mod
import shutil
import tempfile

import uuid as _uuid_mod
from fastapi import FastAPI, HTTPException, Query, Depends, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from pydantic import BaseModel

from auth import (
    auth_enabled,
    get_current_user,
    require_admin,
    require_user,
    hash_password,
    verify_password,
    create_token,
)
from catalog_client import catalog_client
from config import settings
from dremio_client import dremio_client
from iceberg_rest_client import IcebergRestClient
from models import (
    ExecuteResult,
    Pipeline,
    PipelineCreate,
    PipelineSave,
    PipelineParameter,
    PipelineTest,
    PreviewResult,
    TestResult,
    TransformStep,
    TransformType,
    DagPipelineResult,
    DagExecuteResult,
    Environment,
    EnvironmentCreate,
    SeedResult,
    PipelineApproval,
    ApprovalReview,
    SubmitReview,
    DashboardPipeline,
)
from scheduler import scheduler
from store import store
from transforms import registry as reg
from transforms.codegen import compile_execute, compile_incremental, compile_pipeline, compile_scd2, compute_column_lineage
from test_runner import run_pipeline_tests, summarize_results
from dag_utils import build_dag_response, get_run_order_for_pipeline, find_cycles


@asynccontextmanager
async def lifespan(app: FastAPI):
    await store.init()
    await store.load_connection_settings()  # restore persisted connection config
    await store.seed_admin_if_empty()
    await scheduler.start()
    yield
    await scheduler.stop()


app = FastAPI(
    title="Dremio Transform Studio",
    version="1.3.0",
    description=(
        "Low-code SQL pipeline builder on top of Dremio. "
        "Build, preview, execute, schedule, and test data transformation pipelines "
        "without writing SQL manually. Supports cross-pipeline DAGs, incremental models, "
        "pipeline tests, CSV seeding, multi-environment connections, and Iceberg metadata push.\n\n"
        "All endpoints require a Bearer JWT token when `AUTH_ENABLED=true`. "
        "When auth is disabled (default), all requests are accepted without a token."
    ),
    openapi_tags=[
        {"name": "pipelines", "description": "Create, read, update, delete, preview, execute, and test pipelines."},
        {"name": "dag", "description": "Cross-pipeline dependency graph and orchestrated execution."},
        {"name": "catalog", "description": "Browse the Dremio namespace and table schemas."},
        {"name": "transforms", "description": "List available transform types and their configuration schema."},
        {"name": "schedules", "description": "Cron-based pipeline schedules."},
        {"name": "seeds", "description": "Upload CSV files and create Dremio tables from them."},
        {"name": "environments", "description": "Named Dremio connection profiles (dev/staging/prod)."},
        {"name": "alerts", "description": "Data quality and pipeline health alerting."},
        {"name": "iceberg", "description": "Iceberg REST catalog connections and browsing."},
        {"name": "auth", "description": "Authentication and user management."},
        {"name": "system", "description": "Health, settings, desktop mode."},
    ],
    lifespan=lifespan,
)

_origins = settings.allowed_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=_origins != ["*"],  # credentials + wildcard is invalid per CORS spec
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Auth ─────────────────────────────────────────────────────────────────────

class LoginBody(BaseModel):
    username: str
    password: str


class CreateUserBody(BaseModel):
    username: str
    password: str
    is_admin: bool = False


@app.get("/api/auth/status", tags=["auth"], summary="Check whether authentication is enabled")
async def auth_status() -> dict:
    """Returns `auth_enabled` (bool) and the API version. Call this first to decide whether to present a login screen."""
    return {"auth_enabled": auth_enabled(), "version": "1.0"}


@app.post("/api/auth/login", tags=["auth"], summary="Log in and obtain a JWT token")
async def auth_login(body: LoginBody) -> dict:
    """Exchange username + password for a JWT Bearer token. Include the token as `Authorization: Bearer <token>` on all subsequent requests when auth is enabled."""
    user = await store.get_user_by_username(body.username)
    if user is None or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_token(user["id"], user["username"], bool(user["is_admin"]))
    return {
        "token": token,
        "user": {"id": user["id"], "username": user["username"], "is_admin": bool(user["is_admin"])},
    }


@app.post("/api/auth/logout", tags=["auth"], summary="Log out (invalidates client-side token)")
async def auth_logout() -> dict:
    """Client should discard its JWT token. Server is stateless so this is a no-op server-side."""
    return {"ok": True}


@app.get("/api/auth/me", tags=["auth"], summary="Get the currently authenticated user")
async def auth_me(current_user: dict = Depends(get_current_user)) -> dict:
    """Returns `user_id`, `username`, and `is_admin` for the bearer token owner."""
    if current_user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return current_user


@app.get("/api/auth/users", tags=["auth"], summary="List all users (admin only)")
async def list_users(current_user: dict = Depends(require_admin)) -> list:
    """Returns all registered users. Requires admin privileges."""
    return await store.list_users()


@app.post("/api/auth/users", status_code=201, tags=["auth"], summary="Create a new user (admin only)")
async def create_user(body: CreateUserBody, current_user: dict = Depends(require_admin)) -> dict:
    """Create a new user account. Set `is_admin: true` to grant admin privileges."""
    existing = await store.get_user_by_username(body.username)
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    pw_hash = hash_password(body.password)
    user = await store.create_user(body.username, pw_hash, body.is_admin)
    return {"id": user["id"], "username": user["username"], "is_admin": user["is_admin"], "created_at": user["created_at"]}


@app.delete("/api/auth/users/{user_id}", tags=["auth"], summary="Delete a user (admin only)")
async def delete_user(user_id: str, current_user: dict = Depends(require_admin)) -> dict:
    """Permanently delete a user account. Cannot delete your own account."""
    if user_id == current_user["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    await store.delete_user(user_id)
    return {"deleted": True}


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health", tags=["system"], summary="Health check — tests Dremio connectivity")
async def health() -> dict:
    """Returns `status: ok` and `dremio: true/false`. Use this to verify the backend is reachable and the Dremio connection is healthy before running pipelines."""
    result = await dremio_client.test_connection()
    return {"status": "ok", "dremio": result["ok"]}


@app.get("/api/is-desktop")
async def is_desktop() -> dict:
    """Returns whether the app is running as a packaged desktop app."""
    return {"desktop": os.environ.get("TS_DESKTOP_MODE") == "1"}


@app.post("/api/quit")
async def quit_app() -> dict:
    """Gracefully shut down the desktop app server."""
    if os.environ.get("TS_DESKTOP_MODE") != "1":
        raise HTTPException(status_code=403, detail="Only available in desktop mode")
    def _shutdown():
        time.sleep(0.5)
        os.kill(os.getpid(), signal.SIGTERM)
    threading.Thread(target=_shutdown, daemon=True).start()
    return {"status": "shutting_down"}


class StorageSettings(BaseModel):
    db_path: str


@app.get("/api/settings/storage")
async def get_storage_settings() -> dict:
    """Return current DB path info."""
    import json as _json
    current = os.environ.get("DB_PATH", "")
    default = os.environ.get("TS_DEFAULT_DB_PATH", current)
    return {
        "db_path": current,
        "default_db_path": default,
        "is_custom": current != default,
        "is_desktop": os.environ.get("TS_DESKTOP_MODE") == "1",
    }


@app.put("/api/settings/storage")
async def save_storage_settings(body: StorageSettings) -> dict:
    """Save custom DB path to config.json — takes effect after restart."""
    import json as _json
    if os.environ.get("TS_DESKTOP_MODE") != "1":
        raise HTTPException(status_code=403, detail="Only available in desktop mode")
    new_path = body.db_path.strip()
    if not new_path:
        raise HTTPException(status_code=400, detail="Path cannot be empty")
    # Ensure the directory exists
    db_dir = os.path.dirname(new_path)
    if db_dir:
        try:
            os.makedirs(db_dir, exist_ok=True)
        except OSError as e:
            raise HTTPException(status_code=400, detail=f"Cannot create directory: {e}")
    # Save to config.json in the default data dir
    data_dir = os.path.dirname(os.environ.get("TS_DEFAULT_DB_PATH", new_path))
    config_path = os.path.join(data_dir, "config.json")
    default = os.environ.get("TS_DEFAULT_DB_PATH", "")
    config = {"db_path": new_path if new_path != default else None}
    with open(config_path, "w") as f:
        _json.dump(config, f, indent=2)
    return {"saved": True, "db_path": new_path, "restart_required": True}


@app.get("/api/admin/backup", tags=["system"], summary="Download the full SQLite database as a backup file")
async def download_backup(current_user: dict = Depends(get_current_user)):
    """Downloads the SQLite database file containing all pipelines, settings, run history, and users.
    Use this to back up your data before stopping a Docker container without a volume mount."""
    db_path = os.path.abspath(settings.db_path)
    if not os.path.exists(db_path):
        raise HTTPException(404, "Database file not found")
    filename = f"transform-studio-backup-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.db"
    return FileResponse(
        db_path,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/admin/restore", tags=["system"], summary="Restore the database from a backup file (admin only)")
async def restore_backup(file: UploadFile = File(...), current_user: dict = Depends(require_admin)):
    """Replaces the current database with an uploaded backup file. The app must be restarted for
    the restored data to take effect. Only accepts valid SQLite database files."""
    content = await file.read()
    if not content.startswith(b"SQLite format 3"):
        raise HTTPException(400, "Not a valid SQLite database file")
    db_path = os.path.abspath(settings.db_path)
    tmp_fd, tmp_path = tempfile.mkstemp(dir=os.path.dirname(db_path), suffix=".tmp")
    try:
        os.write(tmp_fd, content)
        os.close(tmp_fd)
        shutil.move(tmp_path, db_path)
    except Exception:
        try:
            os.close(tmp_fd)
        except Exception:
            pass
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise
    return {"restored": True, "restart_required": True}


# ── Transforms ────────────────────────────────────────────────────────────────

@app.get("/api/transforms", tags=["transforms"], summary="List all available transform types", response_model=list[TransformType])
async def list_transforms():
    """Returns all 52 built-in transform types grouped by category (clean, reshape, datetime, enrich, aggregate, string, custom). Each entry includes the transform `id`, `name`, `description`, and `config_schema` describing its parameters."""
    return reg.list_transforms()


@app.get("/api/transforms/{transform_id}", tags=["transforms"], summary="Get a single transform type by ID", response_model=TransformType)
async def get_transform(transform_id: str):
    """Returns the full definition for a single transform type, including its `config_schema`. Use this to understand what parameters a transform requires before adding it to a pipeline."""
    try:
        return reg.get_transform(transform_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Alerts ───────────────────────────────────────────────────────────────────

class AlertCreate(BaseModel):
    name: str
    description: str = ""
    alert_type: str  # 'sql' | 'pipeline_health' | 'data_quality'
    config_json: str  # JSON string
    schedule: str
    enabled: bool = True
    notify_email: bool = True
    notify_slack: bool = True


class AlertUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    alert_type: Optional[str] = None
    config_json: Optional[str] = None
    schedule: Optional[str] = None
    enabled: Optional[bool] = None
    notify_email: Optional[bool] = None
    notify_slack: Optional[bool] = None


# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.get("/api/dashboard", tags=["dashboard"], summary="Pipeline health dashboard")
async def get_dashboard(user=Depends(require_user)):
    """Returns all pipelines with health status, last run, success rate, and schedule."""
    return await store.get_dashboard_stats()


# ── Approval Workflow ──────────────────────────────────────────────────────────

@app.get("/api/approvals", tags=["approvals"], summary="List pipeline approvals")
async def list_approvals(status: Optional[str] = None, user=Depends(require_user)):
    """Returns approval records. Filter by status=pending|approved|rejected."""
    return await store.list_approvals(status=status)


@app.get("/api/approvals/{approval_id}", tags=["approvals"])
async def get_approval(approval_id: str, user=Depends(require_user)):
    approval = await store.get_approval(approval_id)
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")
    return approval


@app.post("/api/pipelines/{pipeline_id}/submit-review", status_code=201, tags=["approvals"])
async def submit_pipeline_review(
    pipeline_id: str,
    body: SubmitReview,
    user=Depends(require_user),
):
    """Submit proposed pipeline changes for approval instead of saving directly."""
    pipeline = await store.get_pipeline(pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    current_steps = [s.dict() for s in pipeline.steps]
    proposed_steps = [s.dict() for s in body.steps]
    approval = await store.create_approval(
        pipeline_id=pipeline_id,
        pipeline_name=pipeline.name,
        proposed_steps=proposed_steps,
        current_steps=current_steps,
        submitted_by=user.get("username", user.get("user_id", "unknown")),
    )
    return approval


@app.post("/api/approvals/{approval_id}/approve", tags=["approvals"])
async def approve_pipeline(
    approval_id: str,
    body: ApprovalReview,
    user=Depends(require_admin),
):
    """Admin approves proposed pipeline changes — applies them as a new version."""
    reviewer = user.get("username", user.get("user_id", "unknown"))
    result = await store.resolve_approval(
        approval_id=approval_id,
        new_status="approved",
        reviewed_by=reviewer,
        comments=body.comments,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Approval not found or already resolved")
    return result


@app.post("/api/approvals/{approval_id}/reject", tags=["approvals"])
async def reject_pipeline(
    approval_id: str,
    body: ApprovalReview,
    user=Depends(require_admin),
):
    """Admin rejects proposed pipeline changes."""
    reviewer = user.get("username", user.get("user_id", "unknown"))
    result = await store.resolve_approval(
        approval_id=approval_id,
        new_status="rejected",
        reviewed_by=reviewer,
        comments=body.comments,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Approval not found or already resolved")
    return result


@app.put("/api/pipelines/{pipeline_id}/approval-required", tags=["approvals"])
async def set_approval_required(
    pipeline_id: str,
    body: dict,
    user=Depends(require_admin),
):
    """Admin toggles whether a pipeline requires approval before changes go live."""
    required = bool(body.get("required", False))
    await store.set_approval_required(pipeline_id, required)
    return {"pipeline_id": pipeline_id, "approval_required": required}


@app.get("/api/alerts", tags=["alerts"], summary="List all alerts")
async def list_alerts():
    """Returns all configured alerts with type, schedule, enabled status, and last run info."""
    return await store.list_alerts()


@app.post("/api/alerts", status_code=201, tags=["alerts"], summary="Create a new alert")
async def create_alert(body: AlertCreate):
    """Create a data quality or pipeline health alert. `alert_type`: `custom_sql`, `pipeline_health`, or `data_quality`. Runs on a cron schedule with optional email/Slack notifications."""
    return await store.create_alert(body.model_dump())


@app.get("/api/alerts/{alert_id}", tags=["alerts"], summary="Get a single alert")
async def get_alert(alert_id: str):
    alert = await store.get_alert(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@app.put("/api/alerts/{alert_id}", tags=["alerts"], summary="Update an alert")
async def update_alert(alert_id: str, body: AlertUpdate):
    """Update alert fields. Only include the fields you want to change."""
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    updated = await store.update_alert(alert_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="Alert not found")
    return updated


@app.delete("/api/alerts/{alert_id}", status_code=204, response_model=None, tags=["alerts"], summary="Delete an alert")
async def delete_alert(alert_id: str):
    ok = await store.delete_alert(alert_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Alert not found")


@app.get("/api/alerts/{alert_id}/history", tags=["alerts"], summary="Get alert run history")
async def get_alert_history(alert_id: str):
    """Returns the last N evaluation results for this alert, including triggered status and message."""
    return await store.get_alert_history(alert_id)


@app.post("/api/alerts/{alert_id}/run", tags=["alerts"], summary="Manually trigger an alert evaluation")
async def run_alert_now(alert_id: str):
    """Immediately evaluate the alert and record the result. Returns `status` (ok/triggered/error) and a `message`."""
    from alert_runner import run_alert
    alert = await store.get_alert(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    status, message = await run_alert(alert, store, dremio_client)
    await store.record_alert_check(alert_id, alert.get("name", alert_id), status, message)
    return {"status": status, "message": message}


@app.get("/api/alert-history")
async def get_all_alert_history():
    return await store.get_all_alert_history()


# ── Custom SQL Transform Templates ───────────────────────────────────────────

class CustomTransformCreate(BaseModel):
    name: str
    description: str = ""
    sql_template: str
    tags: str = ""


class CustomTransformUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sql_template: Optional[str] = None
    tags: Optional[str] = None


@app.get("/api/custom-transforms")
async def list_custom_transforms(search: Optional[str] = Query(None)):
    return await store.list_custom_transforms(search=search)


@app.post("/api/custom-transforms", status_code=201)
async def create_custom_transform(body: CustomTransformCreate):
    return await store.create_custom_transform(body.model_dump())


@app.get("/api/custom-transforms/{ct_id}")
async def get_custom_transform(ct_id: str):
    ct = await store.get_custom_transform(ct_id)
    if ct is None:
        raise HTTPException(status_code=404, detail="Custom transform not found")
    return ct


@app.put("/api/custom-transforms/{ct_id}")
async def update_custom_transform(ct_id: str, body: CustomTransformUpdate):
    updated = await store.update_custom_transform(ct_id, {k: v for k, v in body.model_dump().items() if v is not None})
    if updated is None:
        raise HTTPException(status_code=404, detail="Custom transform not found")
    return updated


@app.delete("/api/custom-transforms/{ct_id}", status_code=204, response_model=None)
async def delete_custom_transform(ct_id: str):
    ok = await store.delete_custom_transform(ct_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Custom transform not found")


@app.post("/api/custom-transforms/{ct_id}/use")
async def use_custom_transform(ct_id: str):
    """Increment use count when a template is loaded into the editor."""
    await store.increment_custom_transform_use_count(ct_id)
    return {"ok": True}


# ── Catalog ───────────────────────────────────────────────────────────────────

@app.get("/api/catalog/namespaces", tags=["catalog"], summary="List top-level Dremio namespaces (spaces and sources)")
async def list_namespaces() -> list[str]:
    """Returns the top-level namespaces visible in Dremio — spaces, sources, and home. Use these as starting points for browsing tables."""
    try:
        return await catalog_client.list_namespaces()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Dremio catalog error: {e}")


@app.get("/api/catalog/namespaces/{ns:path}", tags=["catalog"], summary="List tables and sub-namespaces within a namespace")
async def list_tables_in_namespace(ns: str) -> list[dict]:
    """Browse a specific namespace path (e.g. `my_space` or `my_space.subfolder`). Returns a list of `{name, type}` objects where type is `TABLE`, `VIEW`, or `CONTAINER`."""
    try:
        return await catalog_client.list_tables(ns)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Dremio catalog error: {e}")


@app.get("/api/catalog/table-schema", tags=["catalog"], summary="Get column schema for a table")
async def get_table_schema(table: str = Query(..., description="Fully qualified table: ns.tablename")) -> list[dict]:
    """Returns `[{name, type}]` for each column in the table. Use this before building a pipeline to know what columns are available."""
    parts = table.rsplit(".", 1)
    if len(parts) < 2:
        raise HTTPException(status_code=400, detail="table must be in namespace.table format")
    namespace, table_name = parts[0], parts[1]
    try:
        return await catalog_client.get_table_schema(namespace, table_name)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Dremio catalog error: {e}")


@app.get("/api/catalog/profile", tags=["catalog"], summary="Profile a table — row count, null %, distinct count, min/max per column")
async def profile_table(
    table: str = Query(..., description="Fully qualified table: ns.tablename"),
    refresh: bool = Query(False, description="Force re-run even if cached"),
) -> dict:
    """Runs a statistical profile on up to 10,000 rows of the table. Results are cached for 1 hour. Pass `refresh=true` to force a re-run. Returns `{columns: [{name, type, count, null_pct, distinct, min, max}], total_rows}`."""
    # ── Cache check ────────────────────────────────────────────────────────────
    if not refresh:
        cached = await store.get_profile_cache(table)
        if cached is not None:
            cached["from_cache"] = True
            return cached

    parts = table.rsplit(".", 1)
    if len(parts) < 2:
        raise HTTPException(status_code=400, detail="table must be in namespace.table format")
    namespace, table_name = parts[0], parts[1]

    # Get schema to know column names/types
    try:
        fields = await catalog_client.get_table_schema(namespace, table_name)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not fetch schema: {e}")

    if not fields:
        raise HTTPException(status_code=400, detail="No schema found for table")

    # Build quoted table reference for SQL
    quoted_ns_parts = '.'.join(f'"{p}"' for p in namespace.split('.'))
    quoted_table = f'{quoted_ns_parts}."{table_name}"'

    # Build profile SQL — cast everything to VARCHAR for min/max universality
    sample_sql = f"SELECT * FROM {quoted_table} LIMIT 10000"

    col_exprs = ["COUNT(*) AS _total_rows"]
    for f in fields:
        col = f["name"]
        safe = col.replace('"', '""')
        col_exprs.append(f'COUNT("{safe}") AS "{safe}__count"')
        col_exprs.append(f'COUNT(DISTINCT "{safe}") AS "{safe}__distinct"')
        col_exprs.append(f'MIN(CAST("{safe}" AS VARCHAR)) AS "{safe}__min"')
        col_exprs.append(f'MAX(CAST("{safe}" AS VARCHAR)) AS "{safe}__max"')

    profile_sql = f"SELECT {', '.join(col_exprs)} FROM ({sample_sql}) _sample"

    try:
        rows = await dremio_client.run_query(profile_sql)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Profile query failed: {e}")

    if not rows:
        raise HTTPException(status_code=502, detail="Profile query returned no rows")

    row = rows[0]
    total_rows = row.get("_total_rows", 0) or 0

    columns = []
    for f in fields:
        col = f["name"]
        try:
            count = row.get(f"{col}__count", 0) or 0
            distinct = row.get(f"{col}__distinct", 0) or 0
            min_val = row.get(f"{col}__min")
            max_val = row.get(f"{col}__max")
            null_pct = round((1 - count / total_rows) * 100, 2) if total_rows > 0 else 0.0
            columns.append({
                "name": col,
                "type": f.get("type", "UNKNOWN"),
                "count": count,
                "null_pct": null_pct,
                "distinct": distinct,
                "min": str(min_val)[:50] if min_val is not None else "",
                "max": str(max_val)[:50] if max_val is not None else "",
            })
        except Exception:
            continue

    result = {
        "total_rows": total_rows,
        "sampled": total_rows >= 10000,
        "columns": columns,
        "from_cache": False,
    }

    # ── Store in cache ─────────────────────────────────────────────────────────
    await store.set_profile_cache(table, result)
    return result


# ── Pipelines ─────────────────────────────────────────────────────────────────

@app.post("/api/pipelines", response_model=Pipeline, status_code=201, tags=["pipelines"], summary="Create a new pipeline")
async def create_pipeline(data: PipelineCreate, current_user: dict = Depends(get_current_user)):
    """Create a new pipeline with a name and source table. Steps, output settings, and dependencies can be added via PUT. Returns the full Pipeline object including its generated `id`."""
    uid = current_user["user_id"] if current_user else "default"
    return await store.create_pipeline(data, user_id=uid)


@app.get("/api/pipelines", response_model=List[Pipeline], tags=["pipelines"], summary="List all pipelines")
async def list_pipelines(current_user: dict = Depends(get_current_user)):
    """Returns all pipelines owned by the current user, including their steps, output settings, dependencies, tests, and parameters."""
    uid = current_user["user_id"] if current_user else "default"
    return await store.list_pipelines(user_id=uid)


@app.get("/api/pipelines/{pipeline_id}", response_model=Pipeline, tags=["pipelines"], summary="Get a single pipeline")
async def get_pipeline(pipeline_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["user_id"] if current_user else "default"
    pipeline = await store.get_pipeline(pipeline_id, user_id=uid)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return pipeline


@app.put("/api/pipelines/{pipeline_id}", response_model=Pipeline, tags=["pipelines"], summary="Save pipeline (steps, output, parameters, tests, dependencies)")
async def save_pipeline(pipeline_id: str, data: PipelineSave, current_user: dict = Depends(get_current_user)):
    """Full pipeline save. Replaces all steps, output settings, parameters, tests, and dependency list. Creates a new version in history. Send the complete pipeline state — this is not a partial update."""
    uid = current_user["user_id"] if current_user else "default"
    try:
        return await store.save_pipeline(pipeline_id, data, user_id=uid)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.delete("/api/pipelines/{pipeline_id}", tags=["pipelines"], summary="Delete a pipeline and all its history")
async def delete_pipeline(pipeline_id: str, current_user: dict = Depends(get_current_user)):
    """Permanently deletes the pipeline, all version history, schedules, and run logs. Irreversible."""
    uid = current_user["user_id"] if current_user else "default"
    pipeline = await store.get_pipeline(pipeline_id, user_id=uid)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    deleted = await store.delete_pipeline(pipeline_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return {"deleted": True}


@app.get("/api/pipelines/{pipeline_id}/history", tags=["pipelines"], summary="Get version history for a pipeline")
async def get_pipeline_history(pipeline_id: str, current_user: dict = Depends(get_current_user)) -> List[dict]:
    """Returns all saved versions with version number, save message, and timestamp."""
    uid = current_user["user_id"] if current_user else "default"
    pipeline = await store.get_pipeline(pipeline_id, user_id=uid)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return await store.get_pipeline_history(pipeline_id)


@app.get("/api/pipelines/{pipeline_id}/versions/{version}", response_model=Pipeline)
async def get_pipeline_version(pipeline_id: str, version: int, current_user: dict = Depends(get_current_user)):
    pipeline = await store.get_pipeline_version(pipeline_id, version)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline or version not found")
    return pipeline


@app.post("/api/pipelines/{pipeline_id}/duplicate", response_model=Pipeline, status_code=201)
async def duplicate_pipeline(pipeline_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["user_id"] if current_user else "default"
    try:
        return await store.duplicate_pipeline(pipeline_id, user_id=uid)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/pipelines/{pipeline_id}/export")
async def export_pipeline(pipeline_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["user_id"] if current_user else "default"
    pipeline = await store.get_pipeline(pipeline_id, user_id=uid)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return {
        "export_version": 1,
        "name": pipeline.name,
        "description": pipeline.description or "",
        "source_table": pipeline.source_table,
        "output_table": pipeline.output_table or "",
        "output_mode": pipeline.output_mode,
        "steps": [s.model_dump() for s in pipeline.steps],
        "parameters": [p.model_dump() for p in pipeline.parameters],
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }


class PipelineImport(BaseModel):
    export_version: int = 1
    name: str
    description: Optional[str] = None
    source_table: str
    output_table: Optional[str] = None
    output_mode: str = "preview"
    steps: List[TransformStep] = []
    parameters: List[PipelineParameter] = []
    exported_at: Optional[str] = None


@app.post("/api/pipelines/import", response_model=Pipeline, status_code=201)
async def import_pipeline(data: PipelineImport, current_user: dict = Depends(get_current_user)):
    uid = current_user["user_id"] if current_user else "default"
    # Check for name conflict, append "(imported)" if needed
    existing = await store.list_pipelines(user_id=uid)
    existing_names = {p.name for p in existing}
    name = data.name
    if name in existing_names:
        name = f"{name} (imported)"

    create_data = PipelineCreate(
        name=name,
        description=data.description,
        source_table=data.source_table,
        output_table=data.output_table,
        output_mode=data.output_mode,
        steps=data.steps,
        parameters=data.parameters,
    )
    return await store.create_pipeline(create_data, user_id=uid)


# ── Preview & Execute ─────────────────────────────────────────────────────────

async def _fetch_column_names(source_table: str) -> List[str]:
    """Fetch column names for source_table from Dremio catalog. Returns [] on failure."""
    parts = source_table.rsplit(".", 1)
    if len(parts) < 2:
        return []
    try:
        fields = await catalog_client.get_table_schema(parts[0], parts[1])
        return [f["name"] for f in fields]
    except Exception:
        return []


async def _run_preview(
    source_table: str,
    steps: List[TransformStep],
    parameters: Optional[List[PipelineParameter]] = None,
    param_values: Optional[Dict[str, str]] = None,
) -> PreviewResult:
    initial_columns = await _fetch_column_names(source_table)
    sql = compile_pipeline(
        source_table, steps,
        initial_columns=initial_columns or None,
        limit=100,
        param_values=param_values,
        parameters=parameters,
    )
    try:
        rows = await dremio_client.run_query(sql)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Query failed: {e}")

    columns = list(rows[0].keys()) if rows else []
    return PreviewResult(
        columns=columns,
        rows=rows,
        row_count=len(rows),
        sql=sql,
        truncated=len(rows) >= 100,
    )


class ParamValuesBody(BaseModel):
    param_values: Optional[Dict[str, str]] = None
    output_table: Optional[str] = None          # frontend can pass current local state
    output_mode: Optional[str] = None           # overrides saved DB value when provided
    incremental_strategy: Optional[str] = None  # "merge", "append", or "microbatch"
    incremental_key: Optional[str] = None       # key/timestamp column for incremental
    microbatch_window: Optional[str] = None     # "1hour"|"6hour"|"1day"|"1week" for microbatch
    # SCD Type 2
    scd2_key: Optional[str] = None
    scd2_tracked_columns: Optional[List[str]] = None
    scd2_effective_from: Optional[str] = None
    scd2_effective_to: Optional[str] = None
    scd2_is_current: Optional[str] = None


@app.post("/api/pipelines/{pipeline_id}/preview", response_model=PreviewResult, tags=["pipelines"], summary="Preview pipeline output (first 500 rows, no writes)")
async def preview_pipeline(
    pipeline_id: str,
    body: Optional[ParamValuesBody] = None,
    current_user: dict = Depends(get_current_user),
):
    uid = current_user["user_id"] if current_user else "default"
    pipeline = await store.get_pipeline(pipeline_id, user_id=uid)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    """Compiles and runs the pipeline SQL against Dremio without writing any output. Returns up to 500 rows. Optionally pass `param_values` to override pipeline parameters for this run."""
    pv = body.param_values if body else None
    return await _run_preview(pipeline.source_table, pipeline.steps, parameters=pipeline.parameters, param_values=pv)


async def _bisect_pipeline_failure(
    source_table: str,
    steps: list,
    initial_columns,
    param_values,
    parameters,
) -> Optional[dict]:
    """
    After a full-pipeline execute fails, probe each step incrementally (LIMIT 1)
    to identify the first step that causes a failure.

    Returns a dict with:
      step_index   — 0-based index of the failing step
      step_name    — user label or human-readable transform name
      step_error   — Dremio error message for that step

    Returns None if all individual steps pass (failure is in the DDL write itself,
    not a transform step), or if there are no steps to test.
    """
    if not steps:
        return None
    for i, step in enumerate(steps):
        try:
            probe_sql = compile_pipeline(
                source_table, steps[: i + 1],
                initial_columns=initial_columns,
                param_values=param_values,
                parameters=parameters,
                limit=1,
            )
            token = await dremio_client._get_token()
            job_info = await dremio_client.sql(probe_sql, token)
            result = await dremio_client.poll_job(job_info["id"], token)
            if result.get("jobState") == "FAILED":
                try:
                    t = reg.get_transform(step.transform_type)
                    display_name = t.name
                except Exception:
                    display_name = step.transform_type
                label = step.label or display_name
                return {
                    "step_index": i,
                    "step_name": label,
                    "step_error": result.get("errorMessage", "Unknown error"),
                }
        except Exception:
            # Probe itself threw — treat this step as the culprit
            try:
                t = reg.get_transform(step.transform_type)
                display_name = t.name
            except Exception:
                display_name = step.transform_type
            return {
                "step_index": i,
                "step_name": step.label or display_name,
                "step_error": "Step could not be compiled or executed",
            }
    return None


@app.post("/api/pipelines/{pipeline_id}/execute", response_model=ExecuteResult, tags=["pipelines"], summary="Execute pipeline — write output to Dremio")
async def execute_pipeline(
    pipeline_id: str,
    body: Optional[ParamValuesBody] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Execute a pipeline and write its output to Dremio. Output mode is read from the pipeline's saved settings (CTAS, INSERT, VIEW, incremental, or SCD2). You can override `output_table`, `output_mode`, and `param_values` in the request body.

    After a successful execute:
    - Pipeline tests run automatically (if defined). A failing `error`-severity test blocks the run.
    - Iceberg table properties are stamped with pipeline metadata (if the output table is Iceberg).
    - The run is logged to pipeline run history.

    Returns `ExecuteResult` with `success`, `rows_written`, `duration_ms`, `test_results`, and `metadata_push` status.
    """
    uid = current_user["user_id"] if current_user else "default"
    pipeline = await store.get_pipeline(pipeline_id, user_id=uid)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    # Use body-supplied values (local UI state) when available, fall back to DB
    output_table = (body.output_table or "").strip() if body and body.output_table else (pipeline.output_table or "")
    mode = (body.output_mode or "").strip() if body and body.output_mode else (pipeline.output_mode or "preview")
    incr_strategy = (body.incremental_strategy or "").strip() if body and body.incremental_strategy else (pipeline.incremental_strategy or "")
    incr_key = (body.incremental_key or "").strip() if body and body.incremental_key else (pipeline.incremental_key or "")
    microbatch_window = (body.microbatch_window or "").strip() if body and body.microbatch_window else (getattr(pipeline, 'microbatch_window', None) or "1day")
    scd2_key = (body.scd2_key or "").strip() if body and body.scd2_key else (pipeline.scd2_key or "")
    scd2_tracked = body.scd2_tracked_columns if body and body.scd2_tracked_columns else (pipeline.scd2_tracked_columns or [])
    scd2_eff_from = (body.scd2_effective_from or "").strip() if body and body.scd2_effective_from else (pipeline.scd2_effective_from or "effective_from")
    scd2_eff_to = (body.scd2_effective_to or "").strip() if body and body.scd2_effective_to else (pipeline.scd2_effective_to or "effective_to")
    scd2_is_curr = (body.scd2_is_current or "").strip() if body and body.scd2_is_current else (pipeline.scd2_is_current or "is_current")

    if not output_table:
        raise HTTPException(status_code=400, detail="No output table specified. Enter a table name in the Output section.")

    if mode not in ("ctas", "insert", "view", "incremental", "scd2"):
        raise HTTPException(status_code=400, detail="Select a write mode (Create Table, Insert Into, Create View, Incremental, or SCD Type 2) in the Output section.")

    if mode == "incremental" and not incr_key:
        raise HTTPException(status_code=400, detail="Incremental mode requires a key column. Set it in the Output section.")

    if mode == "scd2" and not scd2_key:
        raise HTTPException(status_code=400, detail="SCD Type 2 requires a key column. Set it in the Output section.")

    pv = body.param_values if body else None
    initial_columns = await _fetch_column_names(pipeline.source_table)

    start_ms = int(time.time() * 1000)
    started_at = datetime.now(timezone.utc).isoformat()
    sql = ""

    try:
        # ── Pre-hook ────────────────────────────────────────────────────────
        if pipeline.pre_hook_sql and pipeline.pre_hook_sql.strip():
            try:
                await dremio_client.run_query(pipeline.pre_hook_sql.strip())
            except Exception as hook_err:
                error_msg = f"Pre-hook failed: {hook_err}"
                await store.log_run(
                    pipeline_id=pipeline_id, pipeline_name=pipeline.name,
                    run_type="manual", status="failed", row_count=None,
                    error_message=error_msg,
                    started_at=started_at, completed_at=datetime.now(timezone.utc).isoformat(),
                )
                return ExecuteResult(success=False, sql=pipeline.pre_hook_sql, error=error_msg,
                                     duration_ms=int(time.time() * 1000) - start_ms)

        # ── Incremental mode ────────────────────────────────────────────────
        if mode == "incremental":
            strategy = incr_strategy or "append"
            incr = compile_incremental(
                pipeline.source_table, pipeline.steps, output_table,
                strategy=strategy,
                key_column=incr_key,
                initial_columns=initial_columns or None,
                param_values=pv,
                parameters=pipeline.parameters,
            )

            # Check if target table exists
            table_exists = False
            try:
                await dremio_client.run_query(incr["check_sql"])
                table_exists = True
            except Exception:
                table_exists = False

            if strategy == "microbatch" and table_exists:
                # ── Microbatch: Python-driven time-window loop ───────────────
                from datetime import timedelta as _timedelta
                _window_map = {
                    "1hour": _timedelta(hours=1),
                    "6hour": _timedelta(hours=6),
                    "1day": _timedelta(days=1),
                    "1week": _timedelta(weeks=1),
                }
                _window = _window_map.get(microbatch_window, _timedelta(days=1))

                # Get last processed timestamp from output table
                try:
                    _last_rows = await dremio_client.run_query(
                        f"SELECT MAX({incr_key}) AS _last FROM {output_table}"
                    )
                    _last_val = _last_rows[0]["_last"] if _last_rows and _last_rows[0]["_last"] else None
                except Exception:
                    _last_val = None

                if _last_val:
                    # Parse ISO timestamp from Dremio (may be "2024-01-15 12:00:00.000" format)
                    _last_str = str(_last_val).replace("T", " ").split(".")[0]
                    try:
                        _batch_start = datetime.strptime(_last_str, "%Y-%m-%d %H:%M:%S")
                    except ValueError:
                        _batch_start = datetime.strptime(_last_str[:10], "%Y-%m-%d")
                else:
                    _batch_start = datetime(1970, 1, 1)  # noqa: datetime imported at top

                _now = datetime.utcnow()
                _batch_sql_template = incr["incremental_sql"]
                _batches_run = 0
                _total_rows = 0
                _token = await dremio_client._get_token()

                while _batch_start < _now:
                    _batch_end = min(_batch_start + _window, _now)
                    _batch_sql = _batch_sql_template.format(
                        batch_start=_batch_start.strftime("%Y-%m-%d %H:%M:%S"),
                        batch_end=_batch_end.strftime("%Y-%m-%d %H:%M:%S"),
                    )
                    _job_info = await dremio_client.sql(_batch_sql, _token)
                    _result = await dremio_client.poll_job(_job_info["id"], _token)
                    if _result.get("jobState") == "FAILED":
                        raise RuntimeError(
                            f"Microbatch failed at window {_batch_start} → {_batch_end}: "
                            f"{_result.get('errorMessage', 'Unknown error')}"
                        )
                    _total_rows += _result.get("outputRecords") or 0
                    _batches_run += 1
                    _batch_start = _batch_end

                duration_ms = int(time.time() * 1000) - start_ms
                completed_at = datetime.now(timezone.utc).isoformat()
                test_results: List[TestResult] = []
                if pipeline.tests:
                    try:
                        test_results = await run_pipeline_tests(pipeline.tests, output_table, dremio_client)
                    except Exception:
                        pass
                summary = summarize_results(test_results)
                blocked = summary["blocking_failures"] > 0
                import json as _json
                test_results_json_str = _json.dumps([r.model_dump() for r in test_results]) if test_results else None
                await store.log_run(
                    pipeline_id=pipeline_id, pipeline_name=pipeline.name,
                    run_type="manual", status="failed" if blocked else "success",
                    row_count=_total_rows, error_message="Blocked by failing tests" if blocked else None,
                    started_at=started_at, completed_at=completed_at,
                    test_results_json=test_results_json_str,
                )
                return ExecuteResult(
                    success=not blocked,
                    rows_written=_total_rows,
                    output_table=output_table,
                    sql=_batch_sql_template,
                    error="Blocked by failing tests" if blocked else None,
                    duration_ms=duration_ms,
                    test_results=test_results or None,
                    tests_passed=summary["passed"] if test_results else None,
                    tests_failed=(summary["failed"] + summary["errors"]) if test_results else None,
                    blocked_by_tests=blocked,
                    metadata_push=f"{_batches_run} microbatches",
                )

            sql = incr["ctas_sql"] if not table_exists else incr["incremental_sql"]

        # ── SCD Type 2 mode (multi-statement) ───────────────────────────────
        elif mode == "scd2":
            scd = compile_scd2(
                pipeline.source_table, pipeline.steps, output_table,
                key_column=scd2_key,
                tracked_columns=scd2_tracked or None,
                effective_from_col=scd2_eff_from,
                effective_to_col=scd2_eff_to,
                is_current_col=scd2_is_curr,
                initial_columns=initial_columns or None,
                param_values=pv,
                parameters=pipeline.parameters,
            )

            # Detect first vs. subsequent run
            table_exists = False
            try:
                await dremio_client.run_query(scd["check_sql"])
                table_exists = True
            except Exception:
                table_exists = False

            if not table_exists:
                sql = scd["ctas_sql"]
            else:
                # Run two SQL statements: close old records, then insert new
                token = await dremio_client._get_token()
                sql = scd["close_sql"]
                close_info = await dremio_client.sql(sql, token)
                close_result = await dremio_client.poll_job(close_info["id"], token)
                if close_result.get("jobState") == "FAILED":
                    raise RuntimeError(f"SCD2 close step failed: {close_result.get('errorMessage', 'Unknown error')}")

                sql = scd["insert_sql"]
                insert_info = await dremio_client.sql(sql, token)
                result = await dremio_client.poll_job(insert_info["id"], token)
                duration_ms = int(time.time() * 1000) - start_ms
                completed_at = datetime.now(timezone.utc).isoformat()
                rows_written = result.get("outputRecords") or 0
                if result.get("jobState") == "FAILED":
                    raise RuntimeError(f"SCD2 insert step failed: {result.get('errorMessage', 'Unknown error')}")
                # Run tests then return early (bypass the standard single-sql path below)
                test_results: List[TestResult] = []
                if pipeline.tests:
                    try:
                        test_results = await run_pipeline_tests(pipeline.tests, output_table, dremio_client)
                    except Exception:
                        pass
                summary = summarize_results(test_results)
                blocked = summary["blocking_failures"] > 0
                import json as _json
                test_results_json_str = _json.dumps([r.model_dump() for r in test_results]) if test_results else None
                await store.log_run(
                    pipeline_id=pipeline_id, pipeline_name=pipeline.name,
                    run_type="manual", status="failed" if blocked else "success",
                    row_count=rows_written, error_message="Blocked by failing tests" if blocked else None,
                    started_at=started_at, completed_at=completed_at,
                    test_results_json=test_results_json_str,
                )
                return ExecuteResult(
                    success=not blocked, rows_written=rows_written, output_table=output_table,
                    sql=f"-- SCD2 close:\n{scd['close_sql']}\n\n-- SCD2 insert:\n{scd['insert_sql']}",
                    duration_ms=duration_ms,
                    test_results=test_results or None,
                    tests_passed=summary["passed"] if test_results else None,
                    tests_failed=(summary["failed"] + summary["errors"]) if test_results else None,
                    blocked_by_tests=blocked,
                    error="Blocked by failing tests" if blocked else None,
                )

        # ── Standard mode ───────────────────────────────────────────────────
        else:
            sql = compile_execute(
                pipeline.source_table, pipeline.steps, output_table, mode,
                initial_columns=initial_columns or None,
                param_values=pv,
                parameters=pipeline.parameters,
            )

        token = await dremio_client._get_token()
        job_info = await dremio_client.sql(sql, token)
        job_id = job_info["id"]
        result = await dremio_client.poll_job(job_id, token)
        duration_ms = int(time.time() * 1000) - start_ms
        completed_at = datetime.now(timezone.utc).isoformat()

        if result.get("jobState") == "FAILED":
            error_msg = result.get("errorMessage", "Job failed")
            # Bisect to find which transform step caused the failure
            failed_step = None
            if pipeline.steps:
                try:
                    failed_step = await _bisect_pipeline_failure(
                        pipeline.source_table, pipeline.steps,
                        initial_columns,
                        param_values=pv,
                        parameters=pipeline.parameters,
                    )
                except Exception:
                    pass
            await store.log_run(
                pipeline_id=pipeline_id,
                pipeline_name=pipeline.name,
                run_type="manual",
                status="failed",
                row_count=None,
                error_message=error_msg if not failed_step else f"Step {failed_step['step_index'] + 1} ({failed_step['step_name']}): {failed_step['step_error']}",
                started_at=started_at,
                completed_at=completed_at,
            )
            return ExecuteResult(
                success=False,
                sql=sql,
                error=error_msg,
                duration_ms=duration_ms,
                failed_step_index=failed_step["step_index"] if failed_step else None,
                failed_step_name=failed_step["step_name"] if failed_step else None,
                failed_step_error=failed_step["step_error"] if failed_step else None,
            )

        # Dremio CTAS doesn't populate outputRecords (it's DDL, not DML).
        # For CTAS/view, query the actual row count; for INSERT/MERGE use job field.
        rows_written = result.get("outputRecords") or 0
        if mode in ("ctas", "view", "incremental") and rows_written == 0:
            try:
                count_results = await dremio_client.run_query(
                    f"SELECT COUNT(*) AS _cnt FROM {output_table}"
                )
                if count_results:
                    rows_written = int(count_results[0].get("_cnt", 0))
            except Exception:
                pass  # non-fatal — keep rows_written as 0

        # ── Run pipeline tests ───────────────────────────────────────────────
        test_results: List[TestResult] = []
        if pipeline.tests:
            try:
                test_results = await run_pipeline_tests(pipeline.tests, output_table, dremio_client)
            except Exception as te:
                # test runner failure is non-fatal for the execute itself
                pass

        summary = summarize_results(test_results)
        blocked = summary["blocking_failures"] > 0

        test_results_json_str = None
        if test_results:
            import json as _json
            test_results_json_str = _json.dumps([r.model_dump() for r in test_results])

        run_status = "failed" if blocked else "success"

        # Stamp Iceberg table properties (5s timeout — non-blocking on timeout)
        metadata_push_status: Optional[str] = None
        if not blocked and output_table and mode != "view":
            try:
                metadata_push_status = await _asyncio.wait_for(
                    _push_table_metadata(output_table, {
                        "pipeline_id": pipeline_id,
                        "pipeline_name": pipeline.name,
                        "source_table": pipeline.source_table,
                        "last_run": completed_at,
                        "rows_written": str(rows_written),
                        "transform_studio_version": "1.3",
                    }),
                    timeout=5.0,
                )
            except _asyncio.TimeoutError:
                metadata_push_status = "timeout"

        await store.log_run(
            pipeline_id=pipeline_id,
            pipeline_name=pipeline.name,
            run_type="manual",
            status=run_status,
            row_count=rows_written,
            error_message="Blocked by failing tests" if blocked else None,
            started_at=started_at,
            completed_at=completed_at,
            test_results_json=test_results_json_str,
        )

        if blocked:
            failed_names = [r.test_name for r in test_results if r.status in ("failed", "error") and r.severity == "error"]
            return ExecuteResult(
                success=False,
                rows_written=rows_written,
                output_table=output_table,
                sql=sql,
                duration_ms=duration_ms,
                test_results=test_results or None,
                tests_passed=summary["passed"],
                tests_failed=summary["failed"] + summary["errors"],
                blocked_by_tests=True,
                error=f"Blocked by {len(failed_names)} failing test(s): {', '.join(failed_names)}",
            )

        # ── Post-hook ────────────────────────────────────────────────────────
        post_hook_error: Optional[str] = None
        if pipeline.post_hook_sql and pipeline.post_hook_sql.strip():
            try:
                await dremio_client.run_query(pipeline.post_hook_sql.strip())
            except Exception as hook_err:
                post_hook_error = f"Post-hook failed (pipeline succeeded): {hook_err}"

        return ExecuteResult(
            success=True,
            rows_written=rows_written,
            output_table=output_table,
            sql=sql,
            duration_ms=duration_ms,
            test_results=test_results or None,
            tests_passed=summary["passed"] if test_results else None,
            tests_failed=(summary["failed"] + summary["errors"]) if test_results else None,
            metadata_push=metadata_push_status,
            error=post_hook_error,  # surface post-hook error as a warning — success is still True
        )

    except Exception as e:
        duration_ms = int(time.time() * 1000) - start_ms
        completed_at = datetime.now(timezone.utc).isoformat()
        await store.log_run(
            pipeline_id=pipeline_id,
            pipeline_name=pipeline.name,
            run_type="manual",
            status="failed",
            row_count=None,
            error_message=str(e),
            started_at=started_at,
            completed_at=completed_at,
        )
        return ExecuteResult(success=False, sql=sql, error=str(e), duration_ms=duration_ms)


# ── Pipeline Tests ────────────────────────────────────────────────────────────

@app.post("/api/pipelines/{pipeline_id}/run-tests", tags=["pipelines"], summary="Run pipeline tests against the current output table")
async def run_pipeline_tests_endpoint(
    pipeline_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Runs all tests defined on the pipeline (not_null, unique, row_count_between, accepted_values, custom_sql) against the pipeline's current output table. Returns per-test results and a summary. Tests also run automatically after every execute."""
    uid = current_user["user_id"] if current_user else "default"
    pipeline = await store.get_pipeline(pipeline_id, user_id=uid)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    if not pipeline.output_table:
        raise HTTPException(status_code=400, detail="Pipeline has no output table configured")
    if not pipeline.tests:
        return {"results": [], "passed": 0, "failed": 0, "errors": 0}

    results = await run_pipeline_tests(pipeline.tests, pipeline.output_table, dremio_client)
    summary = summarize_results(results)
    return {
        "results": [r.model_dump() for r in results],
        **summary,
    }


# ── Column-level lineage ──────────────────────────────────────────────────────

@app.get("/api/pipelines/{pipeline_id}/column-lineage", tags=["pipelines"], summary="Get column-level lineage for a pipeline")
async def get_column_lineage(
    pipeline_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """
    Returns column-level lineage for each transform step.
    Each step entry contains: step_index, step_type, step_label,
    input_columns, output_columns, and column_map (output_col → [source_cols]).
    Requires that the pipeline has initial_columns cached from a recent schema fetch,
    otherwise returns an empty steps list.
    """
    uid = current_user["user_id"] if current_user else "default"
    pipeline = await store.get_pipeline(pipeline_id, user_id=uid)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    # Fetch source schema to get initial columns
    initial_columns: List[str] = []
    try:
        from catalog_client import CatalogClient
        catalog = CatalogClient()
        schema = await catalog.get_table_schema(pipeline.source_table)
        initial_columns = [col["name"] for col in schema]
    except Exception:
        pass

    if not initial_columns or not pipeline.steps:
        return {
            "pipeline_id": pipeline_id,
            "source_columns": initial_columns,
            "steps": [],
        }

    steps_lineage = compute_column_lineage(pipeline.steps, initial_columns)

    return {
        "pipeline_id": pipeline_id,
        "source_columns": initial_columns,
        "steps": steps_lineage,
    }


# ── Cross-pipeline DAG ────────────────────────────────────────────────────────

@app.get("/api/dag", tags=["dag"], summary="Get the full cross-pipeline dependency graph")
async def get_dag(current_user: dict = Depends(get_current_user)) -> dict:
    """Returns `{nodes, edges, cycles, execution_order}` for all pipelines. `execution_order` is a topologically sorted list of pipeline IDs from upstream to downstream. `cycles` lists any circular dependency chains (which block execution)."""
    uid = current_user["user_id"] if current_user else "default"
    pipelines = await store.list_pipelines(user_id=uid)
    pipeline_dicts = [p.model_dump() for p in pipelines]
    return build_dag_response(pipeline_dicts)


class DependencyUpdate(BaseModel):
    dependencies: List[str]


@app.put("/api/pipelines/{pipeline_id}/dependencies", tags=["dag"], summary="Set upstream pipeline dependencies")
async def update_dependencies(
    pipeline_id: str,
    body: DependencyUpdate,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Update the dependency list for a pipeline."""
    uid = current_user["user_id"] if current_user else "default"
    pipeline = await store.get_pipeline(pipeline_id, user_id=uid)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    ok = await store.update_pipeline_dependencies(pipeline_id, body.dependencies)
    if not ok:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return {"pipeline_id": pipeline_id, "dependencies": body.dependencies}


# ── Iceberg metadata push helper ─────────────────────────────────────────────

async def _push_table_metadata(table: str, props: dict) -> str:
    """
    Stamp Iceberg table properties after execute.
    Tries Dremio SQL (ALTER TABLE SET TBLPROPERTIES) first.
    If that fails (table not Iceberg / no ALTER privilege), falls back to
    whichever configured Iceberg REST catalog contains the table namespace.
    Returns a status string: 'sql' | 'rest_catalog:{name}' | 'skipped' | 'failed'.
    Never raises.
    """
    import logging
    logger = logging.getLogger("transform_studio.metadata")

    # ── Method 1: Dremio SQL ─────────────────────────────────────────────────
    try:
        pairs = ", ".join(
            f"'ts.{k}' = '{str(v).replace(chr(39), '')}'"
            for k, v in props.items()
            if v is not None
        )
        sql = f"ALTER TABLE {table} SET TBLPROPERTIES ({pairs})"
        await dremio_client.run_query(sql)
        logger.info("Iceberg metadata push (SQL) succeeded for %s", table)
        return "sql"
    except Exception as e:
        logger.debug("Iceberg metadata push via SQL failed for %s: %s — trying REST catalog", table, e)

    # ── Method 2: Iceberg REST catalog ───────────────────────────────────────
    parts = table.split(".")
    if len(parts) < 2:
        logger.debug("Cannot parse table ref '%s' for REST catalog push", table)
        return "skipped"

    table_name = parts[-1]
    namespace = ".".join(parts[:-1])

    try:
        catalogs = await store.list_catalog_connections()
    except Exception:
        return "skipped"

    for cat in catalogs:
        try:
            from iceberg_rest_client import IcebergRestClient
            client = IcebergRestClient(cat)
            prefixed_props = {f"ts.{k}": str(v) for k, v in props.items() if v is not None}
            await client.update_table_properties(namespace, table_name, prefixed_props)
            cat_name = cat.get("name", "unknown")
            logger.info("Iceberg metadata push (REST catalog '%s') succeeded for %s", cat_name, table)
            return f"rest_catalog:{cat_name}"
        except Exception as e:
            logger.debug("REST catalog '%s' push failed for %s: %s", cat.get("name"), table, e)
            continue

    logger.debug("Iceberg metadata push skipped for %s — not an Iceberg table or no matching catalog", table)
    return "skipped"


# ── DAG Orchestration ─────────────────────────────────────────────────────────

@app.post("/api/pipelines/{pipeline_id}/execute-with-deps", response_model=DagExecuteResult, tags=["dag"], summary="Execute pipeline and all upstream dependencies in order")
async def execute_with_deps(
    pipeline_id: str,
    body: Optional[ParamValuesBody] = None,
    current_user: dict = Depends(get_current_user),
) -> DagExecuteResult:
    """
    Execute a pipeline and all its upstream dependencies in topological order.
    Stops on first failure and marks remaining pipelines as skipped.
    """
    uid = current_user["user_id"] if current_user else "default"

    all_pipelines = await store.list_pipelines(user_id=uid)
    pipeline_dicts = [{"id": p.id, "dependencies": p.dependencies or []} for p in all_pipelines]
    name_map = {p.id: p.name for p in all_pipelines}

    cycles = find_cycles(pipeline_dicts)
    if cycles:
        raise HTTPException(status_code=400, detail=f"Dependency cycle detected: {' → '.join(cycles[0])}")

    run_order = get_run_order_for_pipeline(pipeline_id, pipeline_dicts)

    results: List[DagPipelineResult] = []
    stopped = False

    for pid in run_order:
        if stopped:
            results.append(DagPipelineResult(
                pipeline_id=pid, pipeline_name=name_map.get(pid, pid),
                success=False, skipped=True,
            ))
            continue

        exec_body = body if pid == pipeline_id else None
        result = await execute_pipeline(pid, exec_body, current_user)
        results.append(DagPipelineResult(
            pipeline_id=pid,
            pipeline_name=name_map.get(pid, pid),
            success=result.success,
            rows_written=result.rows_written,
            duration_ms=result.duration_ms,
            error=result.error,
            skipped=False,
        ))
        if not result.success:
            stopped = True

    succeeded = sum(1 for r in results if r.success and not r.skipped)
    failed = sum(1 for r in results if not r.success and not r.skipped)
    skipped = sum(1 for r in results if r.skipped)

    return DagExecuteResult(
        pipeline_results=results,
        total_pipelines=len(run_order),
        succeeded=succeeded,
        failed=failed,
        skipped=skipped,
        stopped_early=stopped,
    )


# ── Data Seeding ──────────────────────────────────────────────────────────────

def _infer_type(value: str) -> str:
    """Infer SQL type from a string value."""
    try:
        int(value)
        return "BIGINT"
    except ValueError:
        pass
    try:
        float(value)
        return "DOUBLE"
    except ValueError:
        pass
    return "VARCHAR"


def _escape_sql_value(value: str, col_type: str) -> str:
    """Format a value for SQL inline."""
    if col_type in ("BIGINT", "DOUBLE"):
        return value if value.strip() else "NULL"
    escaped = value.replace("'", "''")
    return f"'{escaped}'"


@app.post("/api/seeds", response_model=SeedResult, tags=["seeds"], summary="Upload a CSV and create a Dremio table from it")
async def seed_table(
    table_name: str = Form(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
) -> SeedResult:
    """
    Multipart upload: send `table_name` (e.g. `my_space.seed_customers`) and a `file` (.csv). Infers column types (INTEGER, DOUBLE, VARCHAR). Creates or replaces the table using `CREATE OR REPLACE TABLE AS SELECT ... UNION ALL ...`. Max 5,000 rows. Returns `{success, table_name, rows_inserted, sql, error}`.
    """
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # handle BOM
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        raise HTTPException(status_code=400, detail="CSV file is empty or has no data rows")
    if len(rows) > 5000:
        rows = rows[:5000]

    headers = list(rows[0].keys())
    # Infer column types from first non-empty row
    col_types: dict[str, str] = {}
    for h in headers:
        sample = next((r[h].strip() for r in rows if r.get(h, "").strip()), "")
        col_types[h] = _infer_type(sample)

    # Sanitise table name (prevent injection)
    safe_table = ".".join(
        f'"{part.replace(chr(34), "")}"' for part in table_name.split(".")
    )

    # Build CREATE TABLE AS SELECT … UNION ALL SELECT …
    def row_to_select(r: dict, include_alias: bool) -> str:
        parts = []
        for h in headers:
            val = _escape_sql_value(r.get(h, "").strip(), col_types[h])
            if col_types[h] != "VARCHAR":
                cast = f"CAST({val} AS {col_types[h]})"
            else:
                cast = f"CAST({val} AS VARCHAR)"
            if include_alias:
                safe_col = h.replace('"', '')
                cast += f' AS "{safe_col}"'
            parts.append(cast)
        return "SELECT " + ", ".join(parts)

    selects = [row_to_select(rows[0], include_alias=True)]
    selects += [row_to_select(r, include_alias=False) for r in rows[1:]]
    union_sql = "\nUNION ALL\n".join(selects)
    sql = f"CREATE OR REPLACE TABLE {safe_table} AS\n{union_sql}"

    try:
        await dremio_client.run_query(sql)
    except Exception as e:
        return SeedResult(success=False, table_name=table_name, rows_inserted=0, sql=sql, error=str(e))

    return SeedResult(success=True, table_name=table_name, rows_inserted=len(rows), sql=sql)


# ── Environments ──────────────────────────────────────────────────────────────

@app.get("/api/environments", tags=["environments"], summary="List all saved Dremio connection environments")
async def list_environments(current_user: dict = Depends(get_current_user)) -> list:
    """Returns all saved environments (dev/staging/prod connection profiles). The active one has `is_active: true`."""
    return await store.list_environments()


@app.post("/api/environments", status_code=201, tags=["environments"], summary="Create a new environment")
async def create_environment(
    body: EnvironmentCreate,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Save a named Dremio connection profile. Fields: `name`, `host`, `port`, `ssl`, `auth_type` (password/pat), `user`, `password`, `pat`, `project_id`."""
    return await store.create_environment(body.model_dump())


@app.put("/api/environments/{env_id}", tags=["environments"], summary="Update an environment")
async def update_environment(
    env_id: str,
    body: EnvironmentCreate,
    current_user: dict = Depends(get_current_user),
) -> dict:
    env = await store.update_environment(env_id, body.model_dump())
    if env is None:
        raise HTTPException(status_code=404, detail="Environment not found")
    return env


@app.delete("/api/environments/{env_id}", status_code=204, response_model=None, tags=["environments"], summary="Delete an environment")
async def delete_environment(
    env_id: str,
    current_user: dict = Depends(get_current_user),
):
    ok = await store.delete_environment(env_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Environment not found")


@app.post("/api/environments/{env_id}/activate", tags=["environments"], summary="Switch the active Dremio connection to this environment")
async def activate_environment(
    env_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Immediately switches the live Dremio connection to this environment's settings. All subsequent queries use the new connection. Also persists the change so it survives a restart."""
    env = await store.activate_environment(env_id)
    if env is None:
        raise HTTPException(status_code=404, detail="Environment not found")

    # Apply to live settings so new queries use this connection immediately
    settings.update(
        dremio_host=env["host"],
        dremio_port=int(env.get("port") or 9047),
        dremio_ssl=bool(env.get("ssl")),
        dremio_auth_type=env.get("auth_type", "password"),
        dremio_user=env.get("user", ""),
        dremio_pass=env.get("password", ""),
        dremio_pat=env.get("pat", ""),
        dremio_project_id=env.get("project_id", ""),
    )
    # Persist to app_settings so it survives restart
    conn_data = {
        "host": env["host"], "port": int(env.get("port") or 9047),
        "ssl": bool(env.get("ssl")), "auth_type": env.get("auth_type", "password"),
        "user": env.get("user", ""), "password": env.get("password", ""),
        "pat": env.get("pat", ""), "project_id": env.get("project_id", ""),
    }
    await store.save_connection_settings(conn_data)
    return {"activated": True, "environment": env}


# ── Documentation Export ──────────────────────────────────────────────────────

@app.get("/api/docs/export", response_class=HTMLResponse, tags=["system"], summary="Export a self-contained HTML documentation site for all pipelines")
async def export_docs(current_user: dict = Depends(get_current_user)) -> HTMLResponse:
    """Returns a single standalone HTML page listing all pipelines with their source, output, steps, output mode, and dependencies. No external CSS or JS — safe to save and share."""
    uid = current_user["user_id"] if current_user else "default"
    pipelines = await store.list_pipelines(user_id=uid)
    pipeline_map = {p.id: p.name for p in pipelines}

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    def mode_badge(mode: str) -> str:
        colors = {"ctas": "#3b82f6", "insert": "#8b5cf6", "view": "#10b981",
                  "incremental": "#f59e0b", "scd2": "#ef4444", "preview": "#6b7280"}
        color = colors.get(mode, "#6b7280")
        return f'<span style="background:{color};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">{mode.upper()}</span>'

    pipeline_cards = []
    for p in pipelines:
        deps_html = ""
        if p.dependencies:
            dep_names = [pipeline_map.get(d, d) for d in p.dependencies]
            deps_html = f'<p><strong>Dependencies:</strong> {", ".join(dep_names)}</p>'

        tests_html = ""
        if p.tests:
            test_rows = "".join(
                f'<tr><td>{t.name}</td><td>{t.test_type}</td><td>{t.column or ""}</td>'
                f'<td><span style="color:{"#ef4444" if t.severity=="error" else "#f59e0b"}">{t.severity}</span></td></tr>'
                for t in p.tests
            )
            tests_html = f"""
            <h4 style="margin:12px 0 6px">Tests</h4>
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead><tr style="background:#f1f5f9">
                <th style="text-align:left;padding:4px 8px">Name</th>
                <th style="text-align:left;padding:4px 8px">Type</th>
                <th style="text-align:left;padding:4px 8px">Column</th>
                <th style="text-align:left;padding:4px 8px">Severity</th>
              </tr></thead>
              <tbody>{test_rows}</tbody>
            </table>"""

        steps_html = ""
        if p.steps:
            step_items = "".join(
                f'<li style="margin:3px 0"><code style="font-size:11px">{s.transform_type}</code>'
                f'{f" — {s.label}" if s.label else ""}</li>'
                for s in p.steps
            )
            steps_html = f'<h4 style="margin:12px 0 6px">Steps ({len(p.steps)})</h4><ol style="margin:0;padding-left:20px">{step_items}</ol>'

        card = f"""
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:16px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
            <h3 style="margin:0;font-size:16px">{p.name}</h3>
            {mode_badge(p.output_mode)}
          </div>
          {f'<p style="color:#64748b;margin:0 0 8px;font-size:13px">{p.description}</p>' if p.description else ""}
          <p><strong>Source:</strong> <code>{p.source_table}</code></p>
          {f'<p><strong>Output:</strong> <code>{p.output_table}</code></p>' if p.output_table else ""}
          {deps_html}
          {steps_html}
          {tests_html}
          <p style="color:#94a3b8;font-size:11px;margin-top:12px">
            Version {p.version} · Updated {(p.updated_at or "")[:10]}
          </p>
        </div>"""
        pipeline_cards.append(card)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Transform Studio — Pipeline Documentation</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }}
    h1 {{ font-size: 22px; margin: 0 0 4px }}
    code {{ background: #f1f5f9; padding: 1px 5px; border-radius: 3px; font-size: 12px }}
    table td, table th {{ padding: 4px 8px; border-bottom: 1px solid #e2e8f0 }}
  </style>
</head>
<body>
  <div style="max-width:860px;margin:0 auto">
    <h1>Transform Studio — Pipeline Documentation</h1>
    <p style="color:#64748b;margin:0 0 24px">Generated {now_str} · {len(pipelines)} pipeline(s)</p>
    {"".join(pipeline_cards) if pipeline_cards else '<p style="color:#94a3b8">No pipelines found.</p>'}
  </div>
</body>
</html>"""

    return HTMLResponse(
        content=html,
        headers={"Content-Disposition": "attachment; filename=transform-studio-docs.html"},
    )


# ── Ad-hoc SQL ────────────────────────────────────────────────────────────────

class AdHocRequest(PipelineCreate):
    pass


class AdHocBody(BaseModel):
    source_table: str
    steps: List[TransformStep]


@app.post("/api/sql/preview", response_model=PreviewResult)
async def sql_preview(body: AdHocBody):
    return await _run_preview(body.source_table, body.steps)


@app.post("/api/sql/generate")
async def sql_generate(body: AdHocBody) -> Dict[str, Any]:
    initial_columns = await _fetch_column_names(body.source_table)
    sql = compile_pipeline(body.source_table, body.steps, initial_columns=initial_columns or None)
    return {"sql": sql}


# ── Iceberg Catalog Connections ───────────────────────────────────────────────

def _get_iceberg_client(conn: dict) -> IcebergRestClient:
    return IcebergRestClient(conn)


@app.get("/api/iceberg-catalogs")
async def list_iceberg_catalogs() -> list[dict]:
    return await store.list_catalog_connections()


@app.post("/api/iceberg-catalogs", status_code=201)
async def create_iceberg_catalog(data: dict) -> dict:
    if not data.get("name") or not data.get("url"):
        raise HTTPException(status_code=400, detail="name and url are required")
    return await store.create_catalog_connection(data)


@app.get("/api/iceberg-catalogs/{conn_id}")
async def get_iceberg_catalog(conn_id: str) -> dict:
    conn = await store.get_catalog_connection(conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Catalog connection not found")
    return store._safe_conn_dict(conn)


@app.put("/api/iceberg-catalogs/{conn_id}")
async def update_iceberg_catalog(conn_id: str, data: dict) -> dict:
    result = await store.update_catalog_connection(conn_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Catalog connection not found")
    return result


@app.delete("/api/iceberg-catalogs/{conn_id}")
async def delete_iceberg_catalog(conn_id: str) -> dict:
    deleted = await store.delete_catalog_connection(conn_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Catalog connection not found")
    return {"deleted": True}


@app.post("/api/iceberg-catalogs/{conn_id}/test")
async def test_iceberg_catalog(conn_id: str) -> dict:
    conn = await store.get_catalog_connection(conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Catalog connection not found")
    try:
        client = _get_iceberg_client(conn)
        config = await client.test_connection()
        return {"ok": True, "config": config}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/iceberg-catalogs/{conn_id}/namespaces")
async def list_iceberg_namespaces(
    conn_id: str,
    parent: str = Query(None),
) -> list[str]:
    conn = await store.get_catalog_connection(conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Catalog connection not found")
    try:
        client = _get_iceberg_client(conn)
        return await client.list_namespaces(parent=parent)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Iceberg catalog error: {e}")


@app.get("/api/iceberg-catalogs/{conn_id}/namespaces/{ns:path}")
async def browse_iceberg_namespace(conn_id: str, ns: str) -> list[dict]:
    conn = await store.get_catalog_connection(conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Catalog connection not found")
    try:
        client = _get_iceberg_client(conn)
        return await client.list_sub_namespaces(ns)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Iceberg catalog error: {e}")


# ── Dremio Connection Settings ────────────────────────────────────────────────

class ConnectionSettings(BaseModel):
    host: str
    port: int = 9047
    ssl: bool = False
    auth_type: str = "password"   # "password" | "pat"
    user: str = ""
    password: str = ""
    pat: str = ""
    project_id: str = ""          # Dremio Cloud project ID


@app.get("/api/settings/connection")
async def get_connection_settings() -> dict:
    from config import settings as cfg
    return cfg.as_dict(redact=True)


@app.put("/api/settings/connection")
async def update_connection_settings(body: ConnectionSettings) -> dict:
    from config import settings as cfg
    from dremio_client import dremio_client as dc

    cfg.update(
        dremio_host=body.host,
        dremio_port=body.port,
        dremio_ssl=body.ssl,
        dremio_auth_type=body.auth_type,
        dremio_user=body.user,
        dremio_pass=body.password,
        dremio_pat=body.pat,
        dremio_project_id=body.project_id,
    )
    dc.invalidate_token()

    # Persist to DB (don't overwrite secrets with placeholder "***")
    mapping = {
        "conn_host": body.host,
        "conn_port": str(body.port),
        "conn_ssl": str(body.ssl).lower(),
        "conn_auth_type": body.auth_type,
        "conn_user": body.user,
        "conn_project_id": body.project_id,
        "conn_pass": body.password if body.password and body.password != "***" else None,
        "conn_pat": body.pat if body.pat and body.pat != "***" else None,
    }
    for k, v in mapping.items():
        if v is not None:
            await store.set_setting(k, v)

    return cfg.as_dict(redact=True)


@app.post("/api/settings/connection/test")
async def test_connection_settings() -> dict:
    from dremio_client import dremio_client as dc
    return await dc.test_connection()


class NotificationSettings(BaseModel):
    notify_email_enabled: Optional[bool] = False
    notify_email_smtp_host: Optional[str] = ""
    notify_email_smtp_port: Optional[str] = ""
    notify_email_smtp_user: Optional[str] = ""
    notify_email_smtp_pass: Optional[str] = ""
    notify_email_from: Optional[str] = ""
    notify_email_to: Optional[str] = ""
    notify_slack_enabled: Optional[bool] = False
    notify_slack_webhook_url: Optional[str] = ""


@app.get("/api/settings/notifications")
async def get_notification_settings() -> dict:
    return await store.get_notification_settings()


@app.put("/api/settings/notifications")
async def update_notification_settings(body: NotificationSettings) -> dict:
    await store.save_notification_settings(body.model_dump())
    return await store.get_notification_settings()


@app.post("/api/settings/notifications/test")
async def test_notification_settings() -> dict:
    from scheduler import send_failure_notification
    try:
        await send_failure_notification("Test Pipeline", "This is a test notification from Transform Studio.")
        return {"ok": True, "message": "Test notification sent"}
    except Exception as e:
        return {"ok": False, "message": str(e)}


@app.get("/api/iceberg-catalogs/{conn_id}/table-schema")
async def get_iceberg_table_schema(
    conn_id: str,
    table: str = Query(..., description="dot-separated: namespace.table"),
) -> list[dict]:
    conn = await store.get_catalog_connection(conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Catalog connection not found")
    parts = table.rsplit(".", 1)
    if len(parts) < 2:
        raise HTTPException(status_code=400, detail="table must be namespace.tablename")
    namespace, table_name = parts[0], parts[1]
    try:
        client = _get_iceberg_client(conn)
        return await client.get_table_schema(namespace, table_name)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Iceberg catalog error: {e}")


# ── Pipeline Schedules ────────────────────────────────────────────────────────

class ScheduleCreate(BaseModel):
    cron_expression: str
    enabled: bool = True


class ScheduleUpdate(BaseModel):
    cron_expression: Optional[str] = None
    enabled: Optional[bool] = None


@app.get("/api/schedules", tags=["schedules"], summary="List all pipeline schedules")
async def list_all_schedules() -> list[dict]:
    """Returns all schedules across all pipelines with cron expression, enabled status, and last run info."""
    return await store.list_schedules()


@app.get("/api/pipelines/{pipeline_id}/schedules", tags=["schedules"], summary="List schedules for a specific pipeline")
async def list_pipeline_schedules(pipeline_id: str, current_user: dict = Depends(get_current_user)) -> List[dict]:
    uid = current_user["user_id"] if current_user else "default"
    pipeline = await store.get_pipeline(pipeline_id, user_id=uid)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return await store.list_schedules(pipeline_id=pipeline_id)


@app.post("/api/pipelines/{pipeline_id}/schedules", status_code=201, tags=["schedules"], summary="Create a cron schedule for a pipeline")
async def create_pipeline_schedule(pipeline_id: str, body: ScheduleCreate, current_user: dict = Depends(get_current_user)) -> dict:
    """Schedule a pipeline to run automatically. `cron_expression` uses standard 5-field cron syntax (e.g. `0 6 * * *` for daily at 6am UTC). Set `enabled: false` to create a disabled schedule."""
    uid = current_user["user_id"] if current_user else "default"
    pipeline = await store.get_pipeline(pipeline_id, user_id=uid)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    # Validate cron expression
    from croniter import croniter
    if not croniter.is_valid(body.cron_expression):
        raise HTTPException(status_code=400, detail=f"Invalid cron expression: {body.cron_expression!r}")
    return await store.create_schedule({
        "pipeline_id": pipeline_id,
        "cron_expression": body.cron_expression,
        "enabled": body.enabled,
    })


@app.put("/api/schedules/{schedule_id}")
async def update_schedule(schedule_id: str, body: ScheduleUpdate) -> dict:
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if "cron_expression" in data:
        from croniter import croniter
        if not croniter.is_valid(data["cron_expression"]):
            raise HTTPException(status_code=400, detail=f"Invalid cron expression: {data['cron_expression']!r}")
    result = await store.update_schedule(schedule_id, data)
    if result is None:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return result


@app.delete("/api/schedules/{schedule_id}")
async def delete_schedule(schedule_id: str) -> dict:
    deleted = await store.delete_schedule(schedule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"deleted": True}


@app.post("/api/schedules/{schedule_id}/run")
async def manually_run_schedule(schedule_id: str) -> dict:
    sched = await store.get_schedule(schedule_id)
    if sched is None:
        raise HTTPException(status_code=404, detail="Schedule not found")
    import asyncio as _asyncio
    _asyncio.create_task(scheduler._run_pipeline(sched))
    return {"triggered": True, "schedule_id": schedule_id}


# ── Pipeline Run History ──────────────────────────────────────────────────────

@app.get("/api/pipelines/{pipeline_id}/runs", tags=["pipelines"], summary="Get run history for a pipeline")
async def get_pipeline_runs(pipeline_id: str, limit: int = 50, current_user: dict = Depends(get_current_user)) -> List[dict]:
    """Returns the last `limit` (default 50) execution records for this pipeline, including status, row count, duration, and test results."""
    uid = current_user["user_id"] if current_user else "default"
    pipeline = await store.get_pipeline(pipeline_id, user_id=uid)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return await store.get_pipeline_runs(pipeline_id, limit=limit)


@app.get("/api/runs", tags=["pipelines"], summary="Get run history across all pipelines")
async def get_all_runs(limit: int = 100) -> List[dict]:
    """Returns the last `limit` (default 100) execution records across all pipelines, sorted by most recent first."""
    return await store.get_all_runs(limit=limit)


# ── Webhook Endpoints ─────────────────────────────────────────────────────────

class WebhookTriggerBody(BaseModel):
    param_values: Optional[Dict[str, str]] = None
    async_run: bool = True  # called "async" in docs but that's a keyword


@app.post("/api/webhooks/{webhook_token}/trigger")
async def webhook_trigger(webhook_token: str, body: Optional[WebhookTriggerBody] = None) -> dict:
    pipeline = await store.get_pipeline_by_webhook(webhook_token)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    pv = body.param_values if body else None
    async_run = body.async_run if body else True

    async def _do_execute():
        started_at = datetime.now(timezone.utc).isoformat()
        start_ms = int(time.time() * 1000)
        try:
            if not pipeline.output_table:
                return
            mode = pipeline.output_mode
            if mode not in ("ctas", "insert", "view"):
                return
            initial_columns = await _fetch_column_names(pipeline.source_table)
            sql = compile_execute(
                pipeline.source_table, pipeline.steps, pipeline.output_table, mode,
                initial_columns=initial_columns or None,
                param_values=pv,
                parameters=pipeline.parameters,
            )
            token = await dremio_client._get_token()
            job_info = await dremio_client.sql(sql, token)
            job_id = job_info["id"]
            result = await dremio_client.poll_job(job_id, token)
            duration_ms = int(time.time() * 1000) - start_ms
            completed_at = datetime.now(timezone.utc).isoformat()
            if result.get("jobState") == "FAILED":
                error_msg = result.get("errorMessage", "Job failed")
                await store.log_run(
                    pipeline_id=pipeline.id, pipeline_name=pipeline.name,
                    run_type="webhook", status="failed",
                    row_count=None, error_message=error_msg,
                    started_at=started_at, completed_at=completed_at,
                )
            else:
                await store.log_run(
                    pipeline_id=pipeline.id, pipeline_name=pipeline.name,
                    run_type="webhook", status="success",
                    row_count=result.get("outputRecords"),
                    error_message=None,
                    started_at=started_at, completed_at=completed_at,
                )
        except Exception as exc:
            completed_at = datetime.now(timezone.utc).isoformat()
            await store.log_run(
                pipeline_id=pipeline.id, pipeline_name=pipeline.name,
                run_type="webhook", status="failed",
                row_count=None, error_message=str(exc),
                started_at=started_at, completed_at=completed_at,
            )

    if async_run:
        run = await store.log_run(
            pipeline_id=pipeline.id, pipeline_name=pipeline.name,
            run_type="webhook", status="running",
            row_count=None, error_message=None,
            started_at=datetime.now(timezone.utc).isoformat(),
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        _asyncio.create_task(_do_execute())
        return {"job_id": run["id"], "pipeline_id": pipeline.id, "status": "running"}
    else:
        await _do_execute()
        return {"pipeline_id": pipeline.id, "status": "completed"}


@app.get("/api/webhooks/{webhook_token}/status/{job_id}")
async def webhook_status(webhook_token: str, job_id: str) -> dict:
    pipeline = await store.get_pipeline_by_webhook(webhook_token)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    run = await store.get_run_by_id(job_id)
    if run is None or run["pipeline_id"] != pipeline.id:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "status": run["status"],
        "row_count": run.get("row_count"),
        "error": run.get("error_message"),
    }


@app.post("/api/pipelines/{pipeline_id}/webhook/regenerate")
async def regenerate_webhook(pipeline_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    uid = current_user["user_id"] if current_user else "default"
    pipeline = await store.get_pipeline(pipeline_id, user_id=uid)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    new_token = await store.regenerate_webhook_token(pipeline_id)
    return {"webhook_token": new_token, "pipeline_id": pipeline_id}


# ── Data Quality Hub ─────────────────────────────────────────────────────────

@app.get("/api/dq/rules", tags=["dq"], summary="List all available DQ rule types")
async def list_dq_rules() -> list:
    """Returns the catalog of 14 configurable data quality rules with their IDs, names, descriptions, and config schemas."""
    from dq_engine import RULE_CATALOG
    return RULE_CATALOG


@app.get("/api/dq/monitors", tags=["dq"], summary="List all DQ monitors")
async def list_dq_monitors(current_user: dict = Depends(get_current_user)) -> list:
    """Returns all configured DQ monitors with latest score and scan timestamp."""
    return await store.list_dq_monitors()


@app.post("/api/dq/monitors", status_code=201, tags=["dq"], summary="Create a DQ monitor")
async def create_dq_monitor(
    body: dict,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create a new DQ monitor for a Dremio table. Required: table_name, rules_json. Optional: display_name, schedule_cron."""
    if not body.get("table_name"):
        raise HTTPException(status_code=400, detail="table_name is required")
    if "rules_json" not in body:
        body["rules_json"] = "[]"
    return await store.create_dq_monitor(body)


@app.get("/api/dq/monitors/{monitor_id}", tags=["dq"], summary="Get a DQ monitor")
async def get_dq_monitor(
    monitor_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    m = await store.get_dq_monitor(monitor_id)
    if not m:
        raise HTTPException(status_code=404, detail="Monitor not found")
    return m


@app.put("/api/dq/monitors/{monitor_id}", tags=["dq"], summary="Update a DQ monitor")
async def update_dq_monitor(
    monitor_id: str,
    body: dict,
    current_user: dict = Depends(get_current_user),
) -> dict:
    m = await store.update_dq_monitor(monitor_id, body)
    if not m:
        raise HTTPException(status_code=404, detail="Monitor not found")
    return m


@app.delete("/api/dq/monitors/{monitor_id}", status_code=204, response_model=None, tags=["dq"], summary="Delete a DQ monitor")
async def delete_dq_monitor(
    monitor_id: str,
    current_user: dict = Depends(get_current_user),
):
    ok = await store.delete_dq_monitor(monitor_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Monitor not found")


@app.post("/api/dq/monitors/{monitor_id}/scan", tags=["dq"], summary="Run a DQ scan now")
async def run_dq_scan(
    monitor_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Execute all rules for this monitor against the configured Dremio table. Returns the scan result with per-rule scores."""
    m = await store.get_dq_monitor(monitor_id)
    if not m:
        raise HTTPException(status_code=404, detail="Monitor not found")

    import time as _time
    from dq_engine import run_scan as _run_scan
    rules = _json_mod.loads(m["rules_json"] or "[]")
    start = _time.time()
    try:
        result = await _run_scan(m["table_name"], rules, dremio_client, catalog_client)
    except Exception as scan_err:
        result = {
            "overall_score": 0.0,
            "status": "error",
            "error_message": str(scan_err),
            "rule_results": [],
        }
    duration_ms = int((_time.time() - start) * 1000)
    result["duration_ms"] = duration_ms

    scan_record = await store.save_dq_scan_result(monitor_id, result)
    # Update monitor with latest scan timestamp and score
    await store.update_dq_monitor(monitor_id, {
        "last_scan_at": scan_record["scanned_at"],
        "last_score": result.get("overall_score"),
    })
    return scan_record


@app.get("/api/dq/monitors/{monitor_id}/results", tags=["dq"], summary="Get scan history for a DQ monitor")
async def get_dq_scan_results(
    monitor_id: str,
    limit: int = 20,
    current_user: dict = Depends(get_current_user),
) -> list:
    """Returns the last N scan results for this monitor, most recent first."""
    return await store.get_dq_scan_results(monitor_id, limit=limit)


@app.get("/api/dq/dashboard", tags=["dq"], summary="DQ dashboard — all monitors with latest scores")
async def dq_dashboard(current_user: dict = Depends(get_current_user)) -> list:
    """Returns all monitors with their latest scan result for the DQ dashboard view."""
    return await store.get_dq_dashboard()


# ── Static frontend (desktop / Docker production build) ───────────────────────
# ── MCP Server (HTTP/SSE transport) ──────────────────────────────────────────
#
# Exposes Transform Studio as an MCP tool server so AI agents (Claude Desktop,
# Claude Code, custom agents) can drive the app directly.
#
# Transport: HTTP + Server-Sent Events (MCP spec 2024-11-05)
#   GET  /mcp/sse           — open SSE stream, receive endpoint URL
#   POST /mcp/messages      — send JSON-RPC tool calls
#
# Claude Desktop config (claude_desktop_config.json):
#   {
#     "mcpServers": {
#       "transform-studio": {
#         "url": "http://localhost:8000/mcp/sse",
#         "transport": "sse"
#       }
#     }
#   }
# Add "headers": {"Authorization": "Bearer <token>"} when AUTH_ENABLED=true.

_mcp_sessions: dict[str, _asyncio.Queue] = {}

_MCP_TOOLS = [
    {"name": "ts_health", "description": "Check that the Transform Studio backend is running and the Dremio connection is healthy.", "inputSchema": {"type": "object", "properties": {}, "required": []}},
    {"name": "ts_list_transforms", "description": "List all 52 available transform types with IDs, names, and descriptions. Use to discover what transforms can be added to a pipeline.", "inputSchema": {"type": "object", "properties": {}, "required": []}},
    {"name": "ts_list_namespaces", "description": "List top-level Dremio namespaces (spaces and sources). Starting point for browsing available data.", "inputSchema": {"type": "object", "properties": {}, "required": []}},
    {"name": "ts_browse_namespace", "description": "List tables and sub-namespaces under a Dremio namespace path. Returns name and type (TABLE, VIEW, CONTAINER).", "inputSchema": {"type": "object", "properties": {"namespace": {"type": "string", "description": "Namespace to browse, e.g. 'my_space'"}}, "required": ["namespace"]}},
    {"name": "ts_get_table_schema", "description": "Get column names and types for a Dremio table. Use before building a pipeline to understand the source data.", "inputSchema": {"type": "object", "properties": {"table": {"type": "string", "description": "Fully qualified table name, e.g. 'my_space.my_table'"}}, "required": ["table"]}},
    {"name": "ts_profile_table", "description": "Profile a Dremio table: row count, null%, distinct count, min/max per column. Cached 1 hour.", "inputSchema": {"type": "object", "properties": {"table": {"type": "string"}, "refresh": {"type": "boolean"}}, "required": ["table"]}},
    {"name": "ts_list_pipelines", "description": "List all saved pipelines with source, output, step count, and dependencies.", "inputSchema": {"type": "object", "properties": {}, "required": []}},
    {"name": "ts_get_pipeline", "description": "Get full details for a single pipeline including all steps and configuration.", "inputSchema": {"type": "object", "properties": {"pipeline_id": {"type": "string"}}, "required": ["pipeline_id"]}},
    {"name": "ts_create_pipeline", "description": "Create a new pipeline. Returns the pipeline ID. Add steps with ts_save_pipeline.", "inputSchema": {"type": "object", "properties": {"name": {"type": "string"}, "source_table": {"type": "string"}, "description": {"type": "string"}}, "required": ["name", "source_table"]}},
    {
        "name": "ts_save_pipeline",
        "description": (
            "Save/update a pipeline — steps, output table, output mode, parameters, tests, dependencies. "
            "Full replace. output_mode: 'preview'|'ctas'|'insert'|'view'|'incremental'|'scd2'. "
            "Each step: {id, transform_id, label, config}."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "pipeline_id": {"type": "string"},
                "name": {"type": "string"},
                "description": {"type": "string"},
                "source_table": {"type": "string"},
                "output_table": {"type": "string"},
                "output_mode": {"type": "string", "enum": ["preview", "ctas", "insert", "view", "incremental", "scd2"]},
                "steps": {"type": "array", "items": {"type": "object"}},
                "dependencies": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["pipeline_id", "name", "source_table"],
        },
    },
    {"name": "ts_preview_pipeline", "description": "Run pipeline in preview mode — returns up to 500 rows, no writes. Validates logic before execute.", "inputSchema": {"type": "object", "properties": {"pipeline_id": {"type": "string"}, "param_values": {"type": "object"}}, "required": ["pipeline_id"]}},
    {"name": "ts_execute_pipeline", "description": "Execute a pipeline and write output to Dremio. Runs tests after. Returns rows written, duration, test results, metadata push status.", "inputSchema": {"type": "object", "properties": {"pipeline_id": {"type": "string"}, "output_table": {"type": "string"}, "output_mode": {"type": "string"}, "param_values": {"type": "object"}}, "required": ["pipeline_id"]}},
    {"name": "ts_execute_with_deps", "description": "Execute a pipeline and ALL its upstream dependencies in topological order. Failed steps cause downstream skips.", "inputSchema": {"type": "object", "properties": {"pipeline_id": {"type": "string"}, "param_values": {"type": "object"}}, "required": ["pipeline_id"]}},
    {"name": "ts_run_tests", "description": "Run all tests on a pipeline against its current output table. Test types: not_null, unique, row_count_between, accepted_values, custom_sql.", "inputSchema": {"type": "object", "properties": {"pipeline_id": {"type": "string"}}, "required": ["pipeline_id"]}},
    {"name": "ts_get_pipeline_runs", "description": "Get execution history for a pipeline — status, rows, duration, test results per run.", "inputSchema": {"type": "object", "properties": {"pipeline_id": {"type": "string"}, "limit": {"type": "integer"}}, "required": ["pipeline_id"]}},
    {"name": "ts_get_dag", "description": "Get the full cross-pipeline dependency graph: nodes, edges, execution order, cycles.", "inputSchema": {"type": "object", "properties": {}, "required": []}},
    {"name": "ts_seed_table", "description": "Create a Dremio table from CSV content (as a string, max 5000 rows). Column types inferred automatically.", "inputSchema": {"type": "object", "properties": {"table_name": {"type": "string"}, "csv_content": {"type": "string"}, "filename": {"type": "string"}}, "required": ["table_name", "csv_content"]}},
    {"name": "ts_list_environments", "description": "List all saved Dremio connection environments (dev/staging/prod). Active one has is_active=true.", "inputSchema": {"type": "object", "properties": {}, "required": []}},
    {"name": "ts_activate_environment", "description": "Switch the active Dremio connection to a saved environment. Takes effect immediately.", "inputSchema": {"type": "object", "properties": {"env_id": {"type": "string"}}, "required": ["env_id"]}},
    {"name": "ts_schedule_pipeline", "description": "Schedule a pipeline on a cron expression (e.g. '0 6 * * *' = daily 6am UTC).", "inputSchema": {"type": "object", "properties": {"pipeline_id": {"type": "string"}, "cron_expression": {"type": "string"}, "enabled": {"type": "boolean"}}, "required": ["pipeline_id", "cron_expression"]}},
    {"name": "ts_delete_pipeline", "description": "Permanently delete a pipeline and all its history. Irreversible.", "inputSchema": {"type": "object", "properties": {"pipeline_id": {"type": "string"}}, "required": ["pipeline_id"]}},
    {"name": "ts_get_column_lineage", "description": "Get column-level lineage for a pipeline — shows how each output column traces back through every transform step to its source column(s). Useful for understanding data flow and impact analysis.", "inputSchema": {"type": "object", "properties": {"pipeline_id": {"type": "string"}}, "required": ["pipeline_id"]}},
    {"name": "ts_list_alerts", "description": "List all configured alerts with their type, schedule, enabled status, and last run result. Alert types: custom_sql, pipeline_health, data_quality, source_freshness.", "inputSchema": {"type": "object", "properties": {}, "required": []}},
    {"name": "ts_run_alert", "description": "Run an alert immediately and return the result — whether it triggered, the message, and status (ok/triggered/error).", "inputSchema": {"type": "object", "properties": {"alert_id": {"type": "string"}}, "required": ["alert_id"]}},
]


async def _mcp_dispatch(name: str, args: dict, current_user: dict) -> Any:
    """Async tool dispatch — calls internal functions directly, no HTTP round-trip."""
    uid = current_user["user_id"] if current_user else "default"

    if name == "ts_health":
        result = await dremio_client.test_connection()
        return {"status": "ok", "dremio": result["ok"]}

    elif name == "ts_list_transforms":
        transforms = reg.list_transforms()
        return [{"id": t.id, "name": t.name, "category": getattr(t, "category", ""), "description": t.description} for t in transforms]

    elif name == "ts_list_namespaces":
        return await catalog_client.list_namespaces()

    elif name == "ts_browse_namespace":
        return await catalog_client.list_tables(args["namespace"])

    elif name == "ts_get_table_schema":
        parts = args["table"].rsplit(".", 1)
        if len(parts) < 2:
            return {"error": "table must be namespace.tablename"}
        return await catalog_client.get_table_schema(parts[0], parts[1])

    elif name == "ts_profile_table":
        return await profile_table(table=args["table"], refresh=args.get("refresh", False))

    elif name == "ts_list_pipelines":
        pipelines = await store.list_pipelines(user_id=uid)
        return [{"id": p.id, "name": p.name, "source_table": p.source_table, "output_table": p.output_table, "output_mode": p.output_mode, "steps_count": len(p.steps), "dependencies": p.dependencies, "updated_at": p.updated_at} for p in pipelines]

    elif name == "ts_get_pipeline":
        p = await store.get_pipeline(args["pipeline_id"], user_id=uid)
        if p is None:
            return {"error": "Pipeline not found"}
        return p.model_dump()

    elif name == "ts_create_pipeline":
        from models import PipelineCreate as _PC
        p = await store.create_pipeline(_PC(name=args["name"], source_table=args["source_table"], description=args.get("description", "")), user_id=uid)
        return {"id": p.id, "name": p.name, "source_table": p.source_table}

    elif name == "ts_save_pipeline":
        from models import PipelineSave as _PS
        pid = args.pop("pipeline_id")
        try:
            p = await store.save_pipeline(pid, _PS(**args), user_id=uid)
            return {"id": p.id, "name": p.name, "version": p.current_version}
        except Exception as e:
            return {"error": str(e)}

    elif name == "ts_preview_pipeline":
        p = await store.get_pipeline(args["pipeline_id"], user_id=uid)
        if p is None:
            return {"error": "Pipeline not found"}
        result = await _run_preview(p.source_table, p.steps, parameters=p.parameters, param_values=args.get("param_values"))
        return {"columns": result.columns, "rows": result.rows[:20], "total_rows": result.total_rows, "truncated": result.truncated}

    elif name == "ts_execute_pipeline":
        class _Body:
            output_table = args.get("output_table")
            output_mode = args.get("output_mode")
            param_values = args.get("param_values")
        result = await execute_pipeline(args["pipeline_id"], _Body(), current_user)
        return result.model_dump()

    elif name == "ts_execute_with_deps":
        class _Body2:
            param_values = args.get("param_values")
            output_table = None
            output_mode = None
        result = await execute_with_deps(args["pipeline_id"], _Body2(), current_user)
        return result.model_dump()

    elif name == "ts_run_tests":
        result = await run_pipeline_tests_endpoint(args["pipeline_id"], current_user)
        return result

    elif name == "ts_get_pipeline_runs":
        limit = args.get("limit", 20)
        return await store.get_pipeline_runs(args["pipeline_id"], limit=limit)

    elif name == "ts_get_dag":
        pipelines = await store.list_pipelines(user_id=uid)
        return build_dag_response([p.model_dump() for p in pipelines])

    elif name == "ts_seed_table":
        csv_bytes = args["csv_content"].encode("utf-8")
        filename = args.get("filename", "seed.csv")
        from fastapi import UploadFile as _UF
        import io as _io
        mock_file = _UF(filename=filename, file=_io.BytesIO(csv_bytes))
        result = await seed_table(table_name=args["table_name"], file=mock_file, current_user=current_user)
        return result.model_dump()

    elif name == "ts_list_environments":
        return await store.list_environments()

    elif name == "ts_activate_environment":
        return await activate_environment(args["env_id"], current_user)

    elif name == "ts_schedule_pipeline":
        from croniter import croniter as _cron
        cron = args["cron_expression"]
        if not _cron.is_valid(cron):
            return {"error": f"Invalid cron expression: {cron!r}"}
        return await store.create_schedule({"pipeline_id": args["pipeline_id"], "cron_expression": cron, "enabled": args.get("enabled", True)})

    elif name == "ts_delete_pipeline":
        deleted = await store.delete_pipeline(args["pipeline_id"])
        return {"deleted": deleted}

    elif name == "ts_get_column_lineage":
        p = await store.get_pipeline(args["pipeline_id"], user_id=uid)
        if p is None:
            return {"error": "Pipeline not found"}
        from transforms.codegen import compute_column_lineage
        schema = await catalog_client.get_table_schema(
            p.source_table.rsplit(".", 1)[0] if "." in p.source_table else p.source_table,
            p.source_table.rsplit(".", 1)[-1],
        )
        source_cols = [c["name"] for c in schema] if schema else []
        return compute_column_lineage(p.steps, source_cols)

    elif name == "ts_list_alerts":
        alerts = await store.list_alerts()
        return [
            {
                "id": a["id"], "name": a["name"], "alert_type": a["alert_type"],
                "cron_expression": a["cron_expression"], "enabled": bool(a["enabled"]),
                "last_run_at": a["last_run_at"], "last_run_status": a["last_run_status"],
            }
            for a in alerts
        ]

    elif name == "ts_run_alert":
        from alert_runner import run_alert as _run_alert
        alert = await store.get_alert(args["alert_id"])
        if alert is None:
            return {"error": "Alert not found"}
        status, message = await _run_alert(alert, store, dremio_client)
        await store.record_alert_check(args["alert_id"], alert.get("name", ""), status, message)
        return {"status": status, "triggered": status == "triggered", "message": message}

    else:
        raise ValueError(f"Unknown tool: {name}")


def _mcp_response(req_id: Any, result: Any) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "result": {"content": [{"type": "text", "text": _json_mod.dumps(result, indent=2, default=str)}], "isError": False}}


def _mcp_error(req_id: Any, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "result": {"content": [{"type": "text", "text": message}], "isError": True}}


async def _mcp_handle(request: dict, current_user: dict) -> Optional[dict]:
    method = request.get("method")
    req_id = request.get("id")

    if method == "initialize":
        return {"jsonrpc": "2.0", "id": req_id, "result": {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}, "serverInfo": {"name": "transform-studio", "version": "1.5.0"}}}

    elif method == "tools/list":
        return {"jsonrpc": "2.0", "id": req_id, "result": {"tools": _MCP_TOOLS}}

    elif method == "tools/call":
        params = request.get("params", {})
        tool_name = params.get("name")
        tool_args = params.get("arguments", {})
        try:
            result = await _mcp_dispatch(tool_name, tool_args, current_user)
            return _mcp_response(req_id, result)
        except Exception as e:
            return _mcp_error(req_id, str(e))

    elif method == "notifications/initialized":
        return None  # no response for notifications

    return None


@app.get("/mcp/sse", tags=["system"], summary="MCP Server — open SSE stream for AI agent connections")
async def mcp_sse(request: Request, current_user: dict = Depends(get_current_user)):
    """
    Server-Sent Events endpoint for the MCP (Model Context Protocol) server.
    Connect here to use Transform Studio as an AI agent tool. Claude Desktop config:

        {"url": "http://localhost:8000/mcp/sse", "transport": "sse"}

    Add Authorization header when AUTH_ENABLED=true.
    """
    session_id = str(_uuid_mod.uuid4())
    queue: _asyncio.Queue = _asyncio.Queue()
    _mcp_sessions[session_id] = queue

    async def event_stream():
        # Send endpoint event so client knows where to POST messages
        endpoint = f"/mcp/messages?sessionId={session_id}"
        yield f"event: endpoint\ndata: {_json_mod.dumps({'uri': endpoint})}\n\n"
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    message = await _asyncio.wait_for(queue.get(), timeout=25.0)
                    if message is None:
                        break
                    yield f"data: {_json_mod.dumps(message)}\n\n"
                except _asyncio.TimeoutError:
                    yield ": keepalive\n\n"  # prevent proxy timeouts
        finally:
            _mcp_sessions.pop(session_id, None)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@app.post("/mcp/messages", tags=["system"], summary="MCP Server — receive JSON-RPC tool calls from AI agents")
async def mcp_messages(
    sessionId: str = Query(...),
    request: Request = None,
    current_user: dict = Depends(get_current_user),
):
    """Send a JSON-RPC message to the MCP server. Responses are returned via the SSE stream opened at /mcp/sse."""
    if sessionId not in _mcp_sessions:
        raise HTTPException(status_code=404, detail="MCP session not found or expired. Re-connect to /mcp/sse.")
    body = await request.json()
    response = await _mcp_handle(body, current_user)
    if response is not None:
        await _mcp_sessions[sessionId].put(response)
    return {"ok": True}


# ── Static frontend ───────────────────────────────────────────────────────────

# Mount the pre-built React app so FastAPI can serve everything on one port.
# In development the Vite dev server handles the frontend separately.

import os as _os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse as _FileResponse


def _find_frontend_dist() -> Optional[str]:
    # 1. PyInstaller bundle — resource base set by desktop_launcher.py
    resource_base = _os.environ.get("_TS_RESOURCE_BASE", "")
    if resource_base:
        p = _os.path.join(resource_base, "frontend_dist")
        if _os.path.isdir(p):
            return p
    # 2. Docker / server build — dist folder next to backend
    candidates = [
        _os.path.join(_os.path.dirname(__file__), "..", "frontend", "dist"),
        _os.path.join(_os.path.dirname(__file__), "frontend_dist"),
    ]
    for c in candidates:
        if _os.path.isdir(c):
            return _os.path.realpath(c)
    return None


_frontend_dist = _find_frontend_dist()
if _frontend_dist:
    # Serve everything under "/" — but API routes registered above take priority
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="frontend")
