from typing import Optional

import typer

from ..client import TSClient
from ..output import out

app = typer.Typer(help="View pipeline run history")


@app.command("list")
def run_list(
    ctx: typer.Context,
    pipeline_id: Optional[str] = typer.Option(None, "--pipeline", "-p"),
    limit: int = typer.Option(20, "--limit", "-n"),
):
    """List recent runs (all pipelines or one)."""
    client: TSClient = ctx.obj
    if pipeline_id:
        out(client.get(f"/api/pipelines/{pipeline_id}/runs", limit=limit))
    else:
        out(client.get("/api/runs", limit=limit))


@app.command("get")
def run_get(ctx: typer.Context, run_id: str):
    """Get details for a specific run."""
    client: TSClient = ctx.obj
    out(client.get(f"/api/runs/{run_id}"))
