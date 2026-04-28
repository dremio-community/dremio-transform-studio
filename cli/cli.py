"""Transform Studio CLI — agent-first interface for Dremio Transform Studio.

Auth priority (highest first):
  1. --url / --token flags
  2. TS_URL / TS_TOKEN env vars
  3. ~/.config/ts/config.json  (written by `ts login`)

Output is JSON by default. Pass --pretty for human-readable tables.
"""
from __future__ import annotations

from typing import Optional

import typer
from rich.console import Console

from . import __version__
from .client import TSClient
from .config import clear, get_token, get_url, save
from .output import set_pretty

from .commands import (
    admin,
    agent,
    catalog,
    context,
    dq,
    pipeline,
    run,
    schedule,
    transform,
)

console = Console()


class _LazyClient:
    """TSClient wrapper that defers URL resolution until first HTTP call."""

    def __init__(self, url, token):
        self._url = url
        self._token = token
        self._client: Optional[TSClient] = None

    def _get(self) -> TSClient:
        if self._client is None:
            self._client = TSClient(url=self._url, token=self._token)
        return self._client

    def __getattr__(self, item):
        return getattr(self._get(), item)


app = typer.Typer(
    name="ts",
    help="Transform Studio CLI — agent-first interface.\n\nJSON output by default; use --pretty for human-readable tables.",
    no_args_is_help=True,
    add_completion=True,
)

# Sub-command groups
app.add_typer(pipeline.app, name="pipeline", help="Manage pipelines")
app.add_typer(run.app, name="run", help="View run history")
app.add_typer(schedule.app, name="schedule", help="Manage schedules")
app.add_typer(catalog.app, name="catalog", help="Browse the Dremio catalog")
app.add_typer(transform.app, name="transform", help="Manage transforms")
app.add_typer(dq.app, name="dq", help="Data quality monitors")
app.add_typer(agent.app, name="agent", help="Talk to the AI agent")
app.add_typer(context.app, name="context", help="Dump full context for an external agent")
app.add_typer(admin.app, name="admin", help="Admin and system operations")


@app.callback()
def main(
    ctx: typer.Context,
    url: Optional[str] = typer.Option(None, "--url", envvar="TS_URL", help="Transform Studio URL", is_eager=False),
    token: Optional[str] = typer.Option(None, "--token", envvar="TS_TOKEN", help="JWT auth token", is_eager=False),
    pretty: bool = typer.Option(False, "--pretty", "-p", help="Human-readable output instead of JSON"),
    version: bool = typer.Option(False, "--version", "-v", is_eager=True, help="Show version and exit"),
):
    if version:
        console.print(f"ts version {__version__}")
        raise typer.Exit()

    set_pretty(pretty)
    # Always store a lazy client; URL resolution deferred to first HTTP call
    ctx.ensure_object(dict)
    ctx.obj = _LazyClient(url=url, token=token)


@app.command("login")
def login(
    url: str = typer.Option(..., "--url", "-u", prompt="Transform Studio URL", help="e.g. http://localhost:5000"),
    username: str = typer.Option(..., "--username", prompt="Username"),
    password: str = typer.Option(..., "--password", prompt="Password", hide_input=True),
):
    """Log in and save credentials to ~/.config/ts/config.json."""
    import httpx, json, sys

    resp = httpx.post(
        f"{url.rstrip('/')}/api/auth/login",
        json={"username": username, "password": password},
        timeout=15,
    )
    if resp.status_code != 200:
        try:
            detail = resp.json().get("detail", resp.text)
        except Exception:
            detail = resp.text
        typer.echo(f"Login failed: {detail}", err=True)
        raise typer.Exit(1)

    token = resp.json().get("access_token") or resp.json().get("token")
    if not token:
        typer.echo("Login succeeded but no token in response", err=True)
        raise typer.Exit(1)

    save(url, token)
    typer.echo(json.dumps({"status": "ok", "url": url, "message": "Logged in and credentials saved"}))


@app.command("logout")
def logout():
    """Remove saved credentials."""
    clear()
    typer.echo('{"status": "ok", "message": "Logged out"}')


@app.command("whoami")
def whoami(ctx: typer.Context):
    """Show the currently authenticated user."""
    from .output import out
    client: TSClient = ctx.obj
    out(client.get("/api/auth/me"))


@app.command("search")
def search(
    ctx: typer.Context,
    query: str = typer.Argument(..., help="Search term"),
):
    """Global search across pipeline names, steps, and tables."""
    from .output import out
    client: TSClient = ctx.obj
    out(client.get("/api/search", q=query))
