"""
Unit tests for the SQLite persistence layer (store.py).
Uses a real temporary database — no mocking.
"""
from __future__ import annotations
import asyncio
import os
import sys
import tempfile
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from models import PipelineCreate, TransformStep, PipelineParameter


# ── fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def tmp_db(tmp_path):
    return str(tmp_path / "test.db")


@pytest.fixture
def store(tmp_db):
    # PipelineStore reads db_path from settings which reads DB_PATH env var
    os.environ["DB_PATH"] = tmp_db
    # Re-import to pick up the env var via the config singleton
    import importlib
    import config as _cfg
    importlib.reload(_cfg)
    import store as _store_mod
    importlib.reload(_store_mod)
    s = _store_mod.PipelineStore()
    asyncio.get_event_loop().run_until_complete(s.init())
    return s


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


# ── settings ──────────────────────────────────────────────────────────────────

class TestSettings:
    def test_get_missing_returns_none(self, store):
        assert run(store.get_setting("nope")) is None

    def test_set_and_get(self, store):
        run(store.set_setting("color", "blue"))
        assert run(store.get_setting("color")) == "blue"

    def test_overwrite(self, store):
        run(store.set_setting("k", "v1"))
        run(store.set_setting("k", "v2"))
        assert run(store.get_setting("k")) == "v2"

    def test_agent_settings_roundtrip(self, store):
        run(store.set_setting("agent_enabled", "true"))
        run(store.set_setting("agent_provider", "openai"))
        run(store.set_setting("agent_model", "gpt-4o"))
        run(store.set_setting("agent_api_key", "sk-test"))
        assert run(store.get_setting("agent_enabled")) == "true"
        assert run(store.get_setting("agent_provider")) == "openai"
        assert run(store.get_setting("agent_model")) == "gpt-4o"
        assert run(store.get_setting("agent_api_key")) == "sk-test"


# ── pipelines ─────────────────────────────────────────────────────────────────

def make_pipeline(name="Test Pipeline", source_table="ns.orders", steps=None):
    return PipelineCreate(
        name=name,
        source_table=source_table,
        steps=steps or [],
        output_table="",
        output_mode="preview",
    )


class TestPipelines:
    def test_create_returns_pipeline(self, store):
        p = run(store.create_pipeline(make_pipeline("P1"), user_id="default"))
        assert p.id
        assert p.name == "P1"
        assert p.source_table == "ns.orders"

    def test_list_pipelines_empty(self, store):
        result = run(store.list_pipelines(user_id="default"))
        assert result == []

    def test_list_after_create(self, store):
        run(store.create_pipeline(make_pipeline("A"), user_id="default"))
        run(store.create_pipeline(make_pipeline("B"), user_id="default"))
        pipelines = run(store.list_pipelines(user_id="default"))
        names = [p.name for p in pipelines]
        assert "A" in names and "B" in names

    def test_get_pipeline(self, store):
        created = run(store.create_pipeline(make_pipeline("GetMe"), user_id="default"))
        fetched = run(store.get_pipeline(created.id, user_id="default"))
        assert fetched is not None
        assert fetched.id == created.id
        assert fetched.name == "GetMe"

    def test_get_nonexistent_returns_none(self, store):
        result = run(store.get_pipeline("does-not-exist", user_id="default"))
        assert result is None

    def test_update_pipeline(self, store):
        from models import PipelineSave
        p = run(store.create_pipeline(make_pipeline("Original"), user_id="default"))
        updated = run(store.save_pipeline(p.id, PipelineSave(
            name="Updated",
            source_table="ns.orders",
            steps=[],
            output_table="ns.out",
            output_mode="ctas",
            parameters=[],
            tests=[],
            dependencies=[],
            message="test update",
        ), user_id="default"))
        assert updated.name == "Updated"
        assert updated.output_mode == "ctas"

    def test_delete_pipeline(self, store):
        p = run(store.create_pipeline(make_pipeline("DeleteMe"), user_id="default"))
        ok = run(store.delete_pipeline(p.id))
        assert ok is True
        assert run(store.get_pipeline(p.id, user_id="default")) is None

    def test_delete_nonexistent_returns_false(self, store):
        result = run(store.delete_pipeline("ghost-id"))
        assert result is False

    def test_pipeline_with_steps(self, store):
        steps = [
            TransformStep(
                id="s1",
                transform_type="filter_rows",
                config={"condition": "amount > 0"},
                label="filter",
            )
        ]
        p = run(store.create_pipeline(
            make_pipeline("With Steps", steps=steps), user_id="default"))
        fetched = run(store.get_pipeline(p.id, user_id="default"))
        assert len(fetched.steps) == 1
        assert fetched.steps[0].transform_type == "filter_rows"

    def test_pipeline_version_increments_on_update(self, store):
        from models import PipelineSave
        p = run(store.create_pipeline(make_pipeline("Versioned"), user_id="default"))
        assert p.version == 1
        updated = run(store.save_pipeline(p.id, PipelineSave(
            name="Versioned", source_table="ns.tbl", steps=[],
            output_table="", output_mode="preview",
            parameters=[], tests=[], dependencies=[], message="v2",
        ), user_id="default"))
        assert updated.version == 2

    def test_pipeline_history(self, store):
        from models import PipelineSave
        p = run(store.create_pipeline(make_pipeline("Historical"), user_id="default"))
        run(store.save_pipeline(p.id, PipelineSave(
            name="Historical", source_table="ns.tbl", steps=[],
            output_table="", output_mode="preview",
            parameters=[], tests=[], dependencies=[], message="second version",
        ), user_id="default"))
        history = run(store.get_pipeline_history(p.id))
        assert len(history) >= 1

    def test_duplicate_pipeline(self, store):
        p = run(store.create_pipeline(make_pipeline("Original"), user_id="default"))
        dup = run(store.duplicate_pipeline(p.id, user_id="default"))
        assert dup.id != p.id
        assert p.name in dup.name or "copy" in dup.name.lower()

    def test_pipeline_with_parameters(self, store):
        params = [PipelineParameter(
            name="region", type="string", default_value="WEST", description="")]
        p = run(store.create_pipeline(PipelineCreate(
            name="Parameterized",
            source_table="ns.tbl",
            steps=[],
            parameters=params,
        ), user_id="default"))
        fetched = run(store.get_pipeline(p.id, user_id="default"))
        assert len(fetched.parameters) == 1
        assert fetched.parameters[0].name == "region"


# ── schedules ─────────────────────────────────────────────────────────────────

class TestSchedules:
    def test_create_schedule(self, store):
        p = run(store.create_pipeline(make_pipeline("Scheduled"), user_id="default"))
        sched = run(store.create_schedule({
            "pipeline_id": p.id,
            "cron_expression": "0 8 * * *",
            "enabled": True,
            "max_retries": 0,
            "sla_enabled": False,
            "sla_time": None,
        }))
        assert sched["pipeline_id"] == p.id
        assert sched["cron_expression"] == "0 8 * * *"

    def test_list_schedules_for_pipeline(self, store):
        p = run(store.create_pipeline(make_pipeline("S2"), user_id="default"))
        run(store.create_schedule({
            "pipeline_id": p.id,
            "cron_expression": "0 9 * * *",
            "enabled": True,
            "max_retries": 0,
            "sla_enabled": False,
            "sla_time": None,
        }))
        scheds = run(store.list_schedules(pipeline_id=p.id))
        assert len(scheds) == 1

    def test_delete_schedule(self, store):
        p = run(store.create_pipeline(make_pipeline("S3"), user_id="default"))
        sched = run(store.create_schedule({
            "pipeline_id": p.id,
            "cron_expression": "0 1 * * *",
            "enabled": True,
            "max_retries": 0,
            "sla_enabled": False,
            "sla_time": None,
        }))
        ok = run(store.delete_schedule(sched["id"]))
        assert ok is True
        remaining = run(store.list_schedules(pipeline_id=p.id))
        assert remaining == []


# ── run log ───────────────────────────────────────────────────────────────────

class TestRunLog:
    def test_log_and_list_run(self, store):
        p = run(store.create_pipeline(make_pipeline("RunLog"), user_id="default"))
        run(store.log_run(
            pipeline_id=p.id,
            pipeline_name="RunLog",
            run_type="manual",
            status="success",
            row_count=42,
            error_message=None,
            started_at="2026-01-01T00:00:00Z",
            completed_at="2026-01-01T00:00:10Z",
        ))
        runs = run(store.get_pipeline_runs(p.id))
        assert len(runs) == 1
        assert runs[0]["status"] == "success"
        assert runs[0]["row_count"] == 42

    def test_list_all_runs(self, store):
        runs = run(store.get_all_runs())
        assert isinstance(runs, list)


# ── DQ monitors ───────────────────────────────────────────────────────────────

class TestDQMonitors:
    def test_create_monitor(self, store):
        mon = run(store.create_dq_monitor({
            "display_name": "Test Monitor",
            "table_name": "ns.table",
            "rules_json": '[{"rule_type":"not_null","column":"id","weight":1.0}]',
            "schedule_cron": None,
            "enabled": True,
        }))
        assert mon["display_name"] == "Test Monitor"
        assert "id" in mon

    def test_list_monitors(self, store):
        run(store.create_dq_monitor({
            "display_name": "Mon A",
            "table_name": "ns.a",
            "rules_json": "[]",
            "schedule_cron": None,
            "enabled": True,
        }))
        monitors = run(store.list_dq_monitors())
        assert len(monitors) >= 1

    def test_delete_monitor(self, store):
        mon = run(store.create_dq_monitor({
            "display_name": "Delete Me",
            "table_name": "ns.b",
            "rules_json": "[]",
            "schedule_cron": None,
            "enabled": True,
        }))
        ok = run(store.delete_dq_monitor(mon["id"]))
        assert ok is True
        remaining = [m for m in run(store.list_dq_monitors()) if m["id"] == mon["id"]]
        assert remaining == []


# ── ingestion ─────────────────────────────────────────────────────────────────

class TestIngestionStore:
    def test_create_and_list_pipe(self, store):
        import uuid
        pipe = run(store.create_ingestion_pipe({
            "id": str(uuid.uuid4()),
            "name": "test_pipe",
            "source_path": "s3://bucket/data/",
            "target_table": "space.raw",
            "file_format": "json",
            "options_json": "{}",
            "enabled": 1,
            "dedup_lookback_period": 7,
        }))
        assert pipe["name"] == "test_pipe"
        pipes = run(store.list_ingestion_pipes())
        assert any(p["id"] == pipe["id"] for p in pipes)

    def test_delete_pipe(self, store):
        import uuid
        pipe = run(store.create_ingestion_pipe({
            "id": str(uuid.uuid4()),
            "name": "delete_pipe",
            "source_path": "s3://bucket/",
            "target_table": "space.raw2",
            "file_format": "csv",
            "options_json": "{}",
            "enabled": 1,
            "dedup_lookback_period": 3,
        }))
        ok = run(store.delete_ingestion_pipe(pipe["id"]))
        assert ok is True
        remaining = [p for p in run(store.list_ingestion_pipes()) if p["id"] == pipe["id"]]
        assert remaining == []


# ── users ─────────────────────────────────────────────────────────────────────

class TestUsers:
    def test_seed_admin_if_empty(self, store):
        run(store.seed_admin_if_empty())
        users = run(store.list_users())
        assert any(u["username"] == "admin" for u in users)

    def test_create_user(self, store):
        user = run(store.create_user("testuser", "hashed_pw", is_admin=False))
        assert user["username"] == "testuser"

    def test_get_user_by_username(self, store):
        run(store.create_user("findme", "pw", is_admin=False))
        u = run(store.get_user_by_username("findme"))
        assert u is not None
        assert u["username"] == "findme"

    def test_get_missing_user_returns_none(self, store):
        u = run(store.get_user_by_username("ghost"))
        assert u is None

    def test_delete_user(self, store):
        user = run(store.create_user("deleteme", "pw", is_admin=False))
        run(store.delete_user(user["id"]))  # returns None, no return value
        assert run(store.get_user_by_username("deleteme")) is None
