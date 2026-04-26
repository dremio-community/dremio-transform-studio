"""
dbt Compatibility — bidirectional dbt ↔ Transform Studio conversion.

Export (TS → dbt):
    Converts pipelines into a standard dbt project ZIP.

Import (dbt → TS):
    Parses a dbt project ZIP into Transform Studio pipelines.
    Uses regex-based Jinja resolution — no dbt installation required.

Usage:
    from dbt_compat import export_project_to_zip, parse_dbt_project
    zip_bytes = export_project_to_zip(pipelines)
    result    = parse_dbt_project(zip_bytes)
"""
from __future__ import annotations

import io
import json
import re
import zipfile
from typing import Any, Dict, List, Optional, Tuple

try:
    import yaml as _yaml
    _YAML_AVAILABLE = True
except ImportError:
    _YAML_AVAILABLE = False

from models import Pipeline, PipelineTest
from transforms.codegen import compile_pipeline


# ── Helpers ───────────────────────────────────────────────────────────────────

def _slugify(name: str) -> str:
    """Convert any string to a dbt-safe model/identifier name."""
    slug = re.sub(r"[^a-zA-Z0-9_]", "_", name).strip("_")
    slug = re.sub(r"_+", "_", slug)
    return slug.lower()


def _parse_table_name(table: str) -> Tuple[str, str]:
    """
    Parse a Dremio table reference into (schema, table) for dbt source().
    Handles both quoted and unquoted segments.

    Examples:
        '"Samples"."employees"'     → ('Samples', 'employees')
        'my_space.my_table'         → ('my_space', 'my_table')
        '"a"."b"."c"'              → ('a__b', 'c')
        'single_name'               → ('default', 'single_name')
    """
    segments = re.findall(r'"([^"]+)"|([^.\s]+)', table)
    parts = [q or u for q, u in segments if (q or u)]

    if len(parts) == 0:
        return ("default", table.strip('"'))
    elif len(parts) == 1:
        return ("default", parts[0])
    elif len(parts) == 2:
        return (parts[0], parts[1])
    else:
        # 3+ segments → join all-but-last as schema with '__'
        return ("__".join(parts[:-1]), parts[-1])


def _materialization(pipeline: Pipeline) -> str:
    """Map Transform Studio output_mode to dbt materialization."""
    mode = pipeline.output_mode
    if mode == "ctas":
        return "table"
    elif mode in ("insert", "incremental", "microbatch"):
        return "incremental"
    elif mode == "view":
        return "view"
    elif mode == "scd2":
        return "incremental"
    else:
        # preview / unknown → ephemeral (no output table written)
        return "ephemeral"


# ── Config block ──────────────────────────────────────────────────────────────

def _build_config_block(pipeline: Pipeline) -> str:
    """Build the {{ config(...) }} Jinja header for a dbt model."""
    mat = _materialization(pipeline)
    args: List[str] = [f"materialized='{mat}'"]

    if mat == "incremental" and pipeline.incremental_key:
        strat = pipeline.incremental_strategy or "append"
        if strat == "merge":
            args.append(f"unique_key='{pipeline.incremental_key}'")
            args.append("incremental_strategy='merge'")
        else:
            args.append("incremental_strategy='append'")

    inner = ",\n    ".join(args)
    return "{{\n    config(\n    " + inner + "\n    )\n}}"


# ── SQL conversion ─────────────────────────────────────────────────────────────

def _build_dbt_sql(pipeline: Pipeline, all_pipelines: List[Pipeline]) -> str:
    """
    Convert a Transform Studio pipeline into a dbt model .sql file.

    Transformations applied:
      1. source_table → {{ source('schema', 'table') }}
         OR {{ ref('model_name') }} when the table is another pipeline's output
      2. Any other pipeline output references inside step SQL → {{ ref(...) }}
      3. Incremental filter block added when output_mode is incremental/insert
      4. {{ config(...) }} header prepended
    """
    # Build output-table → model-name map for all pipelines
    output_to_model: Dict[str, str] = {}
    for p in all_pipelines:
        if p.output_table:
            output_to_model[p.output_table.strip()] = _slugify(p.name)

    # Generate base SQL via Transform Studio's own codegen
    raw_sql = compile_pipeline(
        source_table=pipeline.source_table,
        steps=pipeline.steps,
        initial_columns=None,   # skip column-threading; not needed for text export
        param_values={},
        parameters=list(pipeline.parameters),
    )

    # --- Replace source table in _src CTE ---
    src = pipeline.source_table.strip()
    if src in output_to_model:
        ref_name = output_to_model[src]
        source_ref = f"{{{{ ref('{ref_name}') }}}}"
    else:
        schema, tbl = _parse_table_name(src)
        source_ref = f"{{{{ source('{schema}', '{tbl}') }}}}"

    # The _src CTE always looks like:
    #   _src AS (SELECT * FROM <source_table>)
    escaped_src = re.escape(src)
    raw_sql = re.sub(
        rf"(_src AS \(SELECT \* FROM ){escaped_src}(\))",
        rf"\g<1>{source_ref}\g<2>",
        raw_sql,
    )

    # --- Replace other pipeline output tables referenced inside step SQL ---
    # (e.g. join steps that reference another pipeline's output table)
    for out_table, model_name in output_to_model.items():
        if out_table == src:
            continue  # already handled above
        esc = re.escape(out_table)
        ref_str = f"{{{{ ref('{model_name}') }}}}"
        raw_sql = re.sub(esc, ref_str, raw_sql)

    # --- Add incremental filter block for incremental/insert output modes ---
    if (pipeline.output_mode in ("incremental", "insert", "microbatch")
            and pipeline.incremental_key):
        incr_block = (
            "\n{% if is_incremental() %}\n"
            f"WHERE {pipeline.incremental_key} > "
            f"(SELECT MAX({pipeline.incremental_key}) FROM {{{{ this }}}})\n"
            "{% endif %}"
        )
        # Insert right before the final SELECT * FROM _sN
        raw_sql = re.sub(
            r"(SELECT \* FROM _s\d+\s*)$",
            lambda m: incr_block + "\n" + m.group(0),
            raw_sql,
            flags=re.MULTILINE,
        )

    # --- Compose final file ---
    config_block = _build_config_block(pipeline)
    parts = [config_block]
    if pipeline.description:
        parts.append(f"-- {pipeline.description}")
    parts.append(raw_sql)

    return "\n\n".join(parts) + "\n"


# ── Test conversion ───────────────────────────────────────────────────────────

def _test_to_dbt(test: PipelineTest) -> Optional[object]:
    """
    Convert a Transform Studio PipelineTest to a dbt schema.yml test entry.
    Returns a string (simple test), dict (parameterized test), or None (not mappable).
    """
    t = test.test_type
    if t == "not_null":
        return "not_null"
    elif t == "unique":
        return "unique"
    elif t == "accepted_values":
        if test.values:
            return {"accepted_values": {"values": list(test.values)}}
    elif t == "relationships":
        if test.reference_table and test.reference_column:
            ref_schema, ref_tbl = _parse_table_name(test.reference_table)
            return {
                "relationships": {
                    "to": f"source('{ref_schema}', '{ref_tbl}')",
                    "field": test.reference_column,
                }
            }
    elif t == "row_count_between":
        # Requires dbt_utils — include as a comment/note
        return {
            "dbt_utils.recency": {
                "_note": (
                    f"row_count_between ({test.min_rows}–{test.max_rows}) — "
                    "add dbt_utils and replace with appropriate test"
                )
            }
        }
    # custom_sql doesn't map cleanly to dbt — skip
    return None


# ── sources.yml ───────────────────────────────────────────────────────────────

def build_sources_yml(pipelines: List[Pipeline], all_pipelines: List[Pipeline]) -> str:
    """
    Generate sources.yml for all external Dremio tables referenced by pipelines.
    Tables that are themselves pipeline outputs are skipped (they become refs).
    """
    known_outputs = {p.output_table.strip() for p in all_pipelines if p.output_table}

    # schema → set of table names
    sources: Dict[str, set] = {}
    for pipeline in pipelines:
        src = pipeline.source_table.strip()
        if src not in known_outputs:
            schema, tbl = _parse_table_name(src)
            sources.setdefault(schema, set()).add(tbl)

    if not sources:
        return "version: 2\n\nsources: []\n"

    lines = ["version: 2", "", "sources:"]
    for schema in sorted(sources):
        lines.append(f"  - name: {schema}")
        lines.append("    tables:")
        for tbl in sorted(sources[schema]):
            lines.append(f"      - name: {tbl}")

    return "\n".join(lines) + "\n"


# ── schema.yml ────────────────────────────────────────────────────────────────

def _render_test_entry(t: object, indent: str) -> List[str]:
    """Render a single dbt test entry (string or dict) as YAML lines."""
    lines = []
    if isinstance(t, str):
        lines.append(f"{indent}- {t}")
    elif isinstance(t, dict):
        for k, v in t.items():
            if isinstance(v, dict):
                lines.append(f"{indent}- {k}:")
                for vk, vv in v.items():
                    if vk.startswith("_"):
                        # internal comment/note keys — emit as YAML comment
                        lines.append(f"{indent}    # {vk[1:]}: {vv}")
                    else:
                        lines.append(f"{indent}    {vk}: {json.dumps(vv)}")
            else:
                lines.append(f"{indent}- {k}: {json.dumps(v)}")
    return lines


def build_schema_yml(pipelines: List[Pipeline]) -> str:
    """Generate a combined schema.yml for all exported models."""
    lines = ["version: 2", "", "models:"]

    for pipeline in pipelines:
        model_name = _slugify(pipeline.name)
        lines.append(f"  - name: {model_name}")
        if pipeline.description:
            # Escape double-quotes in description
            desc = pipeline.description.replace('"', '\\"')
            lines.append(f'    description: "{desc}"')

        # Group tests by column (column-level) vs model-level
        col_tests: Dict[str, List[object]] = {}
        for test in pipeline.tests:
            dbt_test = _test_to_dbt(test)
            if dbt_test is None:
                continue
            if test.column:
                col_tests.setdefault(test.column, []).append(dbt_test)
            # Model-level tests (row_count etc.) go in columns section under a
            # placeholder; for now we emit them as comments
            # Future: support model-level test syntax

        if col_tests:
            lines.append("    columns:")
            for col, tests in col_tests.items():
                lines.append(f"      - name: {col}")
                lines.append("        tests:")
                for t in tests:
                    lines.extend(_render_test_entry(t, "          "))

    return "\n".join(lines) + "\n"


# ── dbt_project.yml ───────────────────────────────────────────────────────────

def build_dbt_project_yml(project_name: str = "transform_studio") -> str:
    return (
        f"name: '{project_name}'\n"
        "version: '1.0.0'\n"
        "config-version: 2\n"
        "\n"
        f"profile: '{project_name}'\n"
        "\n"
        "model-paths: [\"models\"]\n"
        "test-paths: [\"tests\"]\n"
        "analysis-paths: [\"analyses\"]\n"
        "macro-paths: [\"macros\"]\n"
        "\n"
        "target-path: \"target\"\n"
        "clean-targets:\n"
        "  - \"target\"\n"
        "  - \"dbt_packages\"\n"
        "\n"
        "models:\n"
        f"  {project_name}:\n"
        "    +materialized: table\n"
    )


# ── profiles.yml ──────────────────────────────────────────────────────────────

def build_profiles_yml() -> str:
    return (
        "# Edit this file with your Dremio connection details.\n"
        "# See: https://github.com/fabrice-etanchaud/dbt-dremio\n"
        "\n"
        "transform_studio:\n"
        "  target: dev\n"
        "  outputs:\n"
        "    dev:\n"
        "      type: dremio\n"
        "      threads: 4\n"
        "      host: localhost\n"
        "      port: 9047\n"
        "      user: admin\n"
        "      password: \"your-password\"\n"
        "      # --- Dremio Cloud ---\n"
        "      # use_ssl: true\n"
        "      # pat: \"your-personal-access-token\"\n"
        "      # cloud_project_id: \"your-project-id\"\n"
        "      dremio_space: \"$scratch\"\n"
        "      dremio_space_folder: \"dbt\"\n"
    )


# ── README.md ─────────────────────────────────────────────────────────────────

def build_readme(pipelines: List[Pipeline]) -> str:
    model_list = "\n".join(
        f"- `{_slugify(p.name)}` — {p.description or p.name}"
        for p in pipelines
        if p.output_mode != "preview"
    )
    if not model_list:
        model_list = "*(no materialized pipelines)*"

    return (
        "# Transform Studio → dbt Export\n\n"
        "This dbt project was generated by **Dremio Transform Studio**.\n\n"
        "## Setup\n\n"
        "1. Install the dbt-dremio adapter:\n"
        "   ```bash\n"
        "   pip install dbt-dremio\n"
        "   ```\n\n"
        "2. Edit `profiles.yml` with your Dremio connection details.\n\n"
        "3. Run:\n"
        "   ```bash\n"
        "   dbt debug      # verify connection\n"
        "   dbt run        # execute all models\n"
        "   dbt test       # run data tests\n"
        "   ```\n\n"
        "## Models\n\n"
        f"{model_list}\n\n"
        "## Notes\n\n"
        "- Source tables are declared in `models/sources.yml`.\n"
        "- Tests are declared in `models/schema.yml`.\n"
        "- Each `.sql` file in `models/` corresponds to one Transform Studio pipeline.\n"
        "- `row_count_between` tests require the `dbt_utils` package — see `packages.yml`.\n"
    )


# ── Name deduplication ────────────────────────────────────────────────────────

def _build_model_name_map(pipelines: List[Pipeline]) -> Dict[str, str]:
    """
    Assign a unique dbt model name to each pipeline.

    If two pipelines share the same slugified name, append a short suffix
    from the pipeline ID (first 6 chars) to make it unique.

    Returns: { pipeline.id → model_name }
    """
    # First pass: assign base names
    name_map: Dict[str, str] = {}          # pipeline_id → model_name
    seen_names: Dict[str, List[str]] = {}  # base_slug → [pipeline_ids]

    for p in pipelines:
        base = _slugify(p.name)
        seen_names.setdefault(base, []).append(p.id)

    for base, ids in seen_names.items():
        if len(ids) == 1:
            name_map[ids[0]] = base
        else:
            # Disambiguate with short ID suffix
            for pid in ids:
                # Strip non-alphanumeric chars from ID suffix (UUIDs contain dashes)
                safe_suffix = re.sub(r"[^a-z0-9]", "", pid.lower())[:6]
                name_map[pid] = f"{base}_{safe_suffix}"

    return name_map


# ── Main export function ───────────────────────────────────────────────────────

def export_project_to_zip(pipelines: List[Pipeline]) -> bytes:
    """
    Export all pipelines as a dbt project ZIP archive.

    Returns raw ZIP bytes suitable for streaming as a file download.
    The ZIP contains a single top-level directory: `transform_studio/`.
    """
    # Build a stable, deduplicated name map once for the whole export
    name_map = _build_model_name_map(pipelines)

    buf = io.BytesIO()

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        root = "transform_studio"

        # Project files
        zf.writestr(f"{root}/dbt_project.yml", build_dbt_project_yml())
        zf.writestr(f"{root}/profiles.yml", build_profiles_yml())
        zf.writestr(f"{root}/README.md", build_readme(pipelines))

        # Empty placeholder dirs
        zf.writestr(f"{root}/macros/.gitkeep", "")
        zf.writestr(f"{root}/tests/.gitkeep", "")
        zf.writestr(f"{root}/analyses/.gitkeep", "")

        # models/sources.yml
        zf.writestr(
            f"{root}/models/sources.yml",
            build_sources_yml(pipelines, pipelines),
        )

        # models/schema.yml (all models combined)
        zf.writestr(
            f"{root}/models/schema.yml",
            build_schema_yml(pipelines),
        )

        # Per-pipeline model SQL files
        for pipeline in pipelines:
            model_name = name_map[pipeline.id]
            try:
                sql = _build_dbt_sql(pipeline, pipelines)
            except Exception as exc:
                # Write a stub so the project is still importable
                sql = (
                    f"-- ⚠ Export failed for pipeline '{pipeline.name}': {exc}\n"
                    f"-- Fix the pipeline in Transform Studio and re-export.\n"
                    f"SELECT 1 AS _placeholder\n"
                )
            zf.writestr(f"{root}/models/{model_name}.sql", sql)

    buf.seek(0)
    return buf.read()


# ═══════════════════════════════════════════════════════════════════════════════
# IMPORT  (dbt project → Transform Studio pipelines)
# ═══════════════════════════════════════════════════════════════════════════════

# ── YAML helpers ──────────────────────────────────────────────────────────────

def _load_yaml(text: str) -> Any:
    """Parse YAML text, returning None on failure."""
    if not _YAML_AVAILABLE or not text:
        return None
    try:
        return _yaml.safe_load(text)
    except Exception:
        return None


def _parse_sources_yml(text: str) -> Dict[str, str]:
    """
    Parse sources.yml → map from (schema, table) key to Dremio-quoted ref.
    Key format: "schema__table" (same as _parse_table_name output joined).
    Value: '"schema"."table"'
    """
    data = _load_yaml(text)
    result: Dict[str, str] = {}
    if not data or "sources" not in data:
        return result
    for src in (data.get("sources") or []):
        schema = src.get("name", "")
        for tbl in (src.get("tables") or []):
            tbl_name = tbl.get("name", "")
            if schema and tbl_name:
                key = f"{schema}__{tbl_name}"
                result[key] = f'"{schema}"."{tbl_name}"'
    return result


def _parse_schema_yml(text: str) -> Dict[str, dict]:
    """
    Parse schema.yml → map from model_name to { description, columns_tests }.
    columns_tests: { col_name: [test_entry, ...] }
    """
    data = _load_yaml(text)
    result: Dict[str, dict] = {}
    if not data or "models" not in data:
        return result
    for model in (data.get("models") or []):
        name = model.get("name", "")
        if not name:
            continue
        col_tests: Dict[str, List[Any]] = {}
        for col in (model.get("columns") or []):
            col_name = col.get("name", "")
            tests = col.get("tests") or []
            if col_name and tests:
                col_tests[col_name] = tests
        result[name] = {
            "description": model.get("description"),
            "col_tests": col_tests,
        }
    return result


# ── Jinja resolution ──────────────────────────────────────────────────────────

def _extract_config(sql: str) -> Tuple[str, Dict[str, str]]:
    """
    Extract and remove {{ config(...) }} block from dbt model SQL.
    Returns (sql_without_config, config_dict).
    config_dict keys: 'materialized', 'unique_key', 'incremental_strategy', etc.
    """
    config: Dict[str, str] = {}
    pattern = re.compile(r"\{\{[\s\n]*config\s*\(([^)]*)\)[\s\n]*\}\}", re.DOTALL)
    match = pattern.search(sql)
    if match:
        inner = match.group(1)
        # Parse key=value pairs (values may be quoted or unquoted)
        for kv in re.finditer(r"(\w+)\s*=\s*['\"]?([^,'\")\s]+)['\"]?", inner):
            config[kv.group(1)] = kv.group(2)
        sql = sql[:match.start()] + sql[match.end():]
    return sql.strip(), config


def _strip_incremental_blocks(sql: str) -> str:
    """Remove {% if is_incremental() %} ... {% endif %} blocks."""
    # Handle both single-line and multiline
    sql = re.sub(
        r"\{%-?\s*if\s+is_incremental\(\)\s*-?%\}.*?\{%-?\s*endif\s*-?%\}",
        "",
        sql,
        flags=re.DOTALL | re.IGNORECASE,
    )
    return sql


def _strip_jinja_comments(sql: str) -> str:
    """Remove {# ... #} Jinja comments."""
    return re.sub(r"\{#.*?#\}", "", sql, flags=re.DOTALL)


def _resolve_sources(sql: str, source_map: Dict[str, str]) -> Tuple[str, List[Tuple[str, str]]]:
    """
    Replace {{ source('schema', 'table') }} with Dremio-quoted table refs.
    Returns (resolved_sql, list_of_(schema, table)_used).
    """
    used: List[Tuple[str, str]] = []

    def _replace(m: re.Match) -> str:
        schema = m.group(1).strip()
        table = m.group(2).strip()
        used.append((schema, table))
        key = f"{schema}__{table}"
        # Use the sources.yml mapping if available, else construct directly
        return source_map.get(key, f'"{schema}"."{table}"')

    sql = re.sub(
        r"\{\{\s*source\s*\(\s*['\"]([^'\"]+)['\"]\s*,\s*['\"]([^'\"]+)['\"]\s*\)\s*\}\}",
        _replace,
        sql,
    )
    return sql, used


def _resolve_refs(sql: str) -> Tuple[str, List[str]]:
    """
    Replace {{ ref('model_name') }} with a placeholder table reference.
    Placeholders are of the form: _dbt_ref__{model_name}
    These get resolved to real table names after all pipelines are created.
    Returns (resolved_sql, [model_names_referenced]).
    """
    refs: List[str] = []

    def _replace(m: re.Match) -> str:
        model = m.group(1).strip()
        refs.append(model)
        # Use a deterministic placeholder that we can find later
        return f"_dbt_ref__{model}"

    sql = re.sub(
        r"\{\{\s*ref\s*\(\s*['\"]([^'\"]+)['\"]\s*\)\s*\}\}",
        _replace,
        sql,
    )
    return sql, refs


def _detect_remaining_jinja(sql: str) -> List[str]:
    """Return list of unresolvable Jinja expressions still in the SQL."""
    blocks = re.findall(r"\{\{[^}]+\}\}|\{%-?[^%]+%-?\}", sql)
    return [b.strip() for b in blocks]


def _dbt_test_to_pipeline_test(test_entry: Any, col_name: str) -> Optional[dict]:
    """
    Convert a schema.yml test entry to a Transform Studio PipelineTest dict.
    Returns None if not mappable.
    """
    import uuid
    if isinstance(test_entry, str):
        t = test_entry.lower()
        if t == "not_null":
            return {"id": str(uuid.uuid4()), "name": f"{col_name}_not_null",
                    "test_type": "not_null", "column": col_name, "severity": "error"}
        elif t == "unique":
            return {"id": str(uuid.uuid4()), "name": f"{col_name}_unique",
                    "test_type": "unique", "column": col_name, "severity": "error"}
    elif isinstance(test_entry, dict):
        if "accepted_values" in test_entry:
            vals = test_entry["accepted_values"].get("values", [])
            return {"id": str(uuid.uuid4()), "name": f"{col_name}_accepted_values",
                    "test_type": "accepted_values", "column": col_name,
                    "values": [str(v) for v in vals], "severity": "error"}
        if "relationships" in test_entry:
            rel = test_entry["relationships"]
            ref_field = rel.get("field", "")
            # 'to' is like "source('schema', 'table')" — extract table
            to_str = rel.get("to", "")
            ref_table_match = re.search(r"source\s*\(\s*['\"]([^'\"]+)['\"]\s*,\s*['\"]([^'\"]+)['\"]\s*\)", to_str)
            if ref_table_match:
                ref_table = f'"{ref_table_match.group(1)}"."{ref_table_match.group(2)}"'
            else:
                ref_table = to_str
            return {"id": str(uuid.uuid4()), "name": f"{col_name}_relationships",
                    "test_type": "relationships", "column": col_name,
                    "reference_table": ref_table, "reference_column": ref_field,
                    "severity": "error"}
    return None


# ── SQL → custom_sql step ─────────────────────────────────────────────────────

def _sql_to_custom_step(sql: str, source_table: str) -> str:
    """
    Replace the first occurrence of source_table in the SQL with `{input}`.
    This makes the SQL usable as a Transform Studio custom_sql step.
    """
    # Try exact match first (quoted table reference)
    escaped = re.escape(source_table)
    replaced = re.sub(escaped, "{input}", sql, count=1)
    if replaced != sql:
        return replaced

    # Try _dbt_ref__ placeholder match
    if source_table.startswith("_dbt_ref__"):
        escaped2 = re.escape(source_table)
        replaced = re.sub(escaped2, "{input}", sql, count=1)
        if replaced != sql:
            return replaced

    # Fallback: prepend a WITH clause wrapping the source
    return f"SELECT * FROM (\n{sql}\n) AS _imported"


# ── CTE decomposition ────────────────────────────────────────────────────────

def _parse_ctes(sql: str) -> Tuple[List[Tuple[str, str]], str]:
    """
    Parse a WITH…SELECT statement into its CTEs and final SELECT.
    Returns ([(cte_name, cte_body), ...], final_select).
    If no WITH clause, returns ([], original_sql).
    Handles nested parens, single-quoted strings, double-quoted identifiers,
    and -- / /* */ comments.
    """
    s = sql.strip()
    if not s[:4].upper() == 'WITH':
        return [], s

    pos = 4  # skip 'WITH'
    ctes: List[Tuple[str, str]] = []

    while pos < len(s):
        # skip whitespace
        while pos < len(s) and s[pos].isspace():
            pos += 1
        if pos >= len(s):
            break

        # peek at next word
        word_end = pos
        while word_end < len(s) and (s[word_end].isalnum() or s[word_end] == '_'):
            word_end += 1
        word = s[pos:word_end].upper()

        # if it's a statement keyword, we've reached the final SELECT
        if word in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE'):
            break

        cte_name = s[pos:word_end]
        pos = word_end

        # skip whitespace + RECURSIVE / AS
        while pos < len(s) and s[pos].isspace():
            pos += 1
        if s[pos:pos+9].upper() == 'RECURSIVE':
            pos += 9
            while pos < len(s) and s[pos].isspace():
                pos += 1
        if s[pos:pos+2].upper() == 'AS':
            pos += 2
        while pos < len(s) and s[pos].isspace():
            pos += 1

        if pos >= len(s) or s[pos] != '(':
            break

        # scan balanced parens with awareness of strings/comments
        depth = 0
        body_start = pos + 1
        i = pos
        while i < len(s):
            c = s[i]
            if c == '(':
                depth += 1; i += 1
            elif c == ')':
                depth -= 1; i += 1
                if depth == 0:
                    break
            elif c == "'":
                i += 1
                while i < len(s) and s[i] != "'":
                    if s[i] == '\\': i += 1
                    i += 1
                i += 1
            elif c == '"':
                i += 1
                while i < len(s) and s[i] != '"':
                    i += 1
                i += 1
            elif c == '-' and i + 1 < len(s) and s[i+1] == '-':
                while i < len(s) and s[i] != '\n':
                    i += 1
            elif c == '/' and i + 1 < len(s) and s[i+1] == '*':
                i += 2
                while i < len(s) - 1 and not (s[i] == '*' and s[i+1] == '/'):
                    i += 1
                i += 2
            else:
                i += 1

        body = s[body_start:i - 1].strip()
        ctes.append((cte_name, body))
        pos = i

        # skip whitespace + optional comma
        while pos < len(s) and s[pos].isspace():
            pos += 1
        if pos < len(s) and s[pos] == ',':
            pos += 1

    return ctes, s[pos:].strip()


def _references_cte(sql: str, cte_name: str) -> bool:
    return bool(re.search(r'\b' + re.escape(cte_name) + r'\b', sql, re.IGNORECASE))


def decompose_sql_to_steps(sql: str, source_table: str) -> List[dict]:
    """
    Decompose a WITH…SELECT into individual custom_sql pipeline steps.
    Each CTE becomes one step. For a CTE that references earlier CTEs:
      - the most-recently-defined predecessor becomes {input}
      - other referenced CTEs are inlined as subqueries
    Falls back to a single step when there are no CTEs.
    """
    import uuid as _uuid

    ctes, final_select = _parse_ctes(sql)

    if not ctes:
        return [{
            "id": str(_uuid.uuid4()),
            "transform_type": "custom_sql",
            "config": {"sql": _sql_to_custom_step(sql, source_table)},
            "label": "dbt model SQL",
        }]

    steps: List[dict] = []
    cte_bodies: Dict[str, str] = {}  # name → body with real names (for inlining)

    for idx, (cte_name, cte_body) in enumerate(ctes):
        step_sql = cte_body

        # pick the most-recently-defined predecessor referenced by this CTE
        input_cte: Optional[str] = None
        for name, _ in reversed(ctes[:idx]):
            if _references_cte(step_sql, name):
                input_cte = name
                break

        # inline all other referenced predecessors as subqueries
        for name, _ in ctes[:idx]:
            if name == input_cte:
                continue
            if _references_cte(step_sql, name):
                resolved_body = cte_bodies.get(name, name)
                step_sql = re.sub(
                    r'\b' + re.escape(name) + r'\b',
                    f'({resolved_body})',
                    step_sql,
                )

        if input_cte is not None:
            step_sql = re.sub(
                r'\b' + re.escape(input_cte) + r'\b',
                '{input}',
                step_sql,
            )
        else:
            step_sql = _sql_to_custom_step(step_sql, source_table)

        # store a version with real names for later inlining
        cte_bodies[cte_name] = step_sql.replace(
            '{input}', input_cte if input_cte else source_table
        )

        steps.append({
            "id": str(_uuid.uuid4()),
            "transform_type": "custom_sql",
            "config": {"sql": step_sql},
            "label": cte_name,
        })

    # add the final SELECT if it's not trivially "SELECT * FROM last_cte"
    last_name = ctes[-1][0]
    trivial = re.compile(
        r'^SELECT\s+\*\s+FROM\s+' + re.escape(last_name) + r'\s*$',
        re.IGNORECASE,
    )
    if not trivial.match(final_select):
        final_sql = re.sub(
            r'\b' + re.escape(last_name) + r'\b',
            '{input}',
            final_select,
            flags=re.IGNORECASE,
        )
        # inline any other CTE references in the final SELECT
        for name, _ in ctes[:-1]:
            if _references_cte(final_sql, name):
                resolved_body = cte_bodies.get(name, name)
                final_sql = re.sub(
                    r'\b' + re.escape(name) + r'\b',
                    f'({resolved_body})',
                    final_sql,
                )
        steps.append({
            "id": str(_uuid.uuid4()),
            "transform_type": "custom_sql",
            "config": {"sql": final_sql},
            "label": "final select",
        })

    return steps


# ── Main parse function ───────────────────────────────────────────────────────

def parse_dbt_project(zip_bytes: bytes) -> Dict[str, Any]:
    """
    Parse a dbt project ZIP file into a structured list of importable models.

    Returns:
    {
        "models": [
            {
                "model_name": str,           # slug, becomes pipeline name
                "display_name": str,         # human-friendly name (spaces from underscores)
                "description": str | None,
                "source_table": str,         # first resolved source or ref placeholder
                "custom_sql": str,           # resolved SQL with {input} for source_table
                "output_mode": str,          # "ctas" | "incremental" | "view" | "preview"
                "incremental_strategy": str | None,
                "unique_key": str | None,
                "refs": [str],              # model names this depends on
                "sources_used": [[str, str]], # [[schema, table], ...]
                "tests": [dict],            # PipelineTest-compatible dicts
                "warnings": [str],          # unresolvable macros etc.
            }
        ],
        "global_warnings": [str],
        "error": str | None,
    }
    """
    models: List[Dict[str, Any]] = []
    global_warnings: List[str] = []

    try:
        zf_buf = io.BytesIO(zip_bytes)
        with zipfile.ZipFile(zf_buf) as zf:
            names = zf.namelist()

            # Find the models/ directory (handle nested project dirs)
            model_files = [n for n in names if n.endswith(".sql") and "/models/" in n]
            non_model_dirs = {n.split("/models/")[0] for n in model_files if "/models/" in n}
            project_root = (next(iter(non_model_dirs)) + "/") if non_model_dirs else ""

            # Load sources.yml
            source_map: Dict[str, str] = {}
            for candidate in [
                f"{project_root}models/sources.yml",
                "models/sources.yml",
                "sources.yml",
            ]:
                if candidate in names:
                    source_map = _parse_sources_yml(zf.read(candidate).decode("utf-8", errors="replace"))
                    break

            # Load schema.yml
            schema_meta: Dict[str, dict] = {}
            for candidate in [
                f"{project_root}models/schema.yml",
                "models/schema.yml",
                "schema.yml",
            ]:
                if candidate in names:
                    schema_meta = _parse_schema_yml(zf.read(candidate).decode("utf-8", errors="replace"))
                    break

            # Process each model SQL file
            for path in model_files:
                filename = path.split("/")[-1]
                if not filename.endswith(".sql"):
                    continue
                model_name = filename[:-4]  # strip .sql

                raw_sql = zf.read(path).decode("utf-8", errors="replace")
                warnings: List[str] = []

                # ── Step 1: extract config block
                sql, cfg = _extract_config(raw_sql)

                # ── Step 2: strip Jinja comments
                sql = _strip_jinja_comments(sql)

                # ── Step 3: strip incremental blocks
                sql = _strip_incremental_blocks(sql)

                # ── Step 4: resolve source() calls
                sql, sources_used = _resolve_sources(sql, source_map)

                # ── Step 5: resolve ref() calls
                sql, refs = _resolve_refs(sql)

                # ── Step 6: detect unresolvable macros
                remaining = _detect_remaining_jinja(sql)
                if remaining:
                    warnings.extend(
                        f"Unresolvable macro: {r}" for r in remaining[:5]
                    )

                sql = sql.strip()

                # ── Determine output_mode from config
                mat = cfg.get("materialized", "table").lower()
                output_mode_map = {
                    "table": "ctas",
                    "incremental": "incremental",
                    "view": "view",
                    "ephemeral": "preview",
                }
                output_mode = output_mode_map.get(mat, "ctas")

                # ── Determine source_table
                # Priority: first source() → first ref() → fallback
                if sources_used:
                    schema, tbl = sources_used[0]
                    source_table = f'"{schema}"."{tbl}"'
                elif refs:
                    source_table = f"_dbt_ref__{refs[0]}"
                else:
                    source_table = '"dbt_import"."unknown_source"'
                    warnings.append("Could not determine source table — set manually after import.")

                # ── Build custom SQL step content
                custom_sql_content = _sql_to_custom_step(sql, source_table)

                # ── Collect tests from schema.yml
                tests: List[dict] = []
                meta = schema_meta.get(model_name, {})
                for col_name, col_test_list in (meta.get("col_tests") or {}).items():
                    for entry in col_test_list:
                        t = _dbt_test_to_pipeline_test(entry, col_name)
                        if t:
                            tests.append(t)

                # ── Display name: underscores → spaces, title-case
                # Strip trailing 6-char hex suffix added by deduplication (e.g. customer_00edaf → Customer)
                display_base = re.sub(r"_[0-9a-f]{6}$", "", model_name)
                display_name = display_base.replace("_", " ").title()

                cte_count = len(_parse_ctes(sql)[0])
                models.append({
                    "model_name": model_name,
                    "display_name": display_name,
                    "description": meta.get("description"),
                    "source_table": source_table,
                    "custom_sql": custom_sql_content,
                    "resolved_sql": sql,   # Jinja-resolved, before {input} substitution
                    "cte_count": cte_count,
                    "output_mode": output_mode,
                    "incremental_strategy": cfg.get("incremental_strategy"),
                    "unique_key": cfg.get("unique_key"),
                    "refs": list(dict.fromkeys(refs)),  # deduplicated, order-preserving
                    "sources_used": [[s, t] for s, t in sources_used],
                    "tests": tests,
                    "warnings": warnings,
                    "raw_sql": raw_sql,
                })

    except zipfile.BadZipFile:
        return {"models": [], "global_warnings": [], "error": "Invalid ZIP file."}
    except Exception as exc:
        return {"models": [], "global_warnings": [], "error": str(exc)}

    if not models:
        global_warnings.append("No model .sql files found in the models/ directory.")

    return {"models": models, "global_warnings": global_warnings, "error": None}
