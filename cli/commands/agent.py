"""ts agent — interact with the Transform Studio built-in AI agent.

When TS agent is active: delegates to /api/agent/chat (streaming or blocking).
When TS agent is inactive: emits an error with instructions to use `ts context dump`
and pass the output to an external agent (e.g. Claude Code).
"""
from __future__ import annotations

import json
import sys
from typing import Optional

import httpx
import typer

from ..client import TSClient
from ..config import get_token, get_url
from ..output import out, error

app = typer.Typer(help="Talk to the Transform Studio AI agent")


@app.command("chat")
def agent_chat(
    ctx: typer.Context,
    message: str = typer.Argument(..., help="Natural language instruction"),
    stream: bool = typer.Option(False, "--stream", help="Stream response tokens as they arrive"),
    session_id: Optional[str] = typer.Option(None, "--session", help="Continue an existing conversation"),
):
    """
    Send a message to the built-in Transform Studio AI agent.

    The agent has full context of your Dremio environment and can create
    pipelines, run them, query the catalog, and more.

    If the agent is not configured, use `ts context dump` instead to feed
    environment context to an external agent like Claude Code.

    Examples:
        ts agent chat "build a pipeline that removes nulls from Samples.orders"
        ts agent chat "what pipelines ran in the last hour?"
        ts agent chat "schedule the clean_orders pipeline to run at 6am daily"
    """
    client: TSClient = ctx.obj

    # Check agent is configured before sending
    settings = client.get("/api/agent/settings")
    if not settings or not settings.get("enabled"):
        error(
            "Transform Studio AI agent is not enabled. "
            "Enable it in Settings > Agent, or use `ts context dump` to feed "
            "environment context to an external agent like Claude Code."
        )

    body: dict = {"message": message}
    if session_id:
        body["session_id"] = session_id

    if stream:
        _stream_chat(client, body)
    else:
        result = client.post("/api/agent/chat", body)
        out(result)


def _stream_chat(client: TSClient, body: dict) -> None:
    """Stream SSE tokens from the agent chat endpoint."""
    url = f"{client.base}/api/agent/chat"
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    headers["Accept"] = "text/event-stream"

    with httpx.Client(timeout=120) as c:
        with c.stream("POST", url, json=body, headers=headers) as r:
            if r.status_code != 200:
                error(f"Agent stream error {r.status_code}")
            for line in r.iter_lines():
                if line.startswith("data:"):
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        token_text = chunk.get("token") or chunk.get("content", "")
                        print(token_text, end="", flush=True)
                    except json.JSONDecodeError:
                        print(data, end="", flush=True)
    print()  # newline after stream


@app.command("settings")
def agent_settings(ctx: typer.Context):
    """Show current AI agent settings."""
    client: TSClient = ctx.obj
    out(client.get("/api/agent/settings"))


@app.command("configure")
def agent_configure(
    ctx: typer.Context,
    api_key: Optional[str] = typer.Option(None, "--api-key", help="Anthropic API key"),
    model: Optional[str] = typer.Option(None, "--model", help="Claude model ID"),
    enabled: Optional[bool] = typer.Option(None, "--enabled/--disabled"),
):
    """Configure the built-in AI agent."""
    client: TSClient = ctx.obj
    current = client.get("/api/agent/settings") or {}
    if api_key is not None:
        current["api_key"] = api_key
    if model is not None:
        current["model"] = model
    if enabled is not None:
        current["enabled"] = enabled
    out(client.put("/api/agent/settings", current))
