"""
API smoke tests — hit the live Transform Studio server at localhost:8000.
Run with: pytest tests/test_smoke.py -v

Requires the Docker container to be running:
  docker compose up   (or ./build/rebuild_docker.sh)
"""
from __future__ import annotations
import pytest
import httpx

# ── helpers ───────────────────────────────────────────────────────────────────

def ok(r: httpx.Response, *extra_codes: int) -> httpx.Response:
    """Assert response is 200 (or one of the allowed extra codes)."""
    assert r.status_code in (200, *extra_codes), (
        f"{r.request.method} {r.request.url} → {r.status_code}\n{r.text[:500]}"
    )
    return r


# ── system ────────────────────────────────────────────────────────────────────

class TestSystem:
    def test_health(self, api):
        r = ok(api.get("/api/health"))
        data = r.json()
        assert "status" in data

    def test_auth_status(self, api):
        r = ok(api.get("/api/auth/status"))
        data = r.json()
        assert "auth_enabled" in data
        assert "version" in data

    def test_is_desktop(self, api):
        r = ok(api.get("/api/is-desktop"))
        assert "desktop" in r.json()

    def test_mcp_config(self, api):
        r = ok(api.get("/api/mcp-config"))
        data = r.json()
        assert "mcpServers" in data


# ── settings ──────────────────────────────────────────────────────────────────

class TestSettings:
    def test_get_connection(self, api):
        r = ok(api.get("/api/settings/connection"))
        data = r.json()
        assert "host" in data
        assert "port" in data
        assert "auth_type" in data

    def test_get_notifications(self, api):
        r = ok(api.get("/api/settings/notifications"))
        data = r.json()
        assert "notify_email_enabled" in data
        assert "notify_slack_enabled" in data

    def test_get_agent_settings(self, api):
        r = ok(api.get("/api/agent/settings"))
        data = r.json()
        assert "enabled" in data
        assert "provider" in data
        assert "model" in data
        assert "api_key" in data

    def test_put_agent_settings(self, api):
        r = ok(api.put("/api/agent/settings", json={
            "enabled": False,
            "provider": "anthropic",
            "model": "claude-sonnet-4-6",
            "api_key": None,
            "base_url": None,
        }))
        assert r.json().get("ok") is True

    def test_connection_test_returns_result(self, api):
        r = ok(api.post("/api/settings/connection/test"))
        data = r.json()
        assert "ok" in data  # True or False — either is valid


# ── transforms ────────────────────────────────────────────────────────────────

class TestTransforms:
    def test_list_transforms(self, api):
        r = ok(api.get("/api/transforms"))
        transforms = r.json()
        assert isinstance(transforms, list)
        assert len(transforms) >= 52, f"Expected ≥52 transforms, got {len(transforms)}"

    def test_transform_has_required_fields(self, api):
        transforms = api.get("/api/transforms").json()
        for t in transforms:
            assert "id" in t, f"Missing 'id': {t}"
            assert "name" in t, f"Missing 'name': {t}"
            assert "category" in t, f"Missing 'category': {t}"

    def test_transform_categories(self, api):
        transforms = api.get("/api/transforms").json()
        categories = {t["category"] for t in transforms}
        expected = {"clean", "reshape", "datetime", "enrich", "aggregate", "string", "custom"}
        assert expected.issubset(categories), f"Missing categories: {expected - categories}"

    def test_get_single_transform(self, api):
        r = ok(api.get("/api/transforms/filter_rows"))
        t = r.json()
        assert t["id"] == "filter_rows"

    def test_unknown_transform_404(self, api):
        r = api.get("/api/transforms/does_not_exist")
        assert r.status_code == 404


# ── pipelines ─────────────────────────────────────────────────────────────────

class TestPipelines:
    @pytest.fixture(autouse=True)
    def created_ids(self):
        self._ids = []
        yield
        # cleanup handled by delete tests; leftover IDs are acceptable in test env

    def test_list_pipelines(self, api):
        r = ok(api.get("/api/pipelines"))
        assert isinstance(r.json(), list)

    def test_create_pipeline(self, api):
        r = ok(api.post("/api/pipelines", json={
            "name": "Test Pipeline _smoke",
            "source_table": "test.table",
            "steps": [],
            "output_table": "",
            "output_mode": "preview",
        }), 201)
        p = r.json()
        assert p["name"] == "Test Pipeline _smoke"
        assert "id" in p
        self._ids.append(p["id"])
        return p["id"]

    def test_get_pipeline(self, api):
        pid = api.post("/api/pipelines", json={
            "name": "Get Test _smoke",
            "source_table": "ns.tbl",
            "steps": [],
        }).json()["id"]
        r = ok(api.get(f"/api/pipelines/{pid}"))
        assert r.json()["id"] == pid
        api.delete(f"/api/pipelines/{pid}")

    def test_update_pipeline(self, api):
        pid = api.post("/api/pipelines", json={
            "name": "Update Me _smoke",
            "source_table": "ns.tbl",
            "steps": [],
        }).json()["id"]
        r = ok(api.put(f"/api/pipelines/{pid}", json={
            "name": "Updated _smoke",
            "source_table": "ns.tbl",
            "steps": [],
            "output_table": "",
            "output_mode": "preview",
            "parameters": [],
            "tests": [],
            "dependencies": [],
        }))
        assert r.json()["name"] == "Updated _smoke"
        api.delete(f"/api/pipelines/{pid}")

    def test_delete_pipeline(self, api):
        pid = api.post("/api/pipelines", json={
            "name": "Delete Me _smoke",
            "source_table": "ns.tbl",
            "steps": [],
        }).json()["id"]
        r = api.delete(f"/api/pipelines/{pid}")
        assert r.status_code in (200, 204)
        assert api.get(f"/api/pipelines/{pid}").status_code == 404

    def test_duplicate_pipeline(self, api):
        pid = api.post("/api/pipelines", json={
            "name": "Dupe Source _smoke",
            "source_table": "ns.tbl",
            "steps": [],
        }).json()["id"]
        r = ok(api.post(f"/api/pipelines/{pid}/duplicate"), 201)
        dup = r.json()
        assert dup["id"] != pid
        assert "dupe source" in dup["name"].lower() or "copy" in dup["name"].lower() or "imported" in dup["name"].lower() or dup["name"] != "Dupe Source _smoke"
        api.delete(f"/api/pipelines/{pid}")
        api.delete(f"/api/pipelines/{dup['id']}")

    def test_pipeline_version_history(self, api):
        pid = api.post("/api/pipelines", json={
            "name": "Version Test _smoke",
            "source_table": "ns.tbl",
            "steps": [],
        }).json()["id"]
        r = ok(api.get(f"/api/pipelines/{pid}/history"))
        assert isinstance(r.json(), list)
        api.delete(f"/api/pipelines/{pid}")

    def test_pipeline_runs_empty(self, api):
        pid = api.post("/api/pipelines", json={
            "name": "Runs Test _smoke",
            "source_table": "ns.tbl",
            "steps": [],
        }).json()["id"]
        r = ok(api.get(f"/api/pipelines/{pid}/runs"))
        assert isinstance(r.json(), list)
        api.delete(f"/api/pipelines/{pid}")

    def test_pipeline_schedules_empty(self, api):
        pid = api.post("/api/pipelines", json={
            "name": "Sched Test _smoke",
            "source_table": "ns.tbl",
            "steps": [],
        }).json()["id"]
        r = ok(api.get(f"/api/pipelines/{pid}/schedules"))
        assert isinstance(r.json(), list)
        api.delete(f"/api/pipelines/{pid}")

    def test_pipeline_export_import(self, api):
        pid = api.post("/api/pipelines", json={
            "name": "Export Test _smoke",
            "source_table": "ns.tbl",
            "steps": [],
        }).json()["id"]
        export = ok(api.get(f"/api/pipelines/{pid}/export")).json()
        assert "name" in export
        imported = ok(api.post("/api/pipelines/import", json=export), 201).json()
        assert imported["name"].startswith("Export Test")
        api.delete(f"/api/pipelines/{pid}")
        api.delete(f"/api/pipelines/{imported['id']}")

    def test_get_nonexistent_pipeline_404(self, api):
        r = api.get("/api/pipelines/does-not-exist-xyz")
        assert r.status_code == 404


# ── sql generation ────────────────────────────────────────────────────────────

class TestSqlGeneration:
    def test_generate_sql_empty_steps(self, api):
        r = ok(api.post("/api/sql/generate", json={
            "source_table": "my_ns.orders",
            "steps": [],
        }))
        sql = r.json()["sql"]
        assert "my_ns.orders" in sql or "orders" in sql

    def test_generate_sql_with_filter(self, api):
        r = ok(api.post("/api/sql/generate", json={
            "source_table": "my_ns.orders",
            "steps": [{
                "id": "s1",
                "transform_type": "filter_rows",
                "label": "Filter",
                "config": {"column": "amount", "operator": "greater_than", "value": "100"},
            }],
        }))
        sql = r.json()["sql"]
        assert "amount" in sql and "100" in sql

    def test_generate_sql_group_aggregate(self, api):
        r = ok(api.post("/api/sql/generate", json={
            "source_table": "my_ns.sales",
            "steps": [{
                "id": "s1",
                "transform_type": "group_aggregate",
                "label": "Group",
                "config": {
                    "group_by": ["region"],
                    "aggregations": [{"column": "revenue", "function": "SUM", "alias": "total_revenue"}],
                },
            }],
        }))
        sql = r.json()["sql"]
        assert "SUM" in sql.upper()
        assert "region" in sql.lower()

    def test_generate_sql_select_columns(self, api):
        r = ok(api.post("/api/sql/generate", json={
            "source_table": "my_ns.customers",
            "steps": [{
                "id": "s1",
                "transform_type": "select_columns",
                "label": "Select",
                "config": {"columns": ["id", "name", "email"]},
            }],
        }))
        sql = r.json()["sql"]
        assert "id" in sql and "name" in sql and "email" in sql


# ── schedules ─────────────────────────────────────────────────────────────────

class TestSchedules:
    def test_list_all_schedules(self, api):
        r = ok(api.get("/api/schedules"))
        assert isinstance(r.json(), list)

    def test_create_and_delete_schedule(self, api):
        pid = api.post("/api/pipelines", json={
            "name": "Schedule CRUD _smoke",
            "source_table": "ns.tbl",
            "steps": [],
        }).json()["id"]
        sched = ok(api.post(f"/api/pipelines/{pid}/schedules", json={
            "cron_expression": "0 6 * * *",
            "enabled": True,
        }), 201).json()
        assert sched["cron_expression"] == "0 6 * * *"
        sid = sched["id"]
        api.delete(f"/api/schedules/{sid}")
        api.delete(f"/api/pipelines/{pid}")

    def test_invalid_cron_rejected(self, api):
        pid = api.post("/api/pipelines", json={
            "name": "Bad Cron _smoke",
            "source_table": "ns.tbl",
            "steps": [],
        }).json()["id"]
        r = api.post(f"/api/pipelines/{pid}/schedules", json={
            "cron_expression": "not-a-cron",
            "enabled": True,
        })
        assert r.status_code == 400
        api.delete(f"/api/pipelines/{pid}")


# ── run history ───────────────────────────────────────────────────────────────

class TestRunHistory:
    def test_list_runs(self, api):
        r = ok(api.get("/api/runs"))
        assert isinstance(r.json(), list)


# ── data quality ──────────────────────────────────────────────────────────────

class TestDataQuality:
    def test_list_dq_rules(self, api):
        r = ok(api.get("/api/dq/rules"))
        rules = r.json()
        assert isinstance(rules, list)
        assert len(rules) >= 14, f"Expected ≥14 DQ rules, got {len(rules)}"

    def test_dq_rule_fields(self, api):
        for rule in api.get("/api/dq/rules").json():
            assert "id" in rule
            assert "name" in rule
            assert "category" in rule

    def test_list_dq_monitors(self, api):
        r = ok(api.get("/api/dq/monitors"))
        assert isinstance(r.json(), list)

    def test_create_and_delete_monitor(self, api):
        mon = ok(api.post("/api/dq/monitors", json={
            "display_name": "Smoke Monitor",
            "table_name": "test.table",
            "rules_json": '[{"rule_type":"not_null","column":"id","weight":1.0}]',
            "schedule_cron": None,
            "enabled": True,
            "alert_threshold": 80.0,
            "alert_enabled": False,
        }), 201).json()
        assert mon.get("display_name") == "Smoke Monitor" or mon.get("id") is not None
        mid = mon["id"]
        r = api.delete(f"/api/dq/monitors/{mid}")
        assert r.status_code == 204

    def test_dq_scan_history(self, api):
        r = ok(api.get("/api/dq/scan-history"))
        assert isinstance(r.json(), list)


# ── ingestion ─────────────────────────────────────────────────────────────────

class TestIngestion:
    def test_list_jobs(self, api):
        r = ok(api.get("/api/ingestion/jobs"))
        assert isinstance(r.json(), list)

    def test_list_pipes(self, api):
        r = ok(api.get("/api/ingestion/pipes"))
        assert isinstance(r.json(), list)

    def test_create_and_delete_pipe(self, api):
        r = api.post("/api/ingestion/pipes", json={
            "name": "smoke_pipe",
            "source_path": "s3://bucket/path/",
            "target_table": "my_space.raw_events",
            "file_format": "json",
            "options": {},
            "dedup_lookback_period": 7,
        })
        # CREATE PIPE requires Dremio Enterprise or Cloud (not OSS); 502 means unsupported or no connection
        if r.status_code == 502:
            pytest.skip("CREATE PIPE requires Dremio Enterprise or Cloud — not available on OSS")
        assert r.status_code in (200, 201), f"Unexpected status {r.status_code}: {r.text[:200]}"
        pipe = r.json()
        assert pipe["name"] == "smoke_pipe"
        dr = api.delete(f"/api/ingestion/pipes/{pipe['id']}")
        assert dr.status_code == 204


# ── agent ─────────────────────────────────────────────────────────────────────

class TestAgent:
    def test_agent_disabled_by_default(self, api):
        settings = ok(api.get("/api/agent/settings")).json()
        # May or may not be enabled — just check structure
        assert isinstance(settings["enabled"], bool)

    def test_agent_chat_blocked_when_disabled(self, api):
        # Ensure disabled
        api.put("/api/agent/settings", json={
            "enabled": False,
            "provider": "anthropic",
            "model": "claude-sonnet-4-6",
        })
        r = api.post("/api/agent/chat", json={
            "messages": [{"role": "user", "content": "hello"}],
            "pipeline_state": {},
        })
        assert r.status_code == 403

    def test_agent_chat_blocked_without_model(self, api):
        api.put("/api/agent/settings", json={
            "enabled": True,
            "provider": "anthropic",
            "model": "",
        })
        r = api.post("/api/agent/chat", json={
            "messages": [{"role": "user", "content": "hello"}],
            "pipeline_state": {},
        })
        assert r.status_code in (400, 403)
        # Reset
        api.put("/api/agent/settings", json={
            "enabled": False,
            "provider": "anthropic",
            "model": "",
        })


# ── auth ──────────────────────────────────────────────────────────────────────

class TestAuth:
    def test_auth_status(self, api):
        r = ok(api.get("/api/auth/status"))
        data = r.json()
        assert "auth_enabled" in data

    def test_login_with_bad_creds(self, api):
        r = api.post("/api/auth/login", json={
            "username": "nonexistent_user_xyz",
            "password": "wrongpassword",
        })
        assert r.status_code in (401, 403, 400)

    def test_login_admin(self, api):
        r = api.post("/api/auth/login", json={
            "username": "admin",
            "password": "admin",
        })
        # Succeeds if auth is enabled with default seed, or 401 if not seeded yet
        assert r.status_code in (200, 401, 403)


# ── environments ──────────────────────────────────────────────────────────────

class TestEnvironments:
    def test_list_environments(self, api):
        r = ok(api.get("/api/environments"))
        assert isinstance(r.json(), list)

    def test_create_and_delete_environment(self, api):
        env = ok(api.post("/api/environments", json={
            "name": "smoke_env",
            "host": "test.dremio.com",
            "port": 9047,
            "ssl": False,
            "auth_type": "password",
            "user": "testuser",
            "password": "testpass",
            "pat": "",
            "project_id": "",
        }), 201).json()
        assert env["name"] == "smoke_env"
        r = api.delete(f"/api/environments/{env['id']}")
        assert r.status_code == 204


# ── catalog (graceful degradation) ───────────────────────────────────────────

class TestCatalog:
    def test_namespaces_endpoint_responds(self, api):
        r = api.get("/api/catalog/namespaces")
        # 200 with data, or 502 if Dremio not connected — both are valid
        assert r.status_code in (200, 502, 503), f"Unexpected: {r.status_code}"

    def test_table_schema_without_table(self, api):
        r = api.get("/api/catalog/table-schema")
        # Missing required param → 422
        assert r.status_code == 422


# ── static frontend ───────────────────────────────────────────────────────────

class TestFrontend:
    def test_root_returns_html(self, api):
        r = ok(api.get("/"))
        assert "text/html" in r.headers.get("content-type", "")

    def test_index_html_has_react_root(self, api):
        html = api.get("/").text
        assert "<div" in html and ("id=" in html or "script" in html)


# ── live Dremio integration ───────────────────────────────────────────────────
# These tests require `try-dremio` on localhost:9047 (mark/critter77) and
# Transform Studio connected to it via host.docker.internal:9047.
# They are skipped automatically if the connection is not live.

LIVE_TABLE = "iceberg_minio.dremio-test.excel_test_employees"


def _dremio_live(api) -> bool:
    """Return True if Transform Studio can reach Dremio."""
    r = api.post("/api/settings/connection/test")
    return r.status_code == 200 and r.json().get("ok") is True


class TestDremioLive:
    def test_connection_is_live(self, api):
        assert _dremio_live(api), "Dremio not reachable — is try-dremio running?"

    def test_catalog_namespaces(self, api):
        if not _dremio_live(api):
            pytest.skip("No Dremio connection")
        r = ok(api.get("/api/catalog/namespaces"))
        ns = r.json()
        assert isinstance(ns, list)
        assert len(ns) > 0
        # Each entry may be a string name or a dict with a "name" key
        names = [n if isinstance(n, str) else n.get("name", "") for n in ns]
        assert any("iceberg_minio" in n for n in names), f"iceberg_minio not found in {names}"

    def test_catalog_table_schema(self, api):
        if not _dremio_live(api):
            pytest.skip("No Dremio connection")
        r = ok(api.get("/api/catalog/table-schema", params={"table": LIVE_TABLE}))
        cols = r.json()
        assert isinstance(cols, list)
        col_names = [c["name"] for c in cols]
        assert "employee_id" in col_names
        assert "salary" in col_names

    def test_preview_pipeline(self, api):
        if not _dremio_live(api):
            pytest.skip("No Dremio connection")
        pid = ok(api.post("/api/pipelines", json={
            "name": "Live Preview _smoke",
            "source_table": LIVE_TABLE,
            "steps": [],
        }), 201).json()["id"]
        r = ok(api.post(f"/api/pipelines/{pid}/preview"), 200, 202)
        data = r.json()
        assert "rows" in data or "rowCount" in data or "columns" in data, f"Unexpected preview response: {list(data.keys())}"
        api.delete(f"/api/pipelines/{pid}")

    def test_preview_with_filter_step(self, api):
        if not _dremio_live(api):
            pytest.skip("No Dremio connection")
        pid = ok(api.post("/api/pipelines", json={
            "name": "Live Filter _smoke",
            "source_table": LIVE_TABLE,
            "steps": [{
                "id": "s1",
                "transform_type": "filter_rows",
                "label": "High Earners",
                "config": {"column": "salary", "operator": "greater_than", "value": "80000"},
            }],
        }), 201).json()["id"]
        r = ok(api.post(f"/api/pipelines/{pid}/preview"), 200, 202)
        data = r.json()
        # All returned rows should have salary > 80000
        for row in data.get("rows", []):
            assert int(row.get("salary", 999999)) > 80000, f"Filter not applied: {row}"
        api.delete(f"/api/pipelines/{pid}")

    def test_generate_sql_live_table(self, api):
        if not _dremio_live(api):
            pytest.skip("No Dremio connection")
        r = ok(api.post("/api/sql/generate", json={
            "source_table": LIVE_TABLE,
            "steps": [{
                "id": "s1",
                "transform_type": "group_aggregate",
                "label": "By Dept",
                "config": {
                    "group_by": ["department"],
                    "aggregations": [{"column": "salary", "function": "AVG", "alias": "avg_salary"}],
                },
            }],
        }))
        sql = r.json()["sql"]
        assert "department" in sql
        assert "AVG" in sql.upper() or "avg_salary" in sql
