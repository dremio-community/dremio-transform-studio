from typing import Optional

import typer

from ..client import TSClient
from ..output import out

app = typer.Typer(help="Browse the Dremio catalog")


@app.command("ls")
def catalog_ls(
    ctx: typer.Context,
    path: Optional[str] = typer.Argument(None, help='Namespace path, e.g. "Samples.NYC"'),
):
    """List namespaces and tables. Omit path to list top-level."""
    client: TSClient = ctx.obj
    if path:
        out(client.get(f"/api/catalog/namespaces/{path}"))
    else:
        out(client.get("/api/catalog/namespaces"))


@app.command("schema")
def catalog_schema(
    ctx: typer.Context,
    table: str = typer.Argument(..., help='Fully-qualified table path, e.g. "Samples.orders"'),
):
    """Get column schema for a table."""
    client: TSClient = ctx.obj
    out(client.get("/api/catalog/table-schema", table=table))


@app.command("profile")
def catalog_profile(
    ctx: typer.Context,
    table: str = typer.Argument(..., help="Fully-qualified table path"),
    limit: int = typer.Option(10000, "--limit", help="Row sample limit for profiling"),
):
    """Profile a table — row count, nulls, distinct values, min/max per column."""
    client: TSClient = ctx.obj
    out(client.get("/api/catalog/profile", table=table, limit=limit))
