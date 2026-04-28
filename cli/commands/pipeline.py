import json
from typing import Optional

import typer

from ..client import TSClient
from ..output import out, success

app = typer.Typer(help="Manage pipelines")


@app.command("list")
def pipeline_list(
    ctx: typer.Context,
    folder: Optional[str] = typer.Option(None, "--folder", "-f", help="Filter by folder"),
):
    """List all pipelines."""
    client: TSClient = ctx.obj
    pipelines = client.get("/api/pipelines")
    if folder:
        pipelines = [p for p in pipelines if p.get("folder") == folder]
    out(pipelines)


@app.command("get")
def pipeline_get(ctx: typer.Context, pipeline_id: str):
    """Get a pipeline by ID."""
    client: TSClient = ctx.obj
    out(client.get(f"/api/pipelines/{pipeline_id}"))


@app.command("create")
def pipeline_create(
    ctx: typer.Context,
    name: str = typer.Option(..., "--name", "-n"),
    source: Optional[str] = typer.Option(None, "--source", "-s", help="Source table path"),
    output: Optional[str] = typer.Option(None, "--output", "-o", help="Output table path"),
    folder: Optional[str] = typer.Option(None, "--folder"),
):
    """Create a new pipeline."""
    client: TSClient = ctx.obj
    body: dict = {"name": name}
    if source:
        body["source_table"] = source
    if output:
        body["output_table"] = output
    if folder:
        body["folder"] = folder
    result = client.post("/api/pipelines", body)
    out(result)


@app.command("delete")
def pipeline_delete(ctx: typer.Context, pipeline_id: str):
    """Delete a pipeline."""
    client: TSClient = ctx.obj
    client.delete(f"/api/pipelines/{pipeline_id}")
    success(f"Pipeline {pipeline_id} deleted")


@app.command("run")
def pipeline_run(
    ctx: typer.Context,
    pipeline_id: str,
    params: Optional[str] = typer.Option(None, "--params", help="JSON parameter overrides"),
):
    """Run a pipeline immediately."""
    client: TSClient = ctx.obj
    body = json.loads(params) if params else {}
    result = client.post(f"/api/pipelines/{pipeline_id}/run", body)
    out(result)


@app.command("history")
def pipeline_history(
    ctx: typer.Context,
    pipeline_id: str,
    limit: int = typer.Option(20, "--limit", "-n"),
):
    """Get version history for a pipeline."""
    client: TSClient = ctx.obj
    out(client.get(f"/api/pipelines/{pipeline_id}/history", limit=limit))


@app.command("duplicate")
def pipeline_duplicate(ctx: typer.Context, pipeline_id: str, name: str = typer.Option(..., "--name", "-n")):
    """Duplicate a pipeline."""
    client: TSClient = ctx.obj
    result = client.post(f"/api/pipelines/{pipeline_id}/duplicate", {"name": name})
    out(result)


@app.command("share")
def pipeline_share(
    ctx: typer.Context,
    pipeline_id: str,
    user_id: str = typer.Option(..., "--user"),
    role: str = typer.Option("viewer", "--role", help="viewer or editor"),
):
    """Share a pipeline with a user."""
    client: TSClient = ctx.obj
    result = client.post(f"/api/pipelines/{pipeline_id}/permissions", {"user_id": user_id, "role": role})
    out(result)


@app.command("permissions")
def pipeline_permissions(ctx: typer.Context, pipeline_id: str):
    """List who a pipeline is shared with."""
    client: TSClient = ctx.obj
    out(client.get(f"/api/pipelines/{pipeline_id}/permissions"))


@app.command("submit-review")
def pipeline_submit_review(ctx: typer.Context, pipeline_id: str, note: Optional[str] = typer.Option(None, "--note")):
    """Submit a pipeline for approval review."""
    client: TSClient = ctx.obj
    body = {"note": note} if note else {}
    result = client.post(f"/api/pipelines/{pipeline_id}/submit-review", body)
    out(result)
