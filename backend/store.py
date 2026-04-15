from __future__ import annotations
import json
import uuid
from datetime import datetime, timezone
from typing import Optional, List

import aiosqlite

from config import settings
from models import Pipeline, PipelineCreate, PipelineSave, TransformStep, PipelineParameter, PipelineTest, Exposure


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class PipelineStore:
    def __init__(self):
        self._db_path = settings.db_path

    async def init(self):
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS pipelines (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    source_table TEXT NOT NULL,
                    output_table TEXT,
                    output_mode TEXT DEFAULT 'preview',
                    current_version INTEGER DEFAULT 1,
                    created_at TEXT,
                    updated_at TEXT,
                    parameters TEXT DEFAULT '[]',
                    webhook_token TEXT,
                    user_id TEXT DEFAULT 'default'
                )
            """)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS pipeline_versions (
                    id TEXT PRIMARY KEY,
                    pipeline_id TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    steps_json TEXT NOT NULL,
                    message TEXT,
                    created_at TEXT,
                    FOREIGN KEY (pipeline_id) REFERENCES pipelines(id)
                )
            """)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS catalog_connections (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    url TEXT NOT NULL,
                    warehouse TEXT DEFAULT '',
                    auth_type TEXT DEFAULT 'none',
                    token TEXT DEFAULT '',
                    client_id TEXT DEFAULT '',
                    client_secret TEXT DEFAULT '',
                    oauth_scope TEXT DEFAULT 'PRINCIPAL_ROLE:ALL',
                    prefix TEXT DEFAULT 'v1',
                    created_at TEXT,
                    updated_at TEXT
                )
            """)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            """)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS pipeline_schedules (
                    id TEXT PRIMARY KEY,
                    pipeline_id TEXT NOT NULL,
                    cron_expression TEXT NOT NULL,
                    enabled INTEGER DEFAULT 1,
                    last_run_at TEXT,
                    last_run_status TEXT,
                    last_run_error TEXT,
                    next_run_at TEXT,
                    max_retries INTEGER DEFAULT 0,
                    retry_count INTEGER DEFAULT 0,
                    retry_next_at TEXT,
                    created_at TEXT,
                    updated_at TEXT,
                    FOREIGN KEY (pipeline_id) REFERENCES pipelines(id)
                )
            """)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS pipeline_runs (
                    id TEXT PRIMARY KEY,
                    pipeline_id TEXT NOT NULL,
                    pipeline_name TEXT NOT NULL,
                    run_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    row_count INTEGER,
                    error_message TEXT,
                    started_at TEXT NOT NULL,
                    completed_at TEXT NOT NULL
                )
            """)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS profile_cache (
                    table_name TEXT PRIMARY KEY,
                    result_json TEXT NOT NULL,
                    cached_at TEXT NOT NULL
                )
            """)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    is_admin INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL
                )
            """)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS custom_transforms (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    sql_template TEXT NOT NULL,
                    tags TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    use_count INTEGER DEFAULT 0
                )
            """)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS alerts (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    alert_type TEXT NOT NULL,
                    config_json TEXT NOT NULL,
                    schedule TEXT NOT NULL,
                    enabled INTEGER DEFAULT 1,
                    notify_email INTEGER DEFAULT 1,
                    notify_slack INTEGER DEFAULT 1,
                    last_checked_at TEXT,
                    last_status TEXT,
                    last_message TEXT,
                    last_triggered_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS alert_history (
                    id TEXT PRIMARY KEY,
                    alert_id TEXT NOT NULL,
                    alert_name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    message TEXT,
                    checked_at TEXT NOT NULL,
                    FOREIGN KEY (alert_id) REFERENCES alerts(id)
                )
            """)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS environments (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE,
                    host TEXT NOT NULL,
                    port INTEGER DEFAULT 9047,
                    ssl INTEGER DEFAULT 0,
                    auth_type TEXT DEFAULT 'password',
                    user TEXT DEFAULT '',
                    password TEXT DEFAULT '',
                    pat TEXT DEFAULT '',
                    project_id TEXT DEFAULT '',
                    is_active INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL
                )
            """)
            # ── Safe ALTER TABLE migrations ────────────────────────────────────
            for col_sql in [
                "ALTER TABLE pipelines ADD COLUMN parameters TEXT DEFAULT '[]'",
                "ALTER TABLE pipelines ADD COLUMN webhook_token TEXT",
                "ALTER TABLE pipelines ADD COLUMN user_id TEXT DEFAULT 'default'",
                # dbt-style features (v1.2)
                "ALTER TABLE pipelines ADD COLUMN dependencies TEXT DEFAULT '[]'",
                "ALTER TABLE pipelines ADD COLUMN incremental_strategy TEXT",
                "ALTER TABLE pipelines ADD COLUMN incremental_key TEXT",
                "ALTER TABLE pipelines ADD COLUMN tests_json TEXT DEFAULT '[]'",
                # SCD Type 2 (v1.3)
                "ALTER TABLE pipelines ADD COLUMN scd2_key TEXT",
                "ALTER TABLE pipelines ADD COLUMN scd2_tracked_columns TEXT DEFAULT '[]'",
                "ALTER TABLE pipelines ADD COLUMN scd2_effective_from TEXT DEFAULT 'effective_from'",
                "ALTER TABLE pipelines ADD COLUMN scd2_effective_to TEXT DEFAULT 'effective_to'",
                "ALTER TABLE pipelines ADD COLUMN scd2_is_current TEXT DEFAULT 'is_current'",
                # pipeline_runs extended
                "ALTER TABLE pipeline_runs ADD COLUMN test_results_json TEXT",
                # Execution hooks (v1.4)
                "ALTER TABLE pipelines ADD COLUMN pre_hook_sql TEXT",
                "ALTER TABLE pipelines ADD COLUMN post_hook_sql TEXT",
                "ALTER TABLE pipelines ADD COLUMN exposures_json TEXT DEFAULT '[]'",
                "ALTER TABLE pipelines ADD COLUMN microbatch_window TEXT",
                # AWS Glue SigV4 auth for Iceberg catalogs
                "ALTER TABLE catalog_connections ADD COLUMN aws_access_key_id TEXT DEFAULT ''",
                "ALTER TABLE catalog_connections ADD COLUMN aws_secret_access_key TEXT DEFAULT ''",
                "ALTER TABLE catalog_connections ADD COLUMN aws_region TEXT DEFAULT ''",
                "ALTER TABLE catalog_connections ADD COLUMN aws_session_token TEXT DEFAULT ''",
                # Approval workflow (v1.6)
                "ALTER TABLE pipelines ADD COLUMN approval_required INTEGER DEFAULT 0",
                "ALTER TABLE pipelines ADD COLUMN pending_approval_id TEXT",
                # DQ monitor alert thresholds (v1.7)
                "ALTER TABLE dq_monitors ADD COLUMN alert_threshold REAL",
                "ALTER TABLE dq_monitors ADD COLUMN alert_enabled INTEGER DEFAULT 0",
                # Multi-user permissions (v1.7)
                "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'editor'",
                "ALTER TABLE users ADD COLUMN dremio_pat TEXT",
                # Retry logic (v1.9)
                "ALTER TABLE pipeline_schedules ADD COLUMN max_retries INTEGER DEFAULT 0",
                "ALTER TABLE pipeline_schedules ADD COLUMN retry_count INTEGER DEFAULT 0",
                "ALTER TABLE pipeline_schedules ADD COLUMN retry_next_at TEXT",
                # SSO (v1.9)
                "ALTER TABLE users ADD COLUMN sso_provider TEXT",
                "ALTER TABLE users ADD COLUMN sso_sub TEXT",
            ]:
                try:
                    await db.execute(col_sql)
                except Exception:
                    pass
            # pipeline_permissions table (multi-user sharing)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS pipeline_permissions (
                    id TEXT PRIMARY KEY,
                    pipeline_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    access_level TEXT NOT NULL DEFAULT 'viewer',
                    granted_by TEXT,
                    granted_at TEXT NOT NULL,
                    UNIQUE(pipeline_id, user_id),
                    FOREIGN KEY (pipeline_id) REFERENCES pipelines(id),
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            """)
            # SSO provider configs (v1.9)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS sso_configs (
                    id TEXT PRIMARY KEY,
                    provider_name TEXT NOT NULL UNIQUE,
                    display_name TEXT NOT NULL,
                    client_id TEXT NOT NULL,
                    client_secret TEXT NOT NULL,
                    discovery_url TEXT NOT NULL,
                    enabled INTEGER DEFAULT 1,
                    default_role TEXT DEFAULT 'editor',
                    created_at TEXT,
                    updated_at TEXT
                )
            """)
            # pipeline_approvals table (v1.6)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS pipeline_approvals (
                    id TEXT PRIMARY KEY,
                    pipeline_id TEXT NOT NULL,
                    pipeline_name TEXT NOT NULL,
                    proposed_steps_json TEXT NOT NULL,
                    current_steps_json TEXT NOT NULL,
                    submitted_by TEXT NOT NULL,
                    submitted_at TEXT NOT NULL,
                    reviewed_by TEXT,
                    reviewed_at TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    comments TEXT,
                    FOREIGN KEY (pipeline_id) REFERENCES pipelines(id)
                )
            """)
            # ── Data Quality Hub tables ────────────────────────────────────────
            await db.execute("""
                CREATE TABLE IF NOT EXISTS dq_monitors (
                    id TEXT PRIMARY KEY,
                    table_name TEXT NOT NULL,
                    display_name TEXT,
                    rules_json TEXT NOT NULL DEFAULT '[]',
                    schedule_cron TEXT,
                    enabled INTEGER DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    last_scan_at TEXT,
                    last_score REAL
                )
            """)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS dq_scan_results (
                    id TEXT PRIMARY KEY,
                    monitor_id TEXT NOT NULL,
                    scanned_at TEXT NOT NULL,
                    overall_score REAL,
                    rule_results_json TEXT,
                    status TEXT,
                    error_message TEXT,
                    duration_ms INTEGER,
                    FOREIGN KEY (monitor_id) REFERENCES dq_monitors(id)
                )
            """)
            # Generate webhook_token for existing rows that don't have one
            await db.execute(
                "UPDATE pipelines SET webhook_token = lower(hex(randomblob(16))) WHERE webhook_token IS NULL"
            )
            await db.commit()

    # ── Users ─────────────────────────────────────────────────────────────────

    async def create_user(self, username: str, password_hash: str, is_admin: bool = False, role: str = "editor") -> dict:
        user_id = str(uuid.uuid4())
        now = _now_iso()
        # is_admin=True always gets admin role
        effective_role = "admin" if is_admin else role
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                "INSERT INTO users (id, username, password_hash, is_admin, created_at, role) VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, username, password_hash, 1 if is_admin else 0, now, effective_role),
            )
            await db.commit()
        return {"id": user_id, "username": username, "is_admin": is_admin, "role": effective_role, "created_at": now}

    async def get_user_by_username(self, username: str) -> Optional[dict]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM users WHERE username = ?", (username,)) as cur:
                row = await cur.fetchone()
        return dict(row) if row else None

    async def get_user_by_id(self, user_id: str) -> Optional[dict]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM users WHERE id = ?", (user_id,)) as cur:
                row = await cur.fetchone()
        return dict(row) if row else None

    async def list_users(self) -> list:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT id, username, is_admin, role, created_at FROM users ORDER BY created_at") as cur:
                rows = await cur.fetchall()
        result = []
        for row in rows:
            d = dict(row)
            # Derive role from is_admin if role column not yet populated
            if not d.get("role"):
                d["role"] = "admin" if d.get("is_admin") else "editor"
            result.append(d)
        return result

    async def update_user_password(self, user_id: str, new_hash: str) -> None:
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user_id))
            await db.commit()

    async def delete_user(self, user_id: str) -> None:
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute("DELETE FROM users WHERE id = ?", (user_id,))
            await db.commit()

    async def update_user_role(self, user_id: str, role: str) -> None:
        is_admin = 1 if role == "admin" else 0
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                "UPDATE users SET role = ?, is_admin = ? WHERE id = ?",
                (role, is_admin, user_id),
            )
            await db.commit()

    async def update_user_pat(self, user_id: str, pat: str) -> None:
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute("UPDATE users SET dremio_pat = ? WHERE id = ?", (pat, user_id))
            await db.commit()

    async def get_user_dremio_pat(self, user_id: str) -> Optional[str]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT dremio_pat FROM users WHERE id = ?", (user_id,)) as cur:
                row = await cur.fetchone()
        return row["dremio_pat"] if row else None

    # ── Pipeline permissions ───────────────────────────────────────────────────

    async def get_pipeline_permissions(self, pipeline_id: str) -> list:
        """Return all permission grants for a pipeline, including username of each grantee."""
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT pp.id, pp.pipeline_id, pp.user_id, pp.access_level,
                          pp.granted_by, pp.granted_at, u.username
                   FROM pipeline_permissions pp
                   LEFT JOIN users u ON pp.user_id = u.id
                   WHERE pp.pipeline_id = ?
                   ORDER BY pp.granted_at""",
                (pipeline_id,),
            ) as cur:
                rows = await cur.fetchall()
        return [dict(row) for row in rows]

    async def upsert_pipeline_permission(
        self, pipeline_id: str, user_id: str, access_level: str, granted_by: Optional[str] = None
    ) -> dict:
        """Create or update a permission grant. Returns the resulting grant record."""
        perm_id = str(uuid.uuid4())
        now = _now_iso()
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            # Try insert; on conflict (UNIQUE pipeline_id+user_id) update access_level
            await db.execute(
                """INSERT INTO pipeline_permissions (id, pipeline_id, user_id, access_level, granted_by, granted_at)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(pipeline_id, user_id) DO UPDATE SET access_level = excluded.access_level, granted_by = excluded.granted_by, granted_at = excluded.granted_at""",
                (perm_id, pipeline_id, user_id, access_level, granted_by, now),
            )
            await db.commit()
            async with db.execute(
                """SELECT pp.id, pp.pipeline_id, pp.user_id, pp.access_level,
                          pp.granted_by, pp.granted_at, u.username
                   FROM pipeline_permissions pp
                   LEFT JOIN users u ON pp.user_id = u.id
                   WHERE pp.pipeline_id = ? AND pp.user_id = ?""",
                (pipeline_id, user_id),
            ) as cur:
                row = await cur.fetchone()
        return dict(row) if row else {}

    async def remove_pipeline_permission(self, pipeline_id: str, user_id: str) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                "DELETE FROM pipeline_permissions WHERE pipeline_id = ? AND user_id = ?",
                (pipeline_id, user_id),
            )
            await db.commit()
        return True

    async def can_user_edit_pipeline(self, pipeline_id: str, user_id: str, role: Optional[str] = None) -> bool:
        """Returns True if user can edit (save) the pipeline — owner, editor grant, or admin."""
        if role == "admin":
            return True
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT user_id FROM pipelines WHERE id = ?", (pipeline_id,)) as cur:
                row = await cur.fetchone()
        if row is None:
            return False
        if row["user_id"] == user_id:
            return True
        # Check for editor grant
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT access_level FROM pipeline_permissions WHERE pipeline_id = ? AND user_id = ?",
                (pipeline_id, user_id),
            ) as cur:
                perm = await cur.fetchone()
        return perm is not None and perm["access_level"] == "editor"

    async def seed_admin_if_empty(self) -> None:
        """Create admin/admin user if no users exist."""
        from auth import hash_password
        existing = await self.list_users()
        if not existing:
            pw_hash = hash_password("admin")
            await self.create_user("admin", pw_hash, is_admin=True, role="admin")

    async def get_profile_cache(self, table_name: str) -> Optional[dict]:
        """Return cached profile result if it exists and is less than 1 hour old."""
        import json as _json
        from datetime import datetime, timezone, timedelta
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT result_json, cached_at FROM profile_cache WHERE table_name = ?",
                (table_name,)
            ) as cur:
                row = await cur.fetchone()
                if row is None:
                    return None
                cached_at = datetime.fromisoformat(row["cached_at"])
                age = datetime.now(timezone.utc) - cached_at
                if age > timedelta(hours=1):
                    return None
                result = _json.loads(row["result_json"])
                result["cached_at"] = row["cached_at"]
                return result

    async def set_profile_cache(self, table_name: str, result: dict) -> None:
        """Store a profile result in the cache."""
        import json as _json
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "INSERT OR REPLACE INTO profile_cache (table_name, result_json, cached_at) VALUES (?, ?, ?)",
                (table_name, _json.dumps(result), now)
            )
            await db.commit()

    async def clear_profile_cache(self, table_name: str) -> None:
        """Remove a cached profile so the next request re-runs the query."""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM profile_cache WHERE table_name = ?", (table_name,))
            await db.commit()

    def _row_to_pipeline(self, row: aiosqlite.Row, steps: List[TransformStep], version: int) -> Pipeline:
        keys = row.keys()
        raw_params = row["parameters"] if "parameters" in keys else "[]"
        try:
            params_data = json.loads(raw_params or "[]")
            parameters = [PipelineParameter(**p) for p in params_data]
        except Exception:
            parameters = []
        try:
            deps = json.loads(row["dependencies"] if "dependencies" in keys else "[]") or []
        except Exception:
            deps = []
        try:
            tests_data = json.loads(row["tests_json"] if "tests_json" in keys else "[]") or []
            tests = [PipelineTest(**t) for t in tests_data]
        except Exception:
            tests = []
        try:
            scd2_tracked = json.loads(row["scd2_tracked_columns"] if "scd2_tracked_columns" in keys else "[]") or []
        except Exception:
            scd2_tracked = []
        try:
            exposures_data = json.loads(row["exposures_json"] if "exposures_json" in keys else "[]") or []
            exposures = [Exposure(**e) for e in exposures_data]
        except Exception:
            exposures = []
        return Pipeline(
            id=row["id"],
            name=row["name"],
            description=row["description"],
            source_table=row["source_table"],
            output_table=row["output_table"],
            output_mode=row["output_mode"] or "preview",
            steps=steps,
            version=version,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            parameters=parameters,
            webhook_token=row["webhook_token"] if "webhook_token" in keys else None,
            dependencies=deps,
            incremental_strategy=row["incremental_strategy"] if "incremental_strategy" in keys else None,
            incremental_key=row["incremental_key"] if "incremental_key" in keys else None,
            tests=tests,
            scd2_key=row["scd2_key"] if "scd2_key" in keys else None,
            scd2_tracked_columns=scd2_tracked,
            scd2_effective_from=(row["scd2_effective_from"] if "scd2_effective_from" in keys else None) or "effective_from",
            scd2_effective_to=(row["scd2_effective_to"] if "scd2_effective_to" in keys else None) or "effective_to",
            scd2_is_current=(row["scd2_is_current"] if "scd2_is_current" in keys else None) or "is_current",
            pre_hook_sql=row["pre_hook_sql"] if "pre_hook_sql" in keys else None,
            post_hook_sql=row["post_hook_sql"] if "post_hook_sql" in keys else None,
            exposures=exposures,
            microbatch_window=row["microbatch_window"] if "microbatch_window" in keys else None,
            approval_required=bool(row["approval_required"]) if "approval_required" in keys else False,
            pending_approval_id=row["pending_approval_id"] if "pending_approval_id" in keys else None,
            user_id=row["user_id"] if "user_id" in keys else "default",
            shared_access=row["shared_access"] if "shared_access" in keys else None,
            owner_username=row["owner_username"] if "owner_username" in keys else None,
        )

    async def create_pipeline(self, data: PipelineCreate, user_id: str = "default") -> Pipeline:
        pipeline_id = str(uuid.uuid4())
        version_id = str(uuid.uuid4())
        webhook_token = uuid.uuid4().hex
        now = _now_iso()
        steps_json = json.dumps([s.model_dump() for s in data.steps])
        params_json = json.dumps([p.model_dump() for p in data.parameters])
        deps_json = json.dumps(data.dependencies or [])
        tests_json = json.dumps([t.model_dump() for t in (data.tests or [])])
        scd2_tracked_json = json.dumps(data.scd2_tracked_columns or [])
        exposures_json = json.dumps([e.model_dump() for e in (data.exposures or [])])

        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            await db.execute(
                """
                INSERT INTO pipelines (id, name, description, source_table, output_table, output_mode, current_version, created_at, updated_at, parameters, webhook_token, user_id, dependencies, incremental_strategy, incremental_key, tests_json, scd2_key, scd2_tracked_columns, scd2_effective_from, scd2_effective_to, scd2_is_current, pre_hook_sql, post_hook_sql, exposures_json, microbatch_window)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (pipeline_id, data.name, data.description, data.source_table,
                 data.output_table, data.output_mode, now, now, params_json, webhook_token, user_id,
                 deps_json, data.incremental_strategy, data.incremental_key, tests_json,
                 data.scd2_key, scd2_tracked_json, data.scd2_effective_from, data.scd2_effective_to, data.scd2_is_current,
                 data.pre_hook_sql, data.post_hook_sql, exposures_json, data.microbatch_window),
            )
            await db.execute(
                """
                INSERT INTO pipeline_versions (id, pipeline_id, version, steps_json, message, created_at)
                VALUES (?, ?, 1, ?, ?, ?)
                """,
                (version_id, pipeline_id, steps_json, "Initial version", now),
            )
            await db.commit()

        return Pipeline(
            id=pipeline_id,
            name=data.name,
            description=data.description,
            source_table=data.source_table,
            output_table=data.output_table,
            output_mode=data.output_mode,
            steps=data.steps,
            version=1,
            created_at=now,
            updated_at=now,
            parameters=data.parameters,
            webhook_token=webhook_token,
            dependencies=data.dependencies or [],
            incremental_strategy=data.incremental_strategy,
            incremental_key=data.incremental_key,
            tests=data.tests or [],
            scd2_key=data.scd2_key,
            scd2_tracked_columns=data.scd2_tracked_columns or [],
            scd2_effective_from=data.scd2_effective_from or "effective_from",
            scd2_effective_to=data.scd2_effective_to or "effective_to",
            scd2_is_current=data.scd2_is_current or "is_current",
            pre_hook_sql=data.pre_hook_sql,
            post_hook_sql=data.post_hook_sql,
            exposures=data.exposures or [],
            microbatch_window=data.microbatch_window,
        )

    async def get_pipeline(self, id: str, user_id: Optional[str] = None, role: Optional[str] = None) -> Optional[Pipeline]:
        from auth import auth_enabled
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            if auth_enabled() and user_id is not None:
                if role == "admin":
                    async with db.execute(
                        """SELECT p.*, NULL as shared_access, u.username as owner_username
                           FROM pipelines p LEFT JOIN users u ON p.user_id = u.id
                           WHERE p.id = ?""",
                        (id,),
                    ) as cursor:
                        row = await cursor.fetchone()
                else:
                    async with db.execute(
                        """SELECT p.*, pp.access_level as shared_access, u.username as owner_username
                           FROM pipelines p
                           LEFT JOIN pipeline_permissions pp ON p.id = pp.pipeline_id AND pp.user_id = ?
                           LEFT JOIN users u ON p.user_id = u.id
                           WHERE p.id = ? AND (p.user_id = ? OR pp.user_id = ?)""",
                        (user_id, id, user_id, user_id),
                    ) as cursor:
                        row = await cursor.fetchone()
            else:
                async with db.execute(
                    "SELECT * FROM pipelines WHERE id = ?", (id,)
                ) as cursor:
                    row = await cursor.fetchone()
            if row is None:
                return None

            version = row["current_version"]
            async with db.execute(
                "SELECT steps_json FROM pipeline_versions WHERE pipeline_id = ? AND version = ?",
                (id, version),
            ) as cursor:
                ver_row = await cursor.fetchone()

            steps = []
            if ver_row:
                raw = json.loads(ver_row["steps_json"])
                steps = [TransformStep(**s) for s in raw]

            return self._row_to_pipeline(row, steps, version)

    async def get_pipeline_by_webhook(self, webhook_token: str) -> Optional[Pipeline]:
        """Find pipeline by webhook_token (no user filter — token IS the auth)."""
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM pipelines WHERE webhook_token = ?", (webhook_token,)
            ) as cursor:
                row = await cursor.fetchone()
            if row is None:
                return None
            version = row["current_version"]
            async with db.execute(
                "SELECT steps_json FROM pipeline_versions WHERE pipeline_id = ? AND version = ?",
                (row["id"], version),
            ) as cursor:
                ver_row = await cursor.fetchone()
            steps = []
            if ver_row:
                raw = json.loads(ver_row["steps_json"])
                steps = [TransformStep(**s) for s in raw]
            return self._row_to_pipeline(row, steps, version)

    async def list_pipelines(self, user_id: Optional[str] = None, role: Optional[str] = None) -> List[Pipeline]:
        from auth import auth_enabled
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            if auth_enabled() and user_id is not None:
                if role == "admin":
                    # Admin sees all pipelines with owner username
                    async with db.execute(
                        """SELECT p.*, NULL as shared_access, u.username as owner_username
                           FROM pipelines p LEFT JOIN users u ON p.user_id = u.id
                           ORDER BY p.updated_at DESC""",
                    ) as cursor:
                        rows = await cursor.fetchall()
                else:
                    # Own pipelines + pipelines with any permission grant
                    async with db.execute(
                        """SELECT p.*, pp.access_level as shared_access, u.username as owner_username
                           FROM pipelines p
                           LEFT JOIN pipeline_permissions pp ON p.id = pp.pipeline_id AND pp.user_id = ?
                           LEFT JOIN users u ON p.user_id = u.id
                           WHERE p.user_id = ? OR pp.user_id = ?
                           ORDER BY p.updated_at DESC""",
                        (user_id, user_id, user_id),
                    ) as cursor:
                        rows = await cursor.fetchall()
            else:
                async with db.execute("SELECT * FROM pipelines ORDER BY updated_at DESC") as cursor:
                    rows = await cursor.fetchall()

            result = []
            for row in rows:
                version = row["current_version"]
                async with db.execute(
                    "SELECT steps_json FROM pipeline_versions WHERE pipeline_id = ? AND version = ?",
                    (row["id"], version),
                ) as cursor:
                    ver_row = await cursor.fetchone()
                steps = []
                if ver_row:
                    raw = json.loads(ver_row["steps_json"])
                    steps = [TransformStep(**s) for s in raw]
                result.append(self._row_to_pipeline(row, steps, version))
            return result

    async def save_pipeline(self, id: str, data: PipelineSave, user_id: Optional[str] = None) -> Pipeline:
        from auth import auth_enabled
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM pipelines WHERE id = ?", (id,)) as cursor:
                row = await cursor.fetchone()
            if row is None:
                raise ValueError(f"Pipeline {id} not found")

            new_version = row["current_version"] + 1
            now = _now_iso()
            steps_json = json.dumps([s.model_dump() for s in data.steps])
            version_id = str(uuid.uuid4())

            # Update fields if provided
            keys = row.keys()
            new_name = data.name if data.name is not None else row["name"]
            new_desc = data.description if data.description is not None else row["description"]
            new_output_table = data.output_table if data.output_table is not None else row["output_table"]
            new_output_mode = data.output_mode if data.output_mode is not None else row["output_mode"]
            if data.parameters is not None:
                new_params_json = json.dumps([p.model_dump() for p in data.parameters])
            else:
                new_params_json = row["parameters"] if "parameters" in keys else "[]"
            if data.dependencies is not None:
                new_deps_json = json.dumps(data.dependencies)
            else:
                new_deps_json = row["dependencies"] if "dependencies" in keys else "[]"
            new_incr_strategy = data.incremental_strategy if data.incremental_strategy is not None else (row["incremental_strategy"] if "incremental_strategy" in keys else None)
            new_incr_key = data.incremental_key if data.incremental_key is not None else (row["incremental_key"] if "incremental_key" in keys else None)
            if data.tests is not None:
                new_tests_json = json.dumps([t.model_dump() for t in data.tests])
            else:
                new_tests_json = row["tests_json"] if "tests_json" in keys else "[]"
            # SCD2 fields
            new_scd2_key = data.scd2_key if data.scd2_key is not None else (row["scd2_key"] if "scd2_key" in keys else None)
            if data.scd2_tracked_columns is not None:
                new_scd2_tracked = json.dumps(data.scd2_tracked_columns)
            else:
                new_scd2_tracked = row["scd2_tracked_columns"] if "scd2_tracked_columns" in keys else "[]"
            new_scd2_eff_from = data.scd2_effective_from or (row["scd2_effective_from"] if "scd2_effective_from" in keys else None) or "effective_from"
            new_scd2_eff_to = data.scd2_effective_to or (row["scd2_effective_to"] if "scd2_effective_to" in keys else None) or "effective_to"
            new_scd2_is_curr = data.scd2_is_current or (row["scd2_is_current"] if "scd2_is_current" in keys else None) or "is_current"
            # Hooks: None means "unchanged", empty string means "cleared"
            new_pre_hook = data.pre_hook_sql if data.pre_hook_sql is not None else (row["pre_hook_sql"] if "pre_hook_sql" in keys else None)
            new_post_hook = data.post_hook_sql if data.post_hook_sql is not None else (row["post_hook_sql"] if "post_hook_sql" in keys else None)
            if data.exposures is not None:
                new_exposures_json = json.dumps([e.model_dump() for e in data.exposures])
            else:
                new_exposures_json = row["exposures_json"] if "exposures_json" in keys else "[]"
            new_microbatch_window = data.microbatch_window if data.microbatch_window is not None else (row["microbatch_window"] if "microbatch_window" in keys else None)

            await db.execute(
                """
                UPDATE pipelines
                SET name = ?, description = ?, output_table = ?, output_mode = ?,
                    current_version = ?, updated_at = ?, parameters = ?,
                    dependencies = ?, incremental_strategy = ?, incremental_key = ?, tests_json = ?,
                    scd2_key = ?, scd2_tracked_columns = ?, scd2_effective_from = ?, scd2_effective_to = ?, scd2_is_current = ?,
                    pre_hook_sql = ?, post_hook_sql = ?, exposures_json = ?, microbatch_window = ?
                WHERE id = ?
                """,
                (new_name, new_desc, new_output_table, new_output_mode,
                 new_version, now, new_params_json,
                 new_deps_json, new_incr_strategy, new_incr_key, new_tests_json,
                 new_scd2_key, new_scd2_tracked, new_scd2_eff_from, new_scd2_eff_to, new_scd2_is_curr,
                 new_pre_hook, new_post_hook, new_exposures_json, new_microbatch_window,
                 id),
            )
            await db.execute(
                """
                INSERT INTO pipeline_versions (id, pipeline_id, version, steps_json, message, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (version_id, id, new_version, steps_json, data.message or f"Version {new_version}", now),
            )
            await db.commit()

            async with db.execute("SELECT * FROM pipelines WHERE id = ?", (id,)) as cursor:
                updated_row = await cursor.fetchone()

        steps = [TransformStep(**s) for s in json.loads(steps_json)]
        return self._row_to_pipeline(updated_row, steps, new_version)

    async def regenerate_webhook_token(self, pipeline_id: str) -> str:
        """Generate a new webhook_token, returning the new token."""
        new_token = uuid.uuid4().hex
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                "UPDATE pipelines SET webhook_token = ? WHERE id = ?",
                (new_token, pipeline_id),
            )
            await db.commit()
        return new_token

    async def get_pipeline_history(self, id: str) -> list[dict]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT id, pipeline_id, version, message, created_at FROM pipeline_versions WHERE pipeline_id = ? ORDER BY version DESC",
                (id,),
            ) as cursor:
                rows = await cursor.fetchall()
        return [dict(row) for row in rows]

    async def get_pipeline_version(self, id: str, version: int) -> Pipeline | None:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM pipelines WHERE id = ?", (id,)) as cursor:
                row = await cursor.fetchone()
            if row is None:
                return None

            async with db.execute(
                "SELECT steps_json FROM pipeline_versions WHERE pipeline_id = ? AND version = ?",
                (id, version),
            ) as cursor:
                ver_row = await cursor.fetchone()

            if ver_row is None:
                return None

            raw = json.loads(ver_row["steps_json"])
            steps = [TransformStep(**s) for s in raw]
            return self._row_to_pipeline(row, steps, version)

    async def delete_pipeline(self, id: str) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute("SELECT id FROM pipelines WHERE id = ?", (id,)) as cursor:
                row = await cursor.fetchone()
            if row is None:
                return False
            await db.execute("DELETE FROM pipeline_versions WHERE pipeline_id = ?", (id,))
            await db.execute("DELETE FROM pipelines WHERE id = ?", (id,))
            await db.commit()
        return True

    async def update_pipeline_dependencies(self, pipeline_id: str, dependencies: List[str]) -> bool:
        """Update just the dependencies list for a pipeline."""
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute("SELECT id FROM pipelines WHERE id = ?", (pipeline_id,)) as cursor:
                row = await cursor.fetchone()
            if row is None:
                return False
            await db.execute(
                "UPDATE pipelines SET dependencies = ?, updated_at = ? WHERE id = ?",
                (json.dumps(dependencies), _now_iso(), pipeline_id),
            )
            await db.commit()
        return True

    # ── Catalog connections ───────────────────────────────────────────────────

    async def list_catalog_connections(self) -> list[dict]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM catalog_connections ORDER BY name") as cursor:
                rows = await cursor.fetchall()
        return [self._safe_conn_dict(dict(row)) for row in rows]

    async def get_catalog_connection(self, id: str) -> dict | None:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM catalog_connections WHERE id = ?", (id,)) as cursor:
                row = await cursor.fetchone()
        return dict(row) if row else None

    async def create_catalog_connection(self, data: dict) -> dict:
        conn_id = str(uuid.uuid4())
        now = _now_iso()
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                INSERT INTO catalog_connections
                  (id, name, url, warehouse, auth_type, token, client_id, client_secret, oauth_scope, prefix,
                   aws_access_key_id, aws_secret_access_key, aws_region, aws_session_token,
                   created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    conn_id,
                    data["name"],
                    data["url"],
                    data.get("warehouse", ""),
                    data.get("auth_type", "none"),
                    data.get("token", ""),
                    data.get("client_id", ""),
                    data.get("client_secret", ""),
                    data.get("oauth_scope", "PRINCIPAL_ROLE:ALL"),
                    data.get("prefix", "v1"),
                    data.get("aws_access_key_id", ""),
                    data.get("aws_secret_access_key", ""),
                    data.get("aws_region", ""),
                    data.get("aws_session_token", ""),
                    now,
                    now,
                ),
            )
            await db.commit()
        return {"id": conn_id, **data, "created_at": now, "updated_at": now}

    async def update_catalog_connection(self, id: str, data: dict) -> dict | None:
        existing = await self.get_catalog_connection(id)
        if not existing:
            return None
        now = _now_iso()
        merged = {**existing, **data, "updated_at": now}
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                UPDATE catalog_connections
                SET name=?, url=?, warehouse=?, auth_type=?, token=?, client_id=?,
                    client_secret=?, oauth_scope=?, prefix=?,
                    aws_access_key_id=?, aws_secret_access_key=?, aws_region=?, aws_session_token=?,
                    updated_at=?
                WHERE id=?
                """,
                (
                    merged["name"], merged["url"], merged.get("warehouse", ""), merged["auth_type"],
                    merged.get("token", ""), merged.get("client_id", ""), merged.get("client_secret", ""),
                    merged.get("oauth_scope", "PRINCIPAL_ROLE:ALL"), merged.get("prefix", "v1"),
                    merged.get("aws_access_key_id", ""), merged.get("aws_secret_access_key", ""),
                    merged.get("aws_region", ""), merged.get("aws_session_token", ""),
                    now, id,
                ),
            )
            await db.commit()
        return self._safe_conn_dict(merged)

    async def delete_catalog_connection(self, id: str) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute("SELECT id FROM catalog_connections WHERE id = ?", (id,)) as cursor:
                row = await cursor.fetchone()
            if row is None:
                return False
            await db.execute("DELETE FROM catalog_connections WHERE id = ?", (id,))
            await db.commit()
        return True

    @staticmethod
    def _safe_conn_dict(d: dict) -> dict:
        """Return connection dict with secrets redacted for list responses."""
        _secrets = {"token", "client_secret", "aws_secret_access_key", "aws_session_token"}
        return {k: ("***" if k in _secrets and v else v) for k, v in d.items()}

    # ── App settings (key-value store) ────────────────────────────────────────

    async def get_setting(self, key: str) -> str | None:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute("SELECT value FROM app_settings WHERE key = ?", (key,)) as cursor:
                row = await cursor.fetchone()
        return row[0] if row else None

    async def set_setting(self, key: str, value: str) -> None:
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                "INSERT INTO app_settings (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )
            await db.commit()

    async def get_all_settings(self) -> dict[str, str]:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute("SELECT key, value FROM app_settings") as cursor:
                rows = await cursor.fetchall()
        return {row[0]: row[1] for row in rows}

    async def load_connection_settings(self) -> None:
        """Load persisted connection settings from DB into the live config object."""
        from config import settings as cfg
        stored = await self.get_all_settings()
        overrides = {}
        mapping = {
            "conn_host": "dremio_host",
            "conn_port": "dremio_port",
            "conn_ssl": "dremio_ssl",
            "conn_auth_type": "dremio_auth_type",
            "conn_user": "dremio_user",
            "conn_pass": "dremio_pass",
            "conn_pat": "dremio_pat",
            "conn_project_id": "dremio_project_id",
        }
        for store_key, cfg_key in mapping.items():
            if store_key in stored:
                overrides[cfg_key] = stored[store_key]
        if overrides:
            cfg.update(**overrides)


    # ── Pipeline schedules ────────────────────────────────────────────────────

    async def list_schedules(self, pipeline_id: Optional[str] = None) -> list[dict]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            if pipeline_id is not None:
                async with db.execute(
                    "SELECT * FROM pipeline_schedules WHERE pipeline_id = ? ORDER BY created_at DESC",
                    (pipeline_id,),
                ) as cursor:
                    rows = await cursor.fetchall()
            else:
                async with db.execute(
                    "SELECT * FROM pipeline_schedules ORDER BY created_at DESC"
                ) as cursor:
                    rows = await cursor.fetchall()
        return [dict(row) for row in rows]

    async def get_schedule(self, id: str) -> Optional[dict]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM pipeline_schedules WHERE id = ?", (id,)
            ) as cursor:
                row = await cursor.fetchone()
        return dict(row) if row else None

    async def create_schedule(self, data: dict) -> dict:
        sched_id = str(uuid.uuid4())
        now = _now_iso()
        async with aiosqlite.connect(self._db_path) as db:
            max_retries = int(data.get("max_retries", 0) or 0)
            await db.execute(
                """
                INSERT INTO pipeline_schedules
                  (id, pipeline_id, cron_expression, enabled, max_retries, retry_count, retry_next_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)
                """,
                (
                    sched_id,
                    data["pipeline_id"],
                    data["cron_expression"],
                    1 if data.get("enabled", True) else 0,
                    max_retries,
                    now,
                    now,
                ),
            )
            await db.commit()
        return {
            "id": sched_id,
            "pipeline_id": data["pipeline_id"],
            "cron_expression": data["cron_expression"],
            "enabled": 1 if data.get("enabled", True) else 0,
            "last_run_at": None,
            "last_run_status": None,
            "last_run_error": None,
            "next_run_at": None,
            "max_retries": max_retries,
            "retry_count": 0,
            "retry_next_at": None,
            "created_at": now,
            "updated_at": now,
        }

    async def update_schedule(self, id: str, data: dict) -> Optional[dict]:
        existing = await self.get_schedule(id)
        if not existing:
            return None
        now = _now_iso()
        cron = data.get("cron_expression", existing["cron_expression"])
        enabled = data.get("enabled", existing["enabled"])
        max_retries = int(data.get("max_retries", existing.get("max_retries", 0)) or 0)
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                UPDATE pipeline_schedules
                SET cron_expression = ?, enabled = ?, max_retries = ?, updated_at = ?
                WHERE id = ?
                """,
                (cron, 1 if enabled else 0, max_retries, now, id),
            )
            await db.commit()
        return {**existing, "cron_expression": cron, "enabled": 1 if enabled else 0,
                "max_retries": max_retries, "updated_at": now}

    async def delete_schedule(self, id: str) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute(
                "SELECT id FROM pipeline_schedules WHERE id = ?", (id,)
            ) as cursor:
                row = await cursor.fetchone()
            if row is None:
                return False
            await db.execute("DELETE FROM pipeline_schedules WHERE id = ?", (id,))
            await db.commit()
        return True

    async def record_schedule_run(self, id: str, status: str, error: Optional[str] = None) -> None:
        """Record completed run (success or final failure). Resets retry state."""
        now = _now_iso()
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                UPDATE pipeline_schedules
                SET last_run_at = ?, last_run_status = ?, last_run_error = ?,
                    retry_count = 0, retry_next_at = NULL
                WHERE id = ?
                """,
                (now, status, error, id),
            )
            await db.commit()

    async def set_retry_state(self, id: str, retry_count: int, retry_next_at: str) -> None:
        """Set retry state after a transient failure — does not reset last_run fields."""
        now = _now_iso()
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                UPDATE pipeline_schedules
                SET retry_count = ?, retry_next_at = ?, last_run_status = 'retrying',
                    last_run_error = ?, updated_at = ?
                WHERE id = ?
                """,
                (retry_count, retry_next_at, f"Retry {retry_count} scheduled for {retry_next_at}", now, id),
            )
            await db.commit()

    async def get_retrying_schedules(self) -> list:
        """Return enabled schedules that have a pending retry due now or in the past."""
        from datetime import datetime as _dt, timezone as _tz
        now = _dt.now(_tz.utc).isoformat()
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT * FROM pipeline_schedules
                WHERE enabled = 1 AND retry_next_at IS NOT NULL AND retry_next_at <= ?
                """,
                (now,),
            ) as cursor:
                rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    # ── Pipeline duplication ──────────────────────────────────────────────────

    async def duplicate_pipeline(self, id: str, user_id: str = "default") -> Pipeline:
        """Create a copy of an existing pipeline with all its current steps."""
        source = await self.get_pipeline(id)
        if source is None:
            raise ValueError(f"Pipeline {id} not found")

        new_id = str(uuid.uuid4())
        version_id = str(uuid.uuid4())
        webhook_token = uuid.uuid4().hex
        now = _now_iso()
        new_name = f"Copy of {source.name}"
        steps_json = json.dumps([s.model_dump() for s in source.steps])
        params_json = json.dumps([p.model_dump() for p in source.parameters])

        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                INSERT INTO pipelines (id, name, description, source_table, output_table, output_mode, current_version, created_at, updated_at, parameters, webhook_token, user_id)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
                """,
                (new_id, new_name, source.description, source.source_table,
                 source.output_table, source.output_mode, now, now, params_json, webhook_token, user_id),
            )
            await db.execute(
                """
                INSERT INTO pipeline_versions (id, pipeline_id, version, steps_json, message, created_at)
                VALUES (?, ?, 1, ?, ?, ?)
                """,
                (version_id, new_id, steps_json, "Duplicated from " + source.name, now),
            )
            await db.commit()

        return Pipeline(
            id=new_id,
            name=new_name,
            description=source.description,
            source_table=source.source_table,
            output_table=source.output_table,
            output_mode=source.output_mode,
            steps=source.steps,
            version=1,
            created_at=now,
            updated_at=now,
            parameters=source.parameters,
            webhook_token=webhook_token,
        )

    # ── Notification settings ─────────────────────────────────────────────────

    _NOTIFICATION_KEYS = [
        "notify_email_enabled",
        "notify_email_smtp_host",
        "notify_email_smtp_port",
        "notify_email_smtp_user",
        "notify_email_smtp_pass",
        "notify_email_from",
        "notify_email_to",
        "notify_slack_enabled",
        "notify_slack_webhook_url",
    ]

    async def get_notification_settings(self) -> dict:
        all_settings = await self.get_all_settings()
        result = {}
        for key in self._NOTIFICATION_KEYS:
            val = all_settings.get(key, "")
            if key in ("notify_email_enabled", "notify_slack_enabled"):
                result[key] = val.lower() == "true" if val else False
            else:
                result[key] = val
        return result

    async def save_notification_settings(self, settings: dict) -> None:
        for key in self._NOTIFICATION_KEYS:
            if key in settings:
                val = settings[key]
                if isinstance(val, bool):
                    val = "true" if val else "false"
                elif val is None:
                    val = ""
                await self.set_setting(key, str(val))


    # ── Pipeline run history ──────────────────────────────────────────────────

    async def log_run(
        self,
        pipeline_id: str,
        pipeline_name: str,
        run_type: str,
        status: str,
        row_count: Optional[int],
        error_message: Optional[str],
        started_at: str,
        completed_at: str,
        test_results_json: Optional[str] = None,
    ) -> dict:
        run_id = str(uuid.uuid4())
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                INSERT INTO pipeline_runs
                  (id, pipeline_id, pipeline_name, run_type, status, row_count, error_message, started_at, completed_at, test_results_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (run_id, pipeline_id, pipeline_name, run_type, status, row_count, error_message, started_at, completed_at, test_results_json),
            )
            await db.commit()
        return {
            "id": run_id,
            "pipeline_id": pipeline_id,
            "pipeline_name": pipeline_name,
            "run_type": run_type,
            "status": status,
            "row_count": row_count,
            "error_message": error_message,
            "started_at": started_at,
            "completed_at": completed_at,
        }

    async def get_pipeline_runs(self, pipeline_id: str, limit: int = 50) -> list[dict]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM pipeline_runs WHERE pipeline_id = ? ORDER BY started_at DESC LIMIT ?",
                (pipeline_id, limit),
            ) as cursor:
                rows = await cursor.fetchall()
        return [dict(row) for row in rows]

    async def get_run_by_id(self, run_id: str) -> Optional[dict]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM pipeline_runs WHERE id = ?", (run_id,)
            ) as cursor:
                row = await cursor.fetchone()
        return dict(row) if row else None

    async def get_all_runs(self, limit: int = 100) -> list[dict]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT ?",
                (limit,),
            ) as cursor:
                rows = await cursor.fetchall()
        return [dict(row) for row in rows]


    # ── Alerts ────────────────────────────────────────────────────────────────

    async def list_alerts(self) -> list[dict]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM alerts ORDER BY created_at DESC") as cur:
                rows = await cur.fetchall()
        return [dict(row) for row in rows]

    async def get_alert(self, id: str) -> Optional[dict]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM alerts WHERE id = ?", (id,)) as cur:
                row = await cur.fetchone()
        return dict(row) if row else None

    async def create_alert(self, data: dict) -> dict:
        alert_id = str(uuid.uuid4())
        now = _now_iso()
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                INSERT INTO alerts (id, name, description, alert_type, config_json, schedule, enabled,
                    notify_email, notify_slack, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    alert_id, data["name"], data.get("description", ""),
                    data["alert_type"], data["config_json"], data["schedule"],
                    1 if data.get("enabled", True) else 0,
                    1 if data.get("notify_email", True) else 0,
                    1 if data.get("notify_slack", True) else 0,
                    now, now,
                ),
            )
            await db.commit()
        return {**data, "id": alert_id, "created_at": now, "updated_at": now,
                "last_checked_at": None, "last_status": None, "last_message": None, "last_triggered_at": None}

    async def update_alert(self, id: str, data: dict) -> Optional[dict]:
        existing = await self.get_alert(id)
        if not existing:
            return None
        now = _now_iso()
        merged = {
            "name": data.get("name", existing["name"]),
            "description": data.get("description", existing["description"]),
            "alert_type": data.get("alert_type", existing["alert_type"]),
            "config_json": data.get("config_json", existing["config_json"]),
            "schedule": data.get("schedule", existing["schedule"]),
            "enabled": data.get("enabled", bool(existing["enabled"])),
            "notify_email": data.get("notify_email", bool(existing["notify_email"])),
            "notify_slack": data.get("notify_slack", bool(existing["notify_slack"])),
        }
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                UPDATE alerts SET name=?, description=?, alert_type=?, config_json=?, schedule=?,
                    enabled=?, notify_email=?, notify_slack=?, updated_at=?
                WHERE id=?
                """,
                (merged["name"], merged["description"], merged["alert_type"], merged["config_json"],
                 merged["schedule"], 1 if merged["enabled"] else 0,
                 1 if merged["notify_email"] else 0, 1 if merged["notify_slack"] else 0,
                 now, id),
            )
            await db.commit()
        return {**existing, **merged, "updated_at": now}

    async def delete_alert(self, id: str) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute("SELECT id FROM alerts WHERE id = ?", (id,)) as cur:
                if not await cur.fetchone():
                    return False
            await db.execute("DELETE FROM alert_history WHERE alert_id = ?", (id,))
            await db.execute("DELETE FROM alerts WHERE id = ?", (id,))
            await db.commit()
        return True

    async def record_alert_check(
        self, alert_id: str, alert_name: str, status: str, message: str
    ) -> None:
        now = _now_iso()
        history_id = str(uuid.uuid4())
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                "INSERT INTO alert_history (id, alert_id, alert_name, status, message, checked_at) VALUES (?, ?, ?, ?, ?, ?)",
                (history_id, alert_id, alert_name, status, message, now),
            )
            update_fields = {"last_checked_at": now, "last_status": status, "last_message": message, "updated_at": now}
            if status == "triggered":
                update_fields["last_triggered_at"] = now
            await db.execute(
                """UPDATE alerts SET last_checked_at=?, last_status=?, last_message=?, updated_at=?
                   WHERE id=?""",
                (now, status, message, now, alert_id),
            )
            if status == "triggered":
                await db.execute(
                    "UPDATE alerts SET last_triggered_at=? WHERE id=?", (now, alert_id)
                )
            await db.commit()

    async def get_alert_history(self, alert_id: str, limit: int = 50) -> list[dict]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM alert_history WHERE alert_id = ? ORDER BY checked_at DESC LIMIT ?",
                (alert_id, limit),
            ) as cur:
                rows = await cur.fetchall()
        return [dict(row) for row in rows]

    async def get_all_alert_history(self, limit: int = 100) -> list[dict]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM alert_history ORDER BY checked_at DESC LIMIT ?", (limit,)
            ) as cur:
                rows = await cur.fetchall()
        return [dict(row) for row in rows]

    # ── Custom SQL transform templates ────────────────────────────────────────

    async def list_custom_transforms(self, search: Optional[str] = None) -> list[dict]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            if search:
                pattern = f"%{search}%"
                async with db.execute(
                    "SELECT * FROM custom_transforms WHERE name LIKE ? OR description LIKE ? OR tags LIKE ? ORDER BY use_count DESC, updated_at DESC",
                    (pattern, pattern, pattern),
                ) as cur:
                    rows = await cur.fetchall()
            else:
                async with db.execute(
                    "SELECT * FROM custom_transforms ORDER BY use_count DESC, updated_at DESC"
                ) as cur:
                    rows = await cur.fetchall()
        return [dict(row) for row in rows]

    async def get_custom_transform(self, id: str) -> Optional[dict]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM custom_transforms WHERE id = ?", (id,)
            ) as cur:
                row = await cur.fetchone()
        return dict(row) if row else None

    async def create_custom_transform(self, data: dict) -> dict:
        ct_id = str(uuid.uuid4())
        now = _now_iso()
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                INSERT INTO custom_transforms (id, name, description, sql_template, tags, created_at, updated_at, use_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                """,
                (ct_id, data["name"], data.get("description", ""), data["sql_template"], data.get("tags", ""), now, now),
            )
            await db.commit()
        return {
            "id": ct_id,
            "name": data["name"],
            "description": data.get("description", ""),
            "sql_template": data["sql_template"],
            "tags": data.get("tags", ""),
            "created_at": now,
            "updated_at": now,
            "use_count": 0,
        }

    async def update_custom_transform(self, id: str, data: dict) -> Optional[dict]:
        existing = await self.get_custom_transform(id)
        if not existing:
            return None
        now = _now_iso()
        name = data.get("name", existing["name"])
        description = data.get("description", existing["description"])
        sql_template = data.get("sql_template", existing["sql_template"])
        tags = data.get("tags", existing["tags"])
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """
                UPDATE custom_transforms
                SET name = ?, description = ?, sql_template = ?, tags = ?, updated_at = ?
                WHERE id = ?
                """,
                (name, description, sql_template, tags, now, id),
            )
            await db.commit()
        return {**existing, "name": name, "description": description, "sql_template": sql_template, "tags": tags, "updated_at": now}

    async def delete_custom_transform(self, id: str) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute("SELECT id FROM custom_transforms WHERE id = ?", (id,)) as cur:
                row = await cur.fetchone()
            if row is None:
                return False
            await db.execute("DELETE FROM custom_transforms WHERE id = ?", (id,))
            await db.commit()
        return True

    async def increment_custom_transform_use_count(self, id: str) -> None:
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                "UPDATE custom_transforms SET use_count = use_count + 1 WHERE id = ?", (id,)
            )
            await db.commit()

    # ── Environments ──────────────────────────────────────────────────────────

    async def list_environments(self) -> list[dict]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM environments ORDER BY name") as cursor:
                rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def get_environment(self, env_id: str) -> Optional[dict]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM environments WHERE id = ?", (env_id,)) as cursor:
                row = await cursor.fetchone()
        return dict(row) if row else None

    async def create_environment(self, data: dict) -> dict:
        env_id = str(uuid.uuid4())
        now = _now_iso()
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """INSERT INTO environments
                   (id, name, host, port, ssl, auth_type, user, password, pat, project_id, is_active, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)""",
                (env_id, data["name"], data["host"], data.get("port", 9047),
                 1 if data.get("ssl") else 0, data.get("auth_type", "password"),
                 data.get("user", ""), data.get("password", ""),
                 data.get("pat", ""), data.get("project_id", ""), now),
            )
            await db.commit()
        return {**data, "id": env_id, "is_active": False, "created_at": now}

    async def update_environment(self, env_id: str, data: dict) -> Optional[dict]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM environments WHERE id = ?", (env_id,)) as cursor:
                row = await cursor.fetchone()
            if row is None:
                return None
            existing = dict(row)
            merged = {**existing, **{k: v for k, v in data.items() if v is not None}}
            await db.execute(
                """UPDATE environments SET name=?, host=?, port=?, ssl=?, auth_type=?,
                   user=?, password=?, pat=?, project_id=? WHERE id=?""",
                (merged["name"], merged["host"], int(merged.get("port", 9047)),
                 1 if merged.get("ssl") else 0, merged.get("auth_type", "password"),
                 merged.get("user", ""), merged.get("password", ""),
                 merged.get("pat", ""), merged.get("project_id", ""), env_id),
            )
            await db.commit()
        return await self.get_environment(env_id)

    async def delete_environment(self, env_id: str) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute("SELECT id FROM environments WHERE id = ?", (env_id,)) as cursor:
                row = await cursor.fetchone()
            if row is None:
                return False
            await db.execute("DELETE FROM environments WHERE id = ?", (env_id,))
            await db.commit()
        return True

    async def activate_environment(self, env_id: str) -> Optional[dict]:
        """Set this environment as active, deactivating all others."""
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM environments WHERE id = ?", (env_id,)) as cursor:
                row = await cursor.fetchone()
            if row is None:
                return None
            await db.execute("UPDATE environments SET is_active = 0")
            await db.execute("UPDATE environments SET is_active = 1 WHERE id = ?", (env_id,))
            await db.commit()
        return await self.get_environment(env_id)

    # ── Dashboard ─────────────────────────────────────────────────────────────

    async def get_dashboard_stats(self) -> list:
        """Return summary stats for every pipeline — used by the health dashboard."""
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row

            # All pipelines
            async with db.execute(
                "SELECT id, name, description, source_table, output_table, output_mode, "
                "updated_at, created_at, approval_required, pending_approval_id "
                "FROM pipelines ORDER BY updated_at DESC"
            ) as cur:
                pipelines = [dict(r) for r in await cur.fetchall()]

            results = []
            for p in pipelines:
                pid = p["id"]

                # Latest run
                async with db.execute(
                    "SELECT status, started_at, completed_at, row_count, error_message, run_type "
                    "FROM pipeline_runs WHERE pipeline_id = ? ORDER BY started_at DESC LIMIT 1",
                    (pid,),
                ) as cur:
                    last_run_row = await cur.fetchone()
                last_run = dict(last_run_row) if last_run_row else None

                # Success rate from last 10 runs
                async with db.execute(
                    "SELECT status FROM pipeline_runs WHERE pipeline_id = ? "
                    "ORDER BY started_at DESC LIMIT 10",
                    (pid,),
                ) as cur:
                    recent = await cur.fetchall()
                total = len(recent)
                successes = sum(1 for r in recent if r["status"] == "success")
                success_rate = (successes / total) if total > 0 else None

                # Total run count
                async with db.execute(
                    "SELECT COUNT(*) as cnt FROM pipeline_runs WHERE pipeline_id = ?", (pid,)
                ) as cur:
                    cnt_row = await cur.fetchone()
                total_runs = cnt_row["cnt"] if cnt_row else 0

                # Next scheduled run
                async with db.execute(
                    "SELECT next_run_at, cron_expression, enabled FROM pipeline_schedules "
                    "WHERE pipeline_id = ? AND enabled = 1 LIMIT 1",
                    (pid,),
                ) as cur:
                    sched = await cur.fetchone()
                next_run = dict(sched) if sched else None

                # Compute health
                if total == 0:
                    health = "never_run"
                elif last_run and last_run["status"] == "success":
                    health = "healthy" if (success_rate or 0) >= 0.8 else "degraded"
                else:
                    health = "failing" if (success_rate or 0) < 0.5 else "degraded"

                results.append({
                    **p,
                    "last_run": last_run,
                    "next_run": next_run,
                    "success_rate": success_rate,
                    "total_runs": total_runs,
                    "health": health,
                })
        return results

    # ── Approval Workflow ─────────────────────────────────────────────────────

    async def create_approval(
        self,
        pipeline_id: str,
        pipeline_name: str,
        proposed_steps: list,
        current_steps: list,
        submitted_by: str,
    ) -> dict:
        approval_id = str(uuid.uuid4())
        now = _now_iso()
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """INSERT INTO pipeline_approvals
                   (id, pipeline_id, pipeline_name, proposed_steps_json, current_steps_json,
                    submitted_by, submitted_at, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')""",
                (
                    approval_id, pipeline_id, pipeline_name,
                    json.dumps(proposed_steps), json.dumps(current_steps),
                    submitted_by, now,
                ),
            )
            # Mark the pipeline as having a pending approval
            await db.execute(
                "UPDATE pipelines SET pending_approval_id = ? WHERE id = ?",
                (approval_id, pipeline_id),
            )
            await db.commit()
        return await self.get_approval(approval_id)

    async def get_approval(self, approval_id: str) -> Optional[dict]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM pipeline_approvals WHERE id = ?", (approval_id,)
            ) as cur:
                row = await cur.fetchone()
        if not row:
            return None
        d = dict(row)
        d["proposed_steps"] = json.loads(d.pop("proposed_steps_json", "[]"))
        d["current_steps"] = json.loads(d.pop("current_steps_json", "[]"))
        return d

    async def list_approvals(self, status: Optional[str] = None) -> list:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            if status:
                async with db.execute(
                    "SELECT * FROM pipeline_approvals WHERE status = ? ORDER BY submitted_at DESC",
                    (status,),
                ) as cur:
                    rows = await cur.fetchall()
            else:
                async with db.execute(
                    "SELECT * FROM pipeline_approvals ORDER BY submitted_at DESC"
                ) as cur:
                    rows = await cur.fetchall()
        results = []
        for row in rows:
            d = dict(row)
            d["proposed_steps"] = json.loads(d.pop("proposed_steps_json", "[]"))
            d["current_steps"] = json.loads(d.pop("current_steps_json", "[]"))
            results.append(d)
        return results

    async def resolve_approval(
        self,
        approval_id: str,
        new_status: str,  # 'approved' | 'rejected'
        reviewed_by: str,
        comments: Optional[str] = None,
    ) -> Optional[dict]:
        approval = await self.get_approval(approval_id)
        if not approval or approval["status"] != "pending":
            return None
        now = _now_iso()
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """UPDATE pipeline_approvals
                   SET status = ?, reviewed_by = ?, reviewed_at = ?, comments = ?
                   WHERE id = ?""",
                (new_status, reviewed_by, now, comments, approval_id),
            )
            if new_status == "approved":
                # Apply the proposed steps to the pipeline as a new version
                pipeline_id = approval["pipeline_id"]
                async with db.execute(
                    "SELECT current_version FROM pipelines WHERE id = ?", (pipeline_id,)
                ) as cur:
                    row = await cur.fetchone()
                new_version = (row[0] if row else 0) + 1
                version_id = str(uuid.uuid4())
                await db.execute(
                    """INSERT INTO pipeline_versions (id, pipeline_id, version, steps_json, message, created_at)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        version_id, pipeline_id, new_version,
                        json.dumps(approval["proposed_steps"]),
                        f"Approved by {reviewed_by}", now,
                    ),
                )
                await db.execute(
                    "UPDATE pipelines SET current_version = ?, updated_at = ?, pending_approval_id = NULL WHERE id = ?",
                    (new_version, now, pipeline_id),
                )
            else:
                # Rejected — clear the pending_approval_id
                await db.execute(
                    "UPDATE pipelines SET pending_approval_id = NULL WHERE id = ?",
                    (approval["pipeline_id"],),
                )
            await db.commit()
        return await self.get_approval(approval_id)

    async def set_approval_required(self, pipeline_id: str, required: bool) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                "UPDATE pipelines SET approval_required = ? WHERE id = ?",
                (1 if required else 0, pipeline_id),
            )
            await db.commit()
        return True

    # ── Data Quality Monitors ─────────────────────────────────────────────────

    async def list_dq_monitors(self) -> list:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM dq_monitors ORDER BY updated_at DESC"
            ) as cur:
                rows = await cur.fetchall()
        return [dict(r) for r in rows]

    async def get_dq_monitor(self, monitor_id: str) -> Optional[dict]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM dq_monitors WHERE id = ?", (monitor_id,)
            ) as cur:
                row = await cur.fetchone()
        return dict(row) if row else None

    async def create_dq_monitor(self, data: dict) -> dict:
        monitor_id = str(uuid.uuid4())
        now = _now_iso()
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """INSERT INTO dq_monitors
                   (id, table_name, display_name, rules_json, schedule_cron, enabled, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    monitor_id,
                    data["table_name"],
                    data.get("display_name") or data["table_name"],
                    data.get("rules_json", "[]"),
                    data.get("schedule_cron"),
                    1 if data.get("enabled", True) else 0,
                    now, now,
                ),
            )
            await db.commit()
        return await self.get_dq_monitor(monitor_id)

    async def update_dq_monitor(self, monitor_id: str, data: dict) -> Optional[dict]:
        existing = await self.get_dq_monitor(monitor_id)
        if not existing:
            return None
        now = _now_iso()
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """UPDATE dq_monitors
                   SET table_name = ?, display_name = ?, rules_json = ?, schedule_cron = ?,
                       enabled = ?, updated_at = ?,
                       last_scan_at = COALESCE(?, last_scan_at),
                       last_score = COALESCE(?, last_score)
                   WHERE id = ?""",
                (
                    data.get("table_name", existing["table_name"]),
                    data.get("display_name", existing["display_name"]),
                    data.get("rules_json", existing["rules_json"]),
                    data.get("schedule_cron", existing["schedule_cron"]),
                    1 if data.get("enabled", bool(existing["enabled"])) else 0,
                    now,
                    data.get("last_scan_at"),
                    data.get("last_score"),
                    monitor_id,
                ),
            )
            await db.commit()
        return await self.get_dq_monitor(monitor_id)

    async def delete_dq_monitor(self, monitor_id: str) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute(
                "SELECT id FROM dq_monitors WHERE id = ?", (monitor_id,)
            ) as cur:
                if not await cur.fetchone():
                    return False
            await db.execute(
                "DELETE FROM dq_scan_results WHERE monitor_id = ?", (monitor_id,)
            )
            await db.execute("DELETE FROM dq_monitors WHERE id = ?", (monitor_id,))
            await db.commit()
        return True

    async def save_dq_scan_result(self, monitor_id: str, result: dict) -> dict:
        scan_id = str(uuid.uuid4())
        now = _now_iso()
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """INSERT INTO dq_scan_results
                   (id, monitor_id, scanned_at, overall_score, rule_results_json, status, error_message, duration_ms)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    scan_id, monitor_id, now,
                    result.get("overall_score"),
                    json.dumps(result.get("rule_results", [])),
                    result.get("status", "unknown"),
                    result.get("error_message"),
                    result.get("duration_ms"),
                ),
            )
            await db.commit()
        return {
            "id": scan_id,
            "monitor_id": monitor_id,
            "scanned_at": now,
            **result,
        }

    async def get_dq_scan_results(self, monitor_id: str, limit: int = 20) -> list:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM dq_scan_results WHERE monitor_id = ? ORDER BY scanned_at DESC LIMIT ?",
                (monitor_id, limit),
            ) as cur:
                rows = await cur.fetchall()
        return [dict(r) for r in rows]

    async def get_all_dq_scan_results(self, limit: int = 100) -> list:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT r.*, m.display_name, m.table_name
                   FROM dq_scan_results r
                   JOIN dq_monitors m ON r.monitor_id = m.id
                   ORDER BY r.scanned_at DESC LIMIT ?""",
                (limit,),
            ) as cur:
                rows = await cur.fetchall()
        return [dict(r) for r in rows]

    async def get_dq_dashboard(self) -> list:
        """Return all monitors with their latest scan result."""
        monitors = await self.list_dq_monitors()
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            results = []
            for m in monitors:
                async with db.execute(
                    "SELECT * FROM dq_scan_results WHERE monitor_id = ? ORDER BY scanned_at DESC LIMIT 1",
                    (m["id"],),
                ) as cur:
                    last_scan = await cur.fetchone()
                results.append({
                    **m,
                    "latest_scan": dict(last_scan) if last_scan else None,
                })
        return results


    # ── SSO provider configs ──────────────────────────────────────────────────

    async def list_sso_configs(self) -> list:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM sso_configs ORDER BY created_at") as cur:
                rows = await cur.fetchall()
        return [dict(r) for r in rows]

    async def get_sso_config(self, provider_name: str) -> Optional[dict]:
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM sso_configs WHERE provider_name = ?", (provider_name,)
            ) as cur:
                row = await cur.fetchone()
        return dict(row) if row else None

    async def upsert_sso_config(self, data: dict) -> dict:
        import uuid as _uuid
        now = _now_iso()
        existing = await self.get_sso_config(data["provider_name"])
        async with aiosqlite.connect(self._db_path) as db:
            if existing:
                await db.execute(
                    """UPDATE sso_configs
                       SET display_name=?, client_id=?, client_secret=?,
                           discovery_url=?, enabled=?, default_role=?, updated_at=?
                       WHERE provider_name=?""",
                    (
                        data.get("display_name", existing["display_name"]),
                        data.get("client_id", existing["client_id"]),
                        data.get("client_secret", existing["client_secret"]),
                        data.get("discovery_url", existing["discovery_url"]),
                        1 if data.get("enabled", True) else 0,
                        data.get("default_role", existing.get("default_role", "editor")),
                        now,
                        data["provider_name"],
                    ),
                )
            else:
                cfg_id = str(_uuid.uuid4())
                await db.execute(
                    """INSERT INTO sso_configs
                       (id, provider_name, display_name, client_id, client_secret,
                        discovery_url, enabled, default_role, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        cfg_id,
                        data["provider_name"],
                        data.get("display_name", data["provider_name"].title()),
                        data.get("client_id", ""),
                        data.get("client_secret", ""),
                        data.get("discovery_url", ""),
                        1 if data.get("enabled", True) else 0,
                        data.get("default_role", "editor"),
                        now, now,
                    ),
                )
            await db.commit()
        return await self.get_sso_config(data["provider_name"])

    async def delete_sso_config(self, provider_name: str) -> bool:
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute("DELETE FROM sso_configs WHERE provider_name = ?", (provider_name,))
            await db.commit()
        return True

    async def find_or_create_sso_user(
        self, provider_name: str, sso_sub: str, email: str, name: str, default_role: str = "editor"
    ) -> dict:
        """Find existing SSO user by provider+sub, or create a new one from IdP claims."""
        import uuid as _uuid
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            # Try match by sso_provider + sso_sub
            async with db.execute(
                "SELECT * FROM users WHERE sso_provider = ? AND sso_sub = ?",
                (provider_name, sso_sub),
            ) as cur:
                row = await cur.fetchone()
            if row:
                return dict(row)
            # Try match by email (may have been manually created)
            async with db.execute(
                "SELECT * FROM users WHERE username = ?", (email,)
            ) as cur:
                row = await cur.fetchone()
            if row:
                # Link SSO to existing account
                await db.execute(
                    "UPDATE users SET sso_provider=?, sso_sub=? WHERE id=?",
                    (provider_name, sso_sub, row["id"]),
                )
                await db.commit()
                return {**dict(row), "sso_provider": provider_name, "sso_sub": sso_sub}
            # Create new user
            now = _now_iso()
            user_id = str(_uuid.uuid4())
            is_admin = 0
            # Check if this is the very first user — make them admin
            async with db.execute("SELECT COUNT(*) as n FROM users") as cur:
                count_row = await cur.fetchone()
            if count_row and count_row["n"] == 0:
                is_admin = 1
                default_role = "admin"
            await db.execute(
                """INSERT INTO users (id, username, password_hash, is_admin, role, sso_provider, sso_sub, created_at)
                   VALUES (?, ?, '', ?, ?, ?, ?, ?)""",
                (user_id, email, is_admin, default_role, provider_name, sso_sub, now),
            )
            await db.commit()
        return {
            "id": user_id, "username": email, "is_admin": is_admin,
            "role": default_role, "sso_provider": provider_name, "sso_sub": sso_sub,
        }


store = PipelineStore()
