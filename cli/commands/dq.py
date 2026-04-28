import json
from typing import Optional

import typer

from ..client import TSClient
from ..output import out, success

app = typer.Typer(help="Data quality monitors")


@app.command("list")
def dq_list(ctx: typer.Context):
    """List all DQ monitors."""
    client: TSClient = ctx.obj
    out(client.get("/api/dq/monitors"))


@app.command("get")
def dq_get(ctx: typer.Context, monitor_id: str):
    """Get a DQ monitor."""
    client: TSClient = ctx.obj
    out(client.get(f"/api/dq/monitors/{monitor_id}"))


@app.command("create")
def dq_create(
    ctx: typer.Context,
    name: str = typer.Option(..., "--name", "-n"),
    table: str = typer.Option(..., "--table", "-t"),
    rules: str = typer.Option(..., "--rules", help="JSON array of rule objects"),
):
    """Create a DQ monitor."""
    client: TSClient = ctx.obj
    body = {"name": name, "table": table, "rules": json.loads(rules)}
    out(client.post("/api/dq/monitors", body))


@app.command("delete")
def dq_delete(ctx: typer.Context, monitor_id: str):
    """Delete a DQ monitor."""
    client: TSClient = ctx.obj
    client.delete(f"/api/dq/monitors/{monitor_id}")
    success(f"Monitor {monitor_id} deleted")


@app.command("scan")
def dq_scan(ctx: typer.Context, monitor_id: str):
    """Run a DQ scan immediately."""
    client: TSClient = ctx.obj
    out(client.post(f"/api/dq/monitors/{monitor_id}/scan"))


@app.command("results")
def dq_results(
    ctx: typer.Context,
    monitor_id: str,
    limit: int = typer.Option(20, "--limit", "-n"),
):
    """Get scan history for a DQ monitor."""
    client: TSClient = ctx.obj
    out(client.get(f"/api/dq/monitors/{monitor_id}/results", limit=limit))


@app.command("dashboard")
def dq_dashboard(ctx: typer.Context):
    """Show all monitors with latest scores."""
    client: TSClient = ctx.obj
    out(client.get("/api/dq/dashboard"))


@app.command("rules")
def dq_rules(ctx: typer.Context):
    """List all available DQ rule types."""
    client: TSClient = ctx.obj
    out(client.get("/api/dq/rules"))
