from typing import Optional

import typer

from ..client import TSClient
from ..output import out, success

app = typer.Typer(help="Manage transform types")


@app.command("list")
def transform_list(ctx: typer.Context):
    """List all available built-in transform types."""
    client: TSClient = ctx.obj
    out(client.get("/api/transforms"))


@app.command("get")
def transform_get(ctx: typer.Context, transform_id: str):
    """Get details for a specific transform type."""
    client: TSClient = ctx.obj
    out(client.get(f"/api/transforms/{transform_id}"))


@app.command("custom-list")
def custom_list(ctx: typer.Context):
    """List all custom (user-defined SQL) transforms."""
    client: TSClient = ctx.obj
    out(client.get("/api/custom-transforms"))


@app.command("custom-create")
def custom_create(
    ctx: typer.Context,
    name: str = typer.Option(..., "--name", "-n"),
    sql: str = typer.Option(..., "--sql", help="SQL template for the transform"),
    description: Optional[str] = typer.Option(None, "--description"),
):
    """Create a custom SQL transform."""
    client: TSClient = ctx.obj
    body: dict = {"name": name, "sql": sql}
    if description:
        body["description"] = description
    out(client.post("/api/custom-transforms", body))


@app.command("custom-delete")
def custom_delete(ctx: typer.Context, transform_id: str):
    """Delete a custom transform."""
    client: TSClient = ctx.obj
    client.delete(f"/api/custom-transforms/{transform_id}")
    success(f"Custom transform {transform_id} deleted")
