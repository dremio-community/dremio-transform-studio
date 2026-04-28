from typing import Optional

import typer

from ..client import TSClient
from ..output import out, success

app = typer.Typer(help="Manage pipeline schedules")


@app.command("list")
def schedule_list(
    ctx: typer.Context,
    pipeline_id: Optional[str] = typer.Option(None, "--pipeline", "-p"),
):
    """List all schedules (or for a specific pipeline)."""
    client: TSClient = ctx.obj
    if pipeline_id:
        out(client.get(f"/api/pipelines/{pipeline_id}/schedules"))
    else:
        out(client.get("/api/schedules"))


@app.command("create")
def schedule_create(
    ctx: typer.Context,
    pipeline_id: str,
    cron: str = typer.Option(..., "--cron", help='Cron expression, e.g. "0 6 * * *"'),
    enabled: bool = typer.Option(True, "--enabled/--disabled"),
    label: Optional[str] = typer.Option(None, "--label"),
):
    """Create a cron schedule for a pipeline."""
    client: TSClient = ctx.obj
    body: dict = {"cron": cron, "enabled": enabled}
    if label:
        body["label"] = label
    result = client.post(f"/api/pipelines/{pipeline_id}/schedules", body)
    out(result)


@app.command("update")
def schedule_update(
    ctx: typer.Context,
    schedule_id: str,
    cron: Optional[str] = typer.Option(None, "--cron"),
    enabled: Optional[bool] = typer.Option(None, "--enabled/--disabled"),
):
    """Update a schedule."""
    client: TSClient = ctx.obj
    body = {}
    if cron is not None:
        body["cron"] = cron
    if enabled is not None:
        body["enabled"] = enabled
    out(client.put(f"/api/schedules/{schedule_id}", body))


@app.command("delete")
def schedule_delete(ctx: typer.Context, schedule_id: str):
    """Delete a schedule."""
    client: TSClient = ctx.obj
    client.delete(f"/api/schedules/{schedule_id}")
    success(f"Schedule {schedule_id} deleted")


@app.command("run")
def schedule_run(ctx: typer.Context, schedule_id: str):
    """Trigger a scheduled pipeline run immediately."""
    client: TSClient = ctx.obj
    out(client.post(f"/api/schedules/{schedule_id}/run"))
