"""ts context — dump full Transform Studio state for an AI agent.

Fetches everything in parallel and returns a single structured JSON object.
When the TS built-in agent is unavailable, pass this output to an external
agent (e.g. Claude Code) so it has full environment context before acting.
"""
from __future__ import annotations

from typing import Optional

import typer

from ..client import TSClient
from ..output import out

app = typer.Typer(help="Dump full Transform Studio context for an AI agent")


@app.command("dump")
def context_dump(
    ctx: typer.Context,
    include_catalog: bool = typer.Option(True, "--catalog/--no-catalog", help="Include top-level catalog namespaces"),
    include_dq: bool = typer.Option(True, "--dq/--no-dq", help="Include DQ dashboard"),
    include_runs: bool = typer.Option(True, "--runs/--no-runs", help="Include recent runs"),
    run_limit: int = typer.Option(10, "--run-limit", help="How many recent runs to include"),
):
    """
    Fetch all Transform Studio state and emit a single JSON object.

    Designed for AI agents: pipe the output into your agent's context window
    so it can reason about pipelines, schedules, data quality, and catalog
    structure before taking action.

    Example (Claude Code):
        ts context dump | pbcopy   # paste into conversation
        ts context dump > context.json
    """
    client: TSClient = ctx.obj

    # Build parallel fetch list
    paths = [
        "/api/pipelines",
        "/api/schedules",
        "/api/transforms",
        "/api/custom-transforms",
        "/api/alerts",
        "/api/health",
    ]
    if include_catalog:
        paths.append("/api/catalog/namespaces")
    if include_dq:
        paths.append("/api/dq/dashboard")
    if include_runs:
        paths.append(f"/api/runs?limit={run_limit}")

    results = client.get_parallel(paths)

    idx = 0

    def _next():
        nonlocal idx
        v = results[idx]
        idx += 1
        return v

    context: dict = {
        "_meta": {
            "source": "transform-studio-cli",
            "version": "0.1.0",
            "url": client.base,
            "note": (
                "Full Transform Studio state snapshot. "
                "Use this to understand the environment before issuing ts commands."
            ),
        },
        "pipelines": _next() or [],
        "schedules": _next() or [],
        "transforms": {
            "builtin": _next() or [],
            "custom": _next() or [],
        },
        "alerts": _next() or [],
        "health": _next() or {},
    }

    if include_catalog:
        context["catalog"] = {"namespaces": _next() or []}
    if include_dq:
        context["dq"] = {"dashboard": _next() or []}
    if include_runs:
        context["recent_runs"] = _next() or []

    # Enrich: attach schedule and last_run inline on each pipeline for quick scanning
    schedule_map: dict = {}
    for s in context["schedules"]:
        pid = s.get("pipeline_id")
        if pid:
            schedule_map.setdefault(pid, []).append(s)

    run_map: dict = {}
    for r in context.get("recent_runs", []):
        pid = r.get("pipeline_id")
        if pid and pid not in run_map:
            run_map[pid] = r

    for p in context["pipelines"]:
        pid = p.get("id")
        p["_schedules"] = schedule_map.get(pid, [])
        p["_last_run"] = run_map.get(pid)

    out(context)
