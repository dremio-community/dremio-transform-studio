"""
Dremio Transform Studio — MCP Server
=====================================
Exposes Transform Studio as an MCP (Model Context Protocol) tool server so that
AI agents (Claude Code, Claude Desktop, custom agents) can drive the app directly.

Usage
-----
  python mcp_server.py [--url http://localhost:8000] [--token <JWT>]

Environment variables (alternative to CLI flags):
  TS_URL    Base URL of the Transform Studio backend (default: http://localhost:8000)
  TS_TOKEN  JWT Bearer token (only needed when AUTH_ENABLED=true)

The server speaks MCP over stdio. Wire it up in claude_desktop_config.json:
  {
    "mcpServers": {
      "transform-studio": {
        "command": "python",
        "args": ["/path/to/backend/mcp_server.py"],
        "env": {
          "TS_URL": "http://localhost:8000",
          "TS_TOKEN": "optional-jwt-token"
        }
      }
    }
  }
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

import httpx

# ── MCP wire protocol (stdio JSON-RPC) ────────────────────────────────────────

def _send(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def _recv() -> dict | None:
    line = sys.stdin.readline()
    if not line:
        return None
    return json.loads(line.strip())


# ── HTTP client ───────────────────────────────────────────────────────────────

class TSClient:
    def __init__(self, base_url: str, token: str | None = None):
        self.base = base_url.rstrip("/")
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        self._headers = headers

    def get(self, path: str, **params) -> Any:
        with httpx.Client(timeout=30.0) as c:
            r = c.get(f"{self.base}{path}", headers=self._headers, params=params)
            r.raise_for_status()
            return r.json()

    def post(self, path: str, body: dict | None = None) -> Any:
        with httpx.Client(timeout=60.0) as c:
            r = c.post(f"{self.base}{path}", headers=self._headers, json=body or {})
            r.raise_for_status()
            return r.json()

    def put(self, path: str, body: dict) -> Any:
        with httpx.Client(timeout=30.0) as c:
            r = c.put(f"{self.base}{path}", headers=self._headers, json=body)
            r.raise_for_status()
            return r.json()

    def delete(self, path: str) -> Any:
        with httpx.Client(timeout=10.0) as c:
            r = c.delete(f"{self.base}{path}", headers=self._headers)
            if r.status_code == 204:
                return {"deleted": True}
            r.raise_for_status()
            return r.json()

    def post_multipart(self, path: str, fields: dict, file_bytes: bytes, filename: str) -> Any:
        with httpx.Client(timeout=60.0) as c:
            h = {k: v for k, v in self._headers.items() if k != "Content-Type"}
            r = c.post(
                f"{self.base}{path}",
                headers=h,
                data=fields,
                files={"file": (filename, file_bytes, "text/csv")},
            )
            r.raise_for_status()
            return r.json()


# ── Tool definitions ──────────────────────────────────────────────────────────

TOOLS = [
    {
        "name": "ts_health",
        "description": "Check that the Transform Studio backend is running and the Dremio connection is healthy.",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "ts_list_transforms",
        "description": "List all 52 available transform types with their IDs, names, categories, and descriptions. Use this to discover what transforms can be added to a pipeline.",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "ts_list_namespaces",
        "description": "List top-level Dremio namespaces (spaces, sources). Use this to browse available data.",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "ts_browse_namespace",
        "description": "List tables and sub-namespaces within a Dremio namespace path (e.g. 'my_space' or 'my_space.subfolder'). Returns name and type (TABLE, VIEW, CONTAINER).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "namespace": {"type": "string", "description": "Namespace path to browse, e.g. 'my_space'"},
            },
            "required": ["namespace"],
        },
    },
    {
        "name": "ts_get_table_schema",
        "description": "Get the column names and types for a Dremio table. Use this before building a pipeline to understand the source data.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "table": {"type": "string", "description": "Fully qualified table name, e.g. 'my_space.my_table'"},
            },
            "required": ["table"],
        },
    },
    {
        "name": "ts_profile_table",
        "description": "Profile a Dremio table: row count, null %, distinct count, min/max per column. Results are cached for 1 hour.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "table": {"type": "string", "description": "Fully qualified table name"},
                "refresh": {"type": "boolean", "description": "Force re-profile even if cached (default false)"},
            },
            "required": ["table"],
        },
    },
    {
        "name": "ts_list_pipelines",
        "description": "List all saved pipelines with their source, output, steps, dependencies, and parameters.",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "ts_get_pipeline",
        "description": "Get full details for a single pipeline by ID.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "pipeline_id": {"type": "string", "description": "Pipeline UUID"},
            },
            "required": ["pipeline_id"],
        },
    },
    {
        "name": "ts_create_pipeline",
        "description": "Create a new empty pipeline with a name and source table. Returns the pipeline ID. Add steps with ts_save_pipeline.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Human-readable pipeline name"},
                "source_table": {"type": "string", "description": "Fully qualified Dremio table to read from"},
                "description": {"type": "string", "description": "Optional pipeline description"},
            },
            "required": ["name", "source_table"],
        },
    },
    {
        "name": "ts_save_pipeline",
        "description": (
            "Save/update a pipeline — steps, output table, output mode, parameters, tests, and dependencies. "
            "This is a full replace of the pipeline definition. "
            "output_mode options: 'preview' (no write), 'ctas' (create/replace table), 'insert' (append), 'view' (create view), 'incremental', 'scd2'. "
            "Each step has: id (uuid), transform_id (e.g. 'filter_rows'), label (display name), config (dict of transform-specific params)."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "pipeline_id": {"type": "string"},
                "name": {"type": "string"},
                "description": {"type": "string"},
                "source_table": {"type": "string"},
                "output_table": {"type": "string"},
                "output_mode": {
                    "type": "string",
                    "enum": ["preview", "ctas", "insert", "view", "incremental", "scd2"],
                },
                "steps": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "transform_id": {"type": "string"},
                            "label": {"type": "string"},
                            "config": {"type": "object"},
                        },
                        "required": ["id", "transform_id", "label", "config"],
                    },
                },
                "dependencies": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of upstream pipeline IDs",
                },
            },
            "required": ["pipeline_id", "name", "source_table"],
        },
    },
    {
        "name": "ts_preview_pipeline",
        "description": "Run a pipeline in preview mode — returns up to 500 rows without writing any output to Dremio. Use this to validate logic before executing.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "pipeline_id": {"type": "string"},
                "param_values": {
                    "type": "object",
                    "description": "Optional parameter overrides as {param_name: value}",
                },
            },
            "required": ["pipeline_id"],
        },
    },
    {
        "name": "ts_execute_pipeline",
        "description": "Execute a pipeline and write output to Dremio. Runs tests after execution. Returns rows written, duration, test results, and Iceberg metadata push status.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "pipeline_id": {"type": "string"},
                "output_table": {"type": "string", "description": "Override output table for this run"},
                "output_mode": {"type": "string", "description": "Override output mode for this run"},
                "param_values": {"type": "object", "description": "Parameter overrides"},
            },
            "required": ["pipeline_id"],
        },
    },
    {
        "name": "ts_execute_with_deps",
        "description": "Execute a pipeline and ALL its upstream dependencies in topological order. If any step fails, downstream steps are skipped. Returns per-pipeline results.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "pipeline_id": {"type": "string"},
                "param_values": {"type": "object"},
            },
            "required": ["pipeline_id"],
        },
    },
    {
        "name": "ts_run_tests",
        "description": "Run all tests defined on a pipeline against its current output table. Test types: not_null, unique, row_count_between, accepted_values, custom_sql.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "pipeline_id": {"type": "string"},
            },
            "required": ["pipeline_id"],
        },
    },
    {
        "name": "ts_get_pipeline_runs",
        "description": "Get the execution history for a pipeline — status, rows written, duration, and test results per run.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "pipeline_id": {"type": "string"},
                "limit": {"type": "integer", "description": "Max runs to return (default 20)"},
            },
            "required": ["pipeline_id"],
        },
    },
    {
        "name": "ts_get_dag",
        "description": "Get the full cross-pipeline dependency graph: nodes, edges, topological execution order, and any cycles.",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "ts_seed_table",
        "description": "Create a Dremio table from CSV data (provided as a string). Max 5,000 rows. Column types are inferred automatically.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "table_name": {
                    "type": "string",
                    "description": "Fully qualified output table, e.g. 'my_space.my_seed_table'",
                },
                "csv_content": {
                    "type": "string",
                    "description": "Full CSV content as a string (including header row)",
                },
                "filename": {
                    "type": "string",
                    "description": "Optional filename hint (default: seed.csv)",
                },
            },
            "required": ["table_name", "csv_content"],
        },
    },
    {
        "name": "ts_list_environments",
        "description": "List all saved Dremio connection environments (dev/staging/prod profiles). The active one has is_active: true.",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "ts_activate_environment",
        "description": "Switch the active Dremio connection to a saved environment. All subsequent queries immediately use the new connection.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "env_id": {"type": "string", "description": "Environment ID to activate"},
            },
            "required": ["env_id"],
        },
    },
    {
        "name": "ts_schedule_pipeline",
        "description": "Schedule a pipeline to run on a cron schedule (e.g. '0 6 * * *' for daily at 6am UTC).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "pipeline_id": {"type": "string"},
                "cron_expression": {"type": "string", "description": "5-field cron expression"},
                "enabled": {"type": "boolean", "description": "Start enabled (default true)"},
            },
            "required": ["pipeline_id", "cron_expression"],
        },
    },
    {
        "name": "ts_delete_pipeline",
        "description": "Permanently delete a pipeline and all its version history, schedules, and run logs. This is irreversible.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "pipeline_id": {"type": "string"},
            },
            "required": ["pipeline_id"],
        },
    },
]


# ── Tool dispatch ─────────────────────────────────────────────────────────────

def dispatch(client: TSClient, name: str, args: dict) -> Any:
    if name == "ts_health":
        return client.get("/api/health")

    elif name == "ts_list_transforms":
        transforms = client.get("/api/transforms")
        # Return a compact summary — full schema is verbose
        return [
            {"id": t["id"], "name": t["name"], "category": t.get("category", ""), "description": t.get("description", "")}
            for t in transforms
        ]

    elif name == "ts_list_namespaces":
        return client.get("/api/catalog/namespaces")

    elif name == "ts_browse_namespace":
        return client.get(f"/api/catalog/namespaces/{args['namespace']}")

    elif name == "ts_get_table_schema":
        return client.get("/api/catalog/table-schema", table=args["table"])

    elif name == "ts_profile_table":
        return client.get("/api/catalog/profile", table=args["table"], refresh=args.get("refresh", False))

    elif name == "ts_list_pipelines":
        pipelines = client.get("/api/pipelines")
        # Return compact summary
        return [
            {
                "id": p["id"],
                "name": p["name"],
                "source_table": p.get("source_table"),
                "output_table": p.get("output_table"),
                "output_mode": p.get("output_mode"),
                "steps_count": len(p.get("steps", [])),
                "dependencies": p.get("dependencies", []),
                "updated_at": p.get("updated_at"),
            }
            for p in pipelines
        ]

    elif name == "ts_get_pipeline":
        return client.get(f"/api/pipelines/{args['pipeline_id']}")

    elif name == "ts_create_pipeline":
        return client.post("/api/pipelines", {
            "name": args["name"],
            "source_table": args["source_table"],
            "description": args.get("description", ""),
        })

    elif name == "ts_save_pipeline":
        pid = args.pop("pipeline_id")
        return client.put(f"/api/pipelines/{pid}", args)

    elif name == "ts_preview_pipeline":
        body: dict = {}
        if "param_values" in args:
            body["param_values"] = args["param_values"]
        result = client.post(f"/api/pipelines/{args['pipeline_id']}/preview", body or None)
        # Return compact: columns + first 20 rows
        return {
            "columns": result.get("columns", []),
            "rows": result.get("rows", [])[:20],
            "total_rows": result.get("total_rows"),
            "truncated": result.get("truncated", False),
        }

    elif name == "ts_execute_pipeline":
        body = {}
        if "output_table" in args:
            body["output_table"] = args["output_table"]
        if "output_mode" in args:
            body["output_mode"] = args["output_mode"]
        if "param_values" in args:
            body["param_values"] = args["param_values"]
        return client.post(f"/api/pipelines/{args['pipeline_id']}/execute", body or None)

    elif name == "ts_execute_with_deps":
        body = {}
        if "param_values" in args:
            body["param_values"] = args["param_values"]
        return client.post(f"/api/pipelines/{args['pipeline_id']}/execute-with-deps", body or None)

    elif name == "ts_run_tests":
        return client.post(f"/api/pipelines/{args['pipeline_id']}/run-tests")

    elif name == "ts_get_pipeline_runs":
        limit = args.get("limit", 20)
        return client.get(f"/api/pipelines/{args['pipeline_id']}/runs", limit=limit)

    elif name == "ts_get_dag":
        return client.get("/api/dag")

    elif name == "ts_seed_table":
        csv_bytes = args["csv_content"].encode("utf-8")
        filename = args.get("filename", "seed.csv")
        return client.post_multipart(
            "/api/seeds",
            fields={"table_name": args["table_name"]},
            file_bytes=csv_bytes,
            filename=filename,
        )

    elif name == "ts_list_environments":
        return client.get("/api/environments")

    elif name == "ts_activate_environment":
        return client.post(f"/api/environments/{args['env_id']}/activate")

    elif name == "ts_schedule_pipeline":
        return client.post(f"/api/pipelines/{args['pipeline_id']}/schedules", {
            "cron_expression": args["cron_expression"],
            "enabled": args.get("enabled", True),
        })

    elif name == "ts_delete_pipeline":
        return client.delete(f"/api/pipelines/{args['pipeline_id']}")

    else:
        raise ValueError(f"Unknown tool: {name}")


# ── MCP request handler ───────────────────────────────────────────────────────

def handle(client: TSClient, request: dict) -> dict | None:
    method = request.get("method")
    req_id = request.get("id")

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "transform-studio", "version": "1.3.0"},
            },
        }

    elif method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {"tools": TOOLS},
        }

    elif method == "tools/call":
        params = request.get("params", {})
        tool_name = params.get("name")
        tool_args = params.get("arguments", {})
        try:
            result = dispatch(client, tool_name, tool_args)
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{"type": "text", "text": json.dumps(result, indent=2)}],
                    "isError": False,
                },
            }
        except httpx.HTTPStatusError as e:
            detail = ""
            try:
                detail = e.response.json().get("detail", str(e))
            except Exception:
                detail = str(e)
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{"type": "text", "text": f"Error {e.response.status_code}: {detail}"}],
                    "isError": True,
                },
            }
        except Exception as e:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{"type": "text", "text": str(e)}],
                    "isError": True,
                },
            }

    elif method == "notifications/initialized":
        return None  # notification — no response needed

    # Ignore unknown methods gracefully
    return None


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Transform Studio MCP Server")
    parser.add_argument("--url", default=os.environ.get("TS_URL", "http://localhost:8000"))
    parser.add_argument("--token", default=os.environ.get("TS_TOKEN", ""))
    args = parser.parse_args()

    client = TSClient(base_url=args.url, token=args.token or None)

    while True:
        request = _recv()
        if request is None:
            break
        response = handle(client, request)
        if response is not None:
            _send(response)


if __name__ == "__main__":
    main()
