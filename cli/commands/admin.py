import sys
from pathlib import Path
from typing import Optional

import typer

from ..client import TSClient
from ..output import out, success

app = typer.Typer(help="Admin and system operations")


@app.command("health")
def health(ctx: typer.Context):
    """Check Transform Studio health and Dremio connectivity."""
    client: TSClient = ctx.obj
    out(client.get("/api/health"))


@app.command("backup")
def backup(
    ctx: typer.Context,
    output: Path = typer.Option(Path("ts_backup.db"), "--output", "-o", help="Output file path"),
):
    """Download the full SQLite database backup."""
    import httpx
    from ..config import get_token, get_url

    url = f"{get_url()}/api/admin/backup"
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    with httpx.Client(timeout=60) as c:
        r = c.get(url, headers=headers)
    if r.status_code != 200:
        typer.echo(f"Error {r.status_code}: {r.text}", err=True)
        raise typer.Exit(1)
    output.write_bytes(r.content)
    success(f"Backup saved to {output} ({len(r.content):,} bytes)")


@app.command("restore")
def restore(
    ctx: typer.Context,
    backup_file: Path = typer.Argument(..., help="Backup file to restore"),
):
    """Restore the database from a backup file."""
    import httpx
    from ..config import get_token, get_url

    if not backup_file.exists():
        typer.echo(f"File not found: {backup_file}", err=True)
        raise typer.Exit(1)

    url = f"{get_url()}/api/admin/restore"
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    with httpx.Client(timeout=60) as c:
        r = c.post(url, headers=headers, files={"file": backup_file.open("rb")})
    if r.status_code not in (200, 201):
        typer.echo(f"Error {r.status_code}: {r.text}", err=True)
        raise typer.Exit(1)
    success("Database restored successfully")


@app.command("audit-log")
def audit_log(
    ctx: typer.Context,
    limit: int = typer.Option(50, "--limit", "-n"),
    user: Optional[str] = typer.Option(None, "--user"),
):
    """View the audit log."""
    client: TSClient = ctx.obj
    params: dict = {"limit": limit}
    if user:
        params["user"] = user
    out(client.get("/api/audit-log", **params))


@app.command("users")
def users(ctx: typer.Context):
    """List all users (admin only)."""
    client: TSClient = ctx.obj
    out(client.get("/api/auth/users"))


@app.command("dashboard")
def dashboard(ctx: typer.Context):
    """Show pipeline health dashboard."""
    client: TSClient = ctx.obj
    out(client.get("/api/dashboard"))
