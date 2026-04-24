"""
Transform Studio — AI Agent
Supports Anthropic Claude, OpenAI-compatible endpoints, and local Ollama.
All providers use the same tool definitions; the agent loop handles each SDK.
"""
from __future__ import annotations
import json
import asyncio
from typing import Any, AsyncIterator, Optional

# ── Tool definitions (provider-agnostic) ──────────────────────────────────────

TOOLS = [
    {
        "name": "get_catalog",
        "description": "List all top-level namespaces and their tables in the Dremio catalog. Call this first to discover available data sources.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_table_schema",
        "description": "Get the column names and types for a specific table.",
        "input_schema": {
            "type": "object",
            "properties": {"table": {"type": "string", "description": "Fully qualified table path, e.g. my_source.orders"}},
            "required": ["table"],
        },
    },
    {
        "name": "get_transforms",
        "description": "List all available transform types with their descriptions and config fields. Use this before adding a step.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_pipeline",
        "description": "Get the current pipeline definition: source table, output table, and all transform steps.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_pipeline_sql",
        "description": "Get the SQL that the current pipeline compiles to. Useful for explaining or debugging a pipeline.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "set_source_table",
        "description": "Set the source table for the current pipeline.",
        "input_schema": {
            "type": "object",
            "properties": {"table": {"type": "string", "description": "Fully qualified table path"}},
            "required": ["table"],
        },
    },
    {
        "name": "add_step",
        "description": "Append a transform step to the end of the current pipeline.",
        "input_schema": {
            "type": "object",
            "properties": {
                "transform_type": {"type": "string", "description": "The transform type ID, e.g. filter_rows, group_aggregate, join"},
                "label": {"type": "string", "description": "A short human-readable label for this step"},
                "config": {"type": "object", "description": "Transform-specific config fields. Use get_transforms to see required fields."},
            },
            "required": ["transform_type", "label", "config"],
        },
    },
    {
        "name": "remove_step",
        "description": "Remove a transform step from the pipeline by its index (0-based).",
        "input_schema": {
            "type": "object",
            "properties": {"index": {"type": "integer", "description": "0-based index of the step to remove"}},
            "required": ["index"],
        },
    },
    {
        "name": "update_step",
        "description": "Update the config or label of an existing pipeline step.",
        "input_schema": {
            "type": "object",
            "properties": {
                "index": {"type": "integer", "description": "0-based step index"},
                "label": {"type": "string"},
                "config": {"type": "object"},
            },
            "required": ["index"],
        },
    },
    {
        "name": "run_preview",
        "description": "Execute a preview of the current pipeline and return the first few result rows. Use this to validate changes.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
]

# ── Provider conversion helpers ───────────────────────────────────────────────

def _tools_for_openai(tools: list) -> list:
    """Convert our tool schema to OpenAI function-calling format."""
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["input_schema"],
            },
        }
        for t in tools
    ]


def _tools_for_anthropic(tools: list) -> list:
    return tools  # our schema IS the Anthropic format


# ── System prompt ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are an expert data engineer assistant embedded in Dremio Transform Studio — a visual SQL pipeline builder.

Your job is to help users build, modify, debug, and understand their data pipelines using plain English.

When a user asks you to do something:
1. Call get_catalog or get_table_schema first if you need to discover tables or columns.
2. Call get_transforms if you need to know what transform types are available.
3. Call get_pipeline to see the current pipeline before modifying it.
4. Make changes incrementally using add_step, remove_step, or update_step.
5. Call run_preview to validate the result after making changes.
6. Explain what you did in plain language after completing each action.

Keep responses concise. When you modify a pipeline, briefly explain each step you added and why.
Never add unnecessary steps. Always prefer the simplest pipeline that satisfies the user's request."""


# ── Tool executor ─────────────────────────────────────────────────────────────

async def execute_tool(name: str, args: dict, pipeline_state: dict) -> Any:
    """Execute a tool call and return the result. pipeline_state is mutated for pipeline changes."""
    from catalog_client import catalog_client
    from dremio_client import dremio_client as dc
    from transforms.registry import list_transforms

    if name == "get_catalog":
        try:
            namespaces = await catalog_client.list_namespaces()
            result = {}
            for ns in namespaces[:20]:
                try:
                    tables = await catalog_client.list_tables(ns)
                    result[ns] = [t["name"] for t in tables if t.get("type") == "DATASET"]
                except Exception:
                    result[ns] = []
            return result
        except Exception as e:
            return {"error": str(e)}

    if name == "get_table_schema":
        table = args.get("table", "")
        parts = table.rsplit(".", 1)
        if len(parts) < 2:
            return {"error": "table must be namespace.tablename"}
        try:
            cols = await catalog_client.get_table_schema(parts[0], parts[1])
            return cols
        except Exception as e:
            return {"error": str(e)}

    if name == "get_transforms":
        transforms = list_transforms()
        return [{"id": t.id, "name": t.name, "description": t.description, "category": t.category} for t in transforms]

    if name == "get_pipeline":
        steps = pipeline_state.get("steps", [])
        return {
            "source_table": pipeline_state.get("source_table", ""),
            "output_table": pipeline_state.get("output_table", ""),
            "step_count": len(steps),
            "steps": [{"index": i, "type": s.get("type"), "label": s.get("label"), "config": s.get("config", {})} for i, s in enumerate(steps)],
        }

    if name == "get_pipeline_sql":
        from transforms.codegen import compile_pipeline
        steps = pipeline_state.get("steps", [])
        src = pipeline_state.get("source_table", "")
        if not src:
            return {"error": "No source table set"}
        try:
            sql = compile_pipeline(src, steps, [])
            return {"sql": sql}
        except Exception as e:
            return {"error": str(e)}

    if name == "set_source_table":
        pipeline_state["source_table"] = args.get("table", "")
        pipeline_state["dirty"] = True
        return {"ok": True, "source_table": pipeline_state["source_table"]}

    if name == "add_step":
        import uuid
        step = {
            "id": str(uuid.uuid4()),
            "type": args.get("transform_type"),
            "label": args.get("label", args.get("transform_type")),
            "config": args.get("config", {}),
        }
        pipeline_state.setdefault("steps", []).append(step)
        pipeline_state["dirty"] = True
        return {"ok": True, "step_index": len(pipeline_state["steps"]) - 1, "step": step}

    if name == "remove_step":
        idx = args.get("index", -1)
        steps = pipeline_state.get("steps", [])
        if 0 <= idx < len(steps):
            removed = steps.pop(idx)
            pipeline_state["dirty"] = True
            return {"ok": True, "removed": removed["label"]}
        return {"error": f"No step at index {idx}"}

    if name == "update_step":
        idx = args.get("index", -1)
        steps = pipeline_state.get("steps", [])
        if 0 <= idx < len(steps):
            if "label" in args:
                steps[idx]["label"] = args["label"]
            if "config" in args:
                steps[idx]["config"].update(args["config"])
            pipeline_state["dirty"] = True
            return {"ok": True, "step": steps[idx]}
        return {"error": f"No step at index {idx}"}

    if name == "run_preview":
        from transforms.codegen import compile_pipeline
        steps = pipeline_state.get("steps", [])
        src = pipeline_state.get("source_table", "")
        if not src:
            return {"error": "No source table set"}
        try:
            sql = compile_pipeline(src, steps, [])
            preview_sql = f"SELECT * FROM ({sql}) __preview LIMIT 5"
            rows = await dc.run_query(preview_sql)
            return {"rows": rows[:5], "row_count": len(rows)}
        except Exception as e:
            return {"error": str(e)}

    return {"error": f"Unknown tool: {name}"}


# ── Agent loop — Anthropic ────────────────────────────────────────────────────

async def run_anthropic(messages: list, pipeline_state: dict, model: str, api_key: str) -> AsyncIterator[str]:
    import anthropic as _anthropic
    client = _anthropic.AsyncAnthropic(api_key=api_key)

    while True:
        # Stream the response
        text_buf = ""
        tool_calls: list[dict] = []
        finish_reason = None

        async with client.messages.stream(
            model=model,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=messages,
            tools=_tools_for_anthropic(TOOLS),
        ) as stream:
            async for event in stream:
                if hasattr(event, "type"):
                    if event.type == "content_block_delta":
                        delta = event.delta
                        if hasattr(delta, "text"):
                            text_buf += delta.text
                            yield json.dumps({"type": "text", "text": delta.text})
                    elif event.type == "message_delta":
                        if hasattr(event.delta, "stop_reason"):
                            finish_reason = event.delta.stop_reason
                    elif event.type == "content_block_start":
                        if hasattr(event.content_block, "type") and event.content_block.type == "tool_use":
                            tool_calls.append({"id": event.content_block.id, "name": event.content_block.name, "input": {}})
                    elif event.type == "content_block_delta":
                        if hasattr(event.delta, "partial_json") and tool_calls:
                            tool_calls[-1]["input_raw"] = tool_calls[-1].get("input_raw", "") + event.delta.partial_json

            # Resolve tool input JSON after stream ends
            final_msg = await stream.get_final_message()
            tool_use_blocks = [b for b in final_msg.content if b.type == "tool_use"]

        if not tool_use_blocks:
            break

        # Build assistant message with all content
        messages.append({"role": "assistant", "content": final_msg.content})

        # Execute each tool
        tool_results = []
        for block in tool_use_blocks:
            yield json.dumps({"type": "tool_call", "tool": block.name, "args": block.input})
            result = await execute_tool(block.name, block.input, pipeline_state)
            yield json.dumps({"type": "tool_result", "tool": block.name, "result": result})
            tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)})

        messages.append({"role": "user", "content": tool_results})

        if finish_reason == "end_turn":
            break


# ── Agent loop — OpenAI-compatible (OpenAI + Ollama) ─────────────────────────

async def run_openai_compatible(messages: list, pipeline_state: dict, model: str,
                                 api_key: Optional[str], base_url: Optional[str]) -> AsyncIterator[str]:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key or "ollama", base_url=base_url or "https://api.openai.com/v1")

    sys_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages

    while True:
        stream = await client.chat.completions.create(
            model=model,
            messages=sys_messages,
            tools=_tools_for_openai(TOOLS),
            tool_choice="auto",
            stream=True,
        )

        text_buf = ""
        tool_calls_raw: dict[int, dict] = {}
        finish_reason = None

        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta is None:
                continue
            if delta.content:
                text_buf += delta.content
                yield json.dumps({"type": "text", "text": delta.content})
            if delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index
                    if idx not in tool_calls_raw:
                        tool_calls_raw[idx] = {"id": tc.id or "", "name": "", "args_raw": ""}
                    if tc.function:
                        if tc.function.name:
                            tool_calls_raw[idx]["name"] = tc.function.name
                        if tc.function.arguments:
                            tool_calls_raw[idx]["args_raw"] += tc.function.arguments
            finish_reason = chunk.choices[0].finish_reason or finish_reason

        if not tool_calls_raw:
            sys_messages.append({"role": "assistant", "content": text_buf})
            break

        # Build assistant message
        tool_call_objs = []
        for idx in sorted(tool_calls_raw):
            tc = tool_calls_raw[idx]
            tool_call_objs.append({"id": tc["id"], "type": "function", "function": {"name": tc["name"], "arguments": tc["args_raw"]}})
        sys_messages.append({"role": "assistant", "content": text_buf or None, "tool_calls": tool_call_objs})

        # Execute each tool
        for tc in tool_call_objs:
            name = tc["function"]["name"]
            try:
                args = json.loads(tc["function"]["arguments"] or "{}")
            except json.JSONDecodeError:
                args = {}
            yield json.dumps({"type": "tool_call", "tool": name, "args": args})
            result = await execute_tool(name, args, pipeline_state)
            yield json.dumps({"type": "tool_result", "tool": name, "result": result})
            sys_messages.append({"role": "tool", "tool_call_id": tc["id"], "content": json.dumps(result)})

        if finish_reason == "stop":
            break


# ── Public entry point ────────────────────────────────────────────────────────

async def run_agent(messages: list, pipeline_state: dict, provider: str, model: str,
                    api_key: Optional[str], base_url: Optional[str]) -> AsyncIterator[str]:
    if provider == "anthropic":
        async for chunk in run_anthropic(messages, pipeline_state, model, api_key or ""):
            yield chunk
    else:
        async for chunk in run_openai_compatible(messages, pipeline_state, model, api_key, base_url):
            yield chunk
