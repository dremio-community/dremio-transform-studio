from __future__ import annotations
from typing import Optional
from models import TransformStep, PipelineParameter
from transforms.library import clean, reshape, datetime_transforms, enrich, aggregate, string_transforms, custom_sql

_CODEGEN_MAP: dict = {}
_CODEGEN_MAP.update(clean.CODEGEN_MAP)
_CODEGEN_MAP.update(reshape.CODEGEN_MAP)
_CODEGEN_MAP.update(datetime_transforms.CODEGEN_MAP)
_CODEGEN_MAP.update(enrich.CODEGEN_MAP)
_CODEGEN_MAP.update(aggregate.CODEGEN_MAP)
_CODEGEN_MAP.update(string_transforms.CODEGEN_MAP)
_CODEGEN_MAP.update(custom_sql.CODEGEN_MAP)


def _substitute_params(config: dict, parameters: list, param_values: dict) -> dict:
    """
    Substitute {{param_name}} placeholders in string config values.
    Falls back to param default_value if not provided in param_values.
    """
    if not parameters and not param_values:
        return config

    # Build lookup: name -> value (provided or default)
    lookup = {}
    for p in parameters:
        name = p.name if hasattr(p, "name") else p.get("name", "")
        default = p.default_value if hasattr(p, "default_value") else p.get("default_value", "")
        lookup[name] = param_values.get(name, default)

    def _sub(val):
        if isinstance(val, str):
            for k, v in lookup.items():
                val = val.replace(f"{{{{{k}}}}}", str(v))
            return val
        elif isinstance(val, dict):
            return {kk: _sub(vv) for kk, vv in val.items()}
        elif isinstance(val, list):
            return [_sub(item) for item in val]
        return val

    return {k: _sub(v) for k, v in config.items()}


def generate_step_sql(
    step: TransformStep,
    input_alias: str,
    columns: Optional[list] = None,
) -> tuple:
    """
    Call the transform's codegen function.
    Returns (sql, new_columns):
      - new_columns is None if the column list is unchanged from input
      - new_columns is a new list if this step adds/removes/renames columns
    """
    fn = _CODEGEN_MAP.get(step.transform_type)
    if fn is None:
        raise ValueError(f"No codegen for transform type: {step.transform_type!r}")
    return fn(step.config, input_alias, columns)


def _column_map_for_step(step_type: str, config: dict, input_cols: list) -> dict:
    """
    Return a column map { output_col: [source_cols...] } for a single step.
    source_cols are the ORIGINAL SOURCE TABLE columns that contribute to each output col.
    input_cols is the ordered list of columns entering this step.

    Rules:
    - Pass-through: output_col → [input_col]  (same name, same meaning)
    - New computed col: new_col → [primary_source_col]  (derived from config)
    - Dropped cols: not in output map
    - Complex/unknown: all new cols → ["*"]  (depends on all inputs)
    """
    col_set = set(input_cols)

    # ── Pass-through transforms (filter/sort only, columns unchanged) ────────
    if step_type in {
        "filter_rows", "drop_nulls", "trim_whitespace", "remove_special_chars",
        "validate_regex", "clip_values", "outlier_filter", "sample_rows",
        "reorder_columns", "scd_type_1", "dedupe_keep_latest", "remove_duplicates",
    }:
        return {c: [c] for c in input_cols}

    # ── Standardize case / cast type / replace string (rename-like, same col) ─
    if step_type in {"standardize_case", "cast_type", "replace_string", "upper_lower"}:
        col = config.get("column") or config.get("columns", [None])[0]
        return {c: [c] for c in input_cols}  # same col names, type/value changed

    # ── Drop columns ──────────────────────────────────────────────────────────
    if step_type == "drop_columns":
        drop = set(config.get("columns") or [])
        return {c: [c] for c in input_cols if c not in drop}

    # ── Select columns ────────────────────────────────────────────────────────
    if step_type == "select_columns":
        keep = config.get("columns") or []
        return {c: [c] for c in keep if c in col_set}

    # ── Rename columns ────────────────────────────────────────────────────────
    if step_type == "rename_columns":
        renames = config.get("renames") or {}
        result = {}
        for c in input_cols:
            new_name = renames.get(c, c)
            result[new_name] = [c]
        return result

    # ── Fill null (same cols) ─────────────────────────────────────────────────
    if step_type == "fill_null":
        return {c: [c] for c in input_cols}

    # ── Add column (new col derived from expression) ──────────────────────────
    if step_type == "add_column":
        result = {c: [c] for c in input_cols}
        name = config.get("name")
        if name:
            # Try to find which input columns appear in the expression
            expr = str(config.get("expression", ""))
            sources = [c for c in input_cols if c in expr] or ["*"]
            result[name] = sources
        return result

    # ── Conditional column (CASE WHEN → new col) ─────────────────────────────
    if step_type == "conditional_column":
        result = {c: [c] for c in input_cols}
        name = config.get("output_name")
        cond_col = config.get("condition_column")
        if name:
            result[name] = [cond_col] if cond_col and cond_col in col_set else ["*"]
        return result

    # ── Combine columns ───────────────────────────────────────────────────────
    if step_type == "combine_columns":
        result = {c: [c] for c in input_cols}
        name = config.get("output_name")
        src_cols = config.get("columns") or []
        if name:
            result[name] = [c for c in src_cols if c in col_set] or src_cols
        return result

    # ── Split column (col → col_part1, col_part2, ...) ───────────────────────
    if step_type == "split_column":
        result = {c: [c] for c in input_cols}
        src = config.get("column")
        parts = config.get("output_columns") or []
        if src and parts:
            for p in parts:
                result[p] = [src]
        return result

    # ── Window / running / ranking functions (new col, same inputs) ───────────
    if step_type in {"add_row_number", "add_running_total", "lag_lead",
                      "percent_of_total", "rolling_window"}:
        result = {c: [c] for c in input_cols}
        name = config.get("output_name") or config.get("name")
        src = config.get("column")
        if name:
            result[name] = [src] if src and src in col_set else ["*"]
        return result

    # ── Extract regex ─────────────────────────────────────────────────────────
    if step_type == "extract_regex":
        result = {c: [c] for c in input_cols}
        name = config.get("output_name")
        src = config.get("column")
        if name:
            result[name] = [src] if src and src in col_set else ["*"]
        return result

    # ── String transforms that add a column ───────────────────────────────────
    if step_type in {"pad_string", "substring", "string_length", "concat_literal", "hash_column", "surrogate_key"}:
        result = {c: [c] for c in input_cols}
        name = config.get("output_name") or config.get("name")
        src = config.get("column")
        src_cols = config.get("columns") or []
        if name and name not in col_set:
            srcs = ([src] if src and src in col_set else []) + [c for c in src_cols if c in col_set]
            result[name] = srcs or ["*"]
        return result

    # ── Map values / bin values (modifies existing col or adds new) ───────────
    if step_type in {"map_values", "bin_values"}:
        result = {c: [c] for c in input_cols}
        name = config.get("output_name") or config.get("output_column")
        src = config.get("column")
        if name and name not in col_set and src:
            result[name] = [src]
        return result

    # ── Unit conversion ───────────────────────────────────────────────────────
    if step_type == "unit_conversion":
        return {c: [c] for c in input_cols}

    # ── Date transforms (same col, different value) ───────────────────────────
    if step_type in {"parse_date", "truncate_date"}:
        return {c: [c] for c in input_cols}

    if step_type == "extract_date_part":
        result = {c: [c] for c in input_cols}
        name = config.get("output_name")
        src = config.get("column")
        if name:
            result[name] = [src] if src and src in col_set else ["*"]
        return result

    if step_type in {"date_diff", "date_add"}:
        result = {c: [c] for c in input_cols}
        name = config.get("output_name")
        start = config.get("start_column") or config.get("column")
        end = config.get("end_column")
        if name:
            srcs = [c for c in [start, end] if c and c in col_set]
            result[name] = srcs or ["*"]
        return result

    # ── Lookup join / join / union (complex — all cols from all inputs) ───────
    if step_type in {"lookup_join", "join", "union"}:
        # Pass-through originals + new cols marked as derived from all
        return {c: [c] for c in input_cols}  # best-effort: pass-through existing

    # ── Flatten JSON ──────────────────────────────────────────────────────────
    if step_type == "flatten_json":
        result = {c: [c] for c in input_cols}
        src = config.get("column")
        fields = config.get("fields") or []
        for f in (fields if isinstance(fields, list) else []):
            name = config.get("prefix", f"{src}_") + f if src else f
            result[name] = [src] if src and src in col_set else ["*"]
        return result

    # ── Unpivot ───────────────────────────────────────────────────────────────
    if step_type == "unpivot":
        id_cols = config.get("id_columns") or []
        key_col = config.get("key_column_name", "key")
        val_col = config.get("value_column_name", "value")
        val_cols = config.get("value_columns") or []
        result = {c: [c] for c in id_cols if c in col_set}
        result[key_col] = [c for c in val_cols if c in col_set] or ["*"]
        result[val_col] = [c for c in val_cols if c in col_set] or ["*"]
        return result

    # ── Pivot ─────────────────────────────────────────────────────────────────
    if step_type == "pivot":
        import re as _re
        group_cols = config.get("group_columns") or []
        pivot_col = config.get("pivot_column", "")
        value_col = config.get("value_column", "")
        pivot_values_raw = config.get("pivot_values", "") or ""
        prefix = config.get("output_prefix", "") or ""
        agg_func = config.get("agg_function", "SUM") or "SUM"
        result = {c: [c] for c in group_cols if c in col_set}
        for val in [v.strip() for v in pivot_values_raw.split(",") if v.strip()]:
            col_name = prefix + _re.sub(r"[^a-zA-Z0-9_]", "_", val).strip("_")
            src = value_col if value_col and value_col in col_set else (pivot_col if pivot_col in col_set else "*")
            result[col_name] = [src, pivot_col] if pivot_col in col_set else [src]
        return result

    # ── Group aggregate ───────────────────────────────────────────────────────
    if step_type == "group_aggregate":
        group_by = config.get("group_by") or []
        aggregations = config.get("aggregations") or []
        result = {c: [c] for c in group_by if c in col_set}
        for agg in aggregations:
            name = agg.get("output_name") or agg.get("alias")
            src = agg.get("column")
            if name:
                result[name] = [src] if src and src in col_set else ["*"]
        return result

    # ── Top N per group ───────────────────────────────────────────────────────
    if step_type == "top_n_per_group":
        return {c: [c] for c in input_cols}

    # ── Custom SQL — unknown derivation ───────────────────────────────────────
    if step_type == "custom_sql":
        # We can't reliably parse arbitrary SQL — mark all outputs as from all inputs
        return {c: ["*"] for c in input_cols}

    # ── Default: pass-through ─────────────────────────────────────────────────
    return {c: [c] for c in input_cols}


def compute_column_lineage(
    steps: list,
    initial_columns: list,
) -> list:
    """
    Compute column-level lineage through the pipeline.

    Returns a list of step lineage dicts:
    [
      {
        "step_index": 0,
        "step_type": "filter_rows",
        "step_label": "Filter premium",
        "input_columns": ["a", "b", "c"],
        "output_columns": ["a", "b", "c"],
        "column_map": {"a": ["a"], "b": ["b"], "c": ["c"]},
      },
      ...
    ]

    column_map values are lists of source columns. "*" means "depends on all inputs"
    (used for custom SQL or complex aggregates).
    """
    lineage_steps = []
    current_cols = list(initial_columns)

    # Build cumulative source tracking: for each current column, which
    # ORIGINAL source columns does it ultimately derive from?
    # Starts as identity: each col derives from itself.
    cumulative: dict = {c: [c] for c in current_cols}

    for i, step in enumerate(steps):
        step_type = step.transform_type if hasattr(step, "transform_type") else step.get("transform_type", "")
        step_label = (
            (step.label if hasattr(step, "label") else step.get("label")) or
            step_type.replace("_", " ").title()
        )
        config = step.config if hasattr(step, "config") else step.get("config", {})

        # Get the step's own column map (input → output relative to THIS step)
        step_col_map = _column_map_for_step(step_type, config, current_cols)
        output_cols = list(step_col_map.keys())

        # Resolve step_col_map through cumulative to get source-level derivation
        resolved_map: dict = {}
        for out_col, step_sources in step_col_map.items():
            if step_sources == ["*"]:
                # Derives from all current inputs (aggregate / custom SQL)
                all_srcs: list = []
                for sc in current_cols:
                    all_srcs.extend(cumulative.get(sc, [sc]))
                resolved_map[out_col] = list(dict.fromkeys(all_srcs))
            else:
                # Resolve through cumulative chain
                resolved: list = []
                for sc in step_sources:
                    resolved.extend(cumulative.get(sc, [sc]))
                resolved_map[out_col] = list(dict.fromkeys(resolved))

        lineage_steps.append({
            "step_index": i,
            "step_type": step_type,
            "step_label": step_label,
            "input_columns": list(current_cols),
            "output_columns": output_cols,
            "column_map": {k: v for k, v in resolved_map.items()},
        })

        current_cols = output_cols
        cumulative = resolved_map

    return lineage_steps


def compile_pipeline(
    source_table: str,
    steps: list,
    initial_columns: Optional[list] = None,
    limit: Optional[int] = None,
    param_values: Optional[dict] = None,
    parameters: Optional[list] = None,
) -> str:
    """
    Compile a pipeline into a CTE-based SQL query.

    When initial_columns is provided, schema is threaded through every step so
    that transforms generate explicit column lists instead of SELECT * EXCEPT,
    which is not supported in Dremio.

    Output format:
        WITH
          _src AS (SELECT * FROM source_table),
          _s0   AS (... FROM _src),
          ...
        SELECT * FROM _sN
        [LIMIT limit]
    """
    _param_values = param_values or {}
    _parameters = parameters or []

    ctes = [f"_src AS (SELECT * FROM {source_table})"]

    prev_alias = "_src"
    current_cols = list(initial_columns) if initial_columns else None

    for i, step in enumerate(steps):
        alias = f"_s{i}"
        # Substitute parameters in config before codegen
        effective_config = _substitute_params(step.config, _parameters, _param_values)
        subst_step = TransformStep(
            id=step.id,
            transform_type=step.transform_type,
            config=effective_config,
            label=step.label,
        )
        step_sql, cols_override = generate_step_sql(subst_step, prev_alias, current_cols)
        ctes.append(f"{alias} AS ({step_sql})")
        prev_alias = alias
        if cols_override is not None:
            current_cols = cols_override

    cte_block = ",\n  ".join(ctes)
    query = f"WITH\n  {cte_block}\nSELECT * FROM {prev_alias}"

    if limit is not None:
        query += f"\nLIMIT {limit}"

    return query


def compile_execute(
    source_table: str,
    steps: list,
    output_table: str,
    mode: str,
    initial_columns: Optional[list] = None,
    param_values: Optional[dict] = None,
    parameters: Optional[list] = None,
) -> str:
    """
    Compile the pipeline into an execution statement.
    mode: 'ctas' | 'insert' | 'view'
    """
    inner_sql = compile_pipeline(
        source_table, steps,
        initial_columns=initial_columns,
        param_values=param_values,
        parameters=parameters,
    )

    if mode == "ctas":
        return f"CREATE TABLE {output_table} AS\n{inner_sql}"
    elif mode == "insert":
        return f"INSERT INTO {output_table}\n{inner_sql}"
    elif mode == "view":
        return f"CREATE OR REPLACE VIEW {output_table} AS\n{inner_sql}"
    else:
        raise ValueError(f"Unknown execute mode: {mode!r}")


def compile_incremental(
    source_table: str,
    steps: list,
    output_table: str,
    strategy: str,
    key_column: str,
    initial_columns: Optional[list] = None,
    param_values: Optional[dict] = None,
    parameters: Optional[list] = None,
) -> dict:
    """
    Compile an incremental pipeline.

    Returns a dict with keys:
      - 'check_sql': SQL to detect whether the output table exists (SELECT 1 FROM ... LIMIT 1)
      - 'ctas_sql': full CTAS for first run (table doesn't exist yet)
      - 'incremental_sql': MERGE INTO or INSERT WHERE for subsequent runs
      - 'strategy': 'merge' or 'append'

    strategy='merge':  MERGE INTO {output} USING ({select}) ON key=key
                       WHEN MATCHED -> UPDATE, WHEN NOT MATCHED -> INSERT
                       Requires an Iceberg table in Dremio.

    strategy='append': INSERT INTO {output}
                       SELECT * FROM ({select}) WHERE {key} > (SELECT COALESCE(MAX({key}), ...) FROM {output})
    """
    inner_sql = compile_pipeline(
        source_table, steps,
        initial_columns=initial_columns,
        param_values=param_values,
        parameters=parameters,
    )

    ctas_sql = f"CREATE TABLE {output_table} AS\n{inner_sql}"
    check_sql = f"SELECT 1 FROM {output_table} LIMIT 1"

    if strategy == "merge":
        cols = initial_columns or []
        if cols:
            set_clause = ",\n    ".join(
                f"t.{c} = s.{c}" for c in cols if c != key_column
            )
            insert_cols = ", ".join(cols)
            insert_vals = ", ".join(f"s.{c}" for c in cols)
            incremental_sql = (
                f"MERGE INTO {output_table} AS t\n"
                f"USING (\n{inner_sql}\n) AS s\n"
                f"ON t.{key_column} = s.{key_column}\n"
                f"WHEN MATCHED THEN UPDATE SET\n    {set_clause}\n"
                f"WHEN NOT MATCHED THEN INSERT ({insert_cols})\n"
                f"  VALUES ({insert_vals})"
            )
        else:
            # No column info — simplified form, Dremio may reject but best effort
            incremental_sql = (
                f"MERGE INTO {output_table} AS t\n"
                f"USING (\n{inner_sql}\n) AS s\n"
                f"ON t.{key_column} = s.{key_column}\n"
                f"WHEN MATCHED THEN UPDATE SET *\n"
                f"WHEN NOT MATCHED THEN INSERT *"
            )
    elif strategy == "append":
        incremental_sql = (
            f"INSERT INTO {output_table}\n"
            f"SELECT * FROM (\n{inner_sql}\n) AS _incremental_src\n"
            f"WHERE {key_column} > (\n"
            f"  SELECT COALESCE(MAX({key_column}), TIMESTAMP '1970-01-01 00:00:00')\n"
            f"  FROM {output_table}\n"
            f")"
        )
    elif strategy == "microbatch":
        # Template SQL — {batch_start} and {batch_end} are filled in by the execute route
        # for each time window batch.
        incremental_sql = (
            f"INSERT INTO {output_table}\n"
            f"SELECT * FROM (\n{inner_sql}\n) AS _batch_src\n"
            f"WHERE {key_column} >= TIMESTAMP '{{batch_start}}'\n"
            f"  AND {key_column} < TIMESTAMP '{{batch_end}}'"
        )
    else:
        raise ValueError(f"Unknown incremental strategy: {strategy!r}")

    return {
        "check_sql": check_sql,
        "ctas_sql": ctas_sql,
        "incremental_sql": incremental_sql,
        "strategy": strategy,
    }


def compile_scd2(
    source_table: str,
    steps: list,
    output_table: str,
    key_column: str,
    tracked_columns: Optional[list] = None,
    effective_from_col: str = "effective_from",
    effective_to_col: str = "effective_to",
    is_current_col: str = "is_current",
    initial_columns: Optional[list] = None,
    param_values: Optional[dict] = None,
    parameters: Optional[list] = None,
) -> dict:
    """
    Compile a Slowly Changing Dimension Type 2 pipeline.

    First run  → CTAS with three extra columns appended:
                   effective_from (TIMESTAMP), effective_to (TIMESTAMP NULL), is_current (BOOLEAN)
    Subsequent → Two SQL steps:
                   1. MERGE INTO to close changed records (effective_to = now, is_current = FALSE)
                   2. INSERT new/changed records with effective_from = now, is_current = TRUE

    Requires an Iceberg table (MERGE INTO support).

    Returns dict:
      check_sql   — SELECT to detect if output table exists
      ctas_sql    — first-run CREATE TABLE AS SELECT
      close_sql   — MERGE INTO to expire changed/deleted current rows
      insert_sql  — INSERT new version records for new/changed rows
    """
    inner_sql = compile_pipeline(
        source_table, steps,
        initial_columns=initial_columns,
        param_values=param_values,
        parameters=parameters,
    )

    check_sql = f"SELECT 1 FROM {output_table} LIMIT 1"

    # First run: CTAS with SCD2 meta columns added
    ctas_sql = (
        f"CREATE TABLE {output_table} AS\n"
        f"SELECT _scd2.*,\n"
        f"  CURRENT_TIMESTAMP AS {effective_from_col},\n"
        f"  CAST(NULL AS TIMESTAMP) AS {effective_to_col},\n"
        f"  CAST(TRUE AS BOOLEAN) AS {is_current_col}\n"
        f"FROM (\n{inner_sql}\n) AS _scd2"
    )

    # Determine which columns to track for changes
    all_cols = initial_columns or []
    meta_cols = {effective_from_col, effective_to_col, is_current_col, key_column}
    if tracked_columns:
        track_cols = [c for c in tracked_columns if c not in meta_cols]
    elif all_cols:
        track_cols = [c for c in all_cols if c not in meta_cols]
    else:
        track_cols = []  # no schema info — track everything via "always changed" fallback

    if track_cols:
        # A record has changed if any tracked column differs
        change_cond = " OR ".join(f"t.{c} IS DISTINCT FROM s.{c}" for c in track_cols)
        same_cond = " AND ".join(f"t.{c} IS NOT DISTINCT FROM s.{c}" for c in track_cols)
    else:
        # No column list: always treat every matching key as potentially changed
        change_cond = "TRUE"
        same_cond = "FALSE"  # will insert every row from new data

    # Step 1: Close current records that have changed
    close_sql = (
        f"MERGE INTO {output_table} t\n"
        f"USING (\n"
        f"  SELECT s.{key_column}\n"
        f"  FROM (\n{inner_sql}\n) s\n"
        f"  JOIN {output_table} t2\n"
        f"    ON t2.{key_column} = s.{key_column}\n"
        f"   AND t2.{is_current_col} = TRUE\n"
        f"  WHERE {change_cond}\n"
        f") changed\n"
        f"ON t.{key_column} = changed.{key_column} AND t.{is_current_col} = TRUE\n"
        f"WHEN MATCHED THEN UPDATE SET\n"
        f"  {effective_to_col} = CURRENT_TIMESTAMP,\n"
        f"  {is_current_col} = FALSE"
    )

    # Step 2: Insert new and changed records (rows not already current and unchanged)
    insert_sql = (
        f"INSERT INTO {output_table}\n"
        f"SELECT s.*,\n"
        f"  CURRENT_TIMESTAMP AS {effective_from_col},\n"
        f"  CAST(NULL AS TIMESTAMP) AS {effective_to_col},\n"
        f"  CAST(TRUE AS BOOLEAN) AS {is_current_col}\n"
        f"FROM (\n{inner_sql}\n) s\n"
        f"WHERE NOT EXISTS (\n"
        f"  SELECT 1 FROM {output_table} t\n"
        f"  WHERE t.{key_column} = s.{key_column}\n"
        f"    AND t.{is_current_col} = TRUE\n"
        f"    AND ({same_cond})\n"
        f")"
    )

    return {
        "check_sql": check_sql,
        "ctas_sql": ctas_sql,
        "close_sql": close_sql,
        "insert_sql": insert_sql,
        "strategy": "scd2",
    }
