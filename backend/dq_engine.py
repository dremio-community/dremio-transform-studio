"""
Data Quality Engine — generates and executes SQL-based DQ checks against Dremio.
Each rule produces a pass_rate (0–100), a status, and a detail dict.
"""
from __future__ import annotations
import json
from datetime import datetime, timezone
from typing import Optional, Any

# ── Rule catalog ──────────────────────────────────────────────────────────────
RULE_CATALOG = [
    {
        "id": "null_check",
        "name": "Null Rate",
        "category": "Completeness",
        "description": "% of rows where the column is NULL. Fails if above threshold.",
        "config_schema": [
            {"key": "column", "label": "Column", "type": "column", "required": True},
            {"key": "max_null_pct", "label": "Max Null %", "type": "number", "default": 5},
        ],
    },
    {
        "id": "not_null_strict",
        "name": "Not Null (Strict)",
        "category": "Completeness",
        "description": "Zero tolerance — fails if ANY row is null in the column.",
        "config_schema": [
            {"key": "column", "label": "Column", "type": "column", "required": True},
        ],
    },
    {
        "id": "row_count",
        "name": "Row Count",
        "category": "Completeness",
        "description": "Total rows must fall within min/max range.",
        "config_schema": [
            {"key": "min_rows", "label": "Min Rows", "type": "number", "default": 1},
            {"key": "max_rows", "label": "Max Rows (0 = no limit)", "type": "number", "default": 0},
        ],
    },
    {
        "id": "uniqueness",
        "name": "Column Uniqueness",
        "category": "Uniqueness",
        "description": "% of distinct values. Fails if below threshold.",
        "config_schema": [
            {"key": "column", "label": "Column", "type": "column", "required": True},
            {"key": "min_unique_pct", "label": "Min Unique %", "type": "number", "default": 95},
        ],
    },
    {
        "id": "duplicate_rows",
        "name": "Duplicate Rows",
        "category": "Uniqueness",
        "description": "% of duplicate rows based on key columns. Fails if above threshold.",
        "config_schema": [
            {"key": "key_columns", "label": "Key Columns (comma-separated)", "type": "string", "required": True},
            {"key": "max_dup_pct", "label": "Max Duplicate %", "type": "number", "default": 0},
        ],
    },
    {
        "id": "accepted_values",
        "name": "Accepted Values",
        "category": "Validity",
        "description": "% of rows with values outside the accepted list. Fails if above 0.",
        "config_schema": [
            {"key": "column", "label": "Column", "type": "column", "required": True},
            {"key": "values", "label": "Accepted Values (comma-separated)", "type": "string", "required": True},
        ],
    },
    {
        "id": "numeric_range",
        "name": "Numeric Range",
        "category": "Validity",
        "description": "% of rows where the numeric column is outside min/max bounds.",
        "config_schema": [
            {"key": "column", "label": "Column", "type": "column", "required": True},
            {"key": "min_value", "label": "Min Value", "type": "number", "required": True},
            {"key": "max_value", "label": "Max Value", "type": "number", "required": True},
        ],
    },
    {
        "id": "regex_match",
        "name": "Regex Pattern",
        "category": "Validity",
        "description": "% of rows that do NOT match the regex. Fails if above 0.",
        "config_schema": [
            {"key": "column", "label": "Column", "type": "column", "required": True},
            {"key": "pattern", "label": "Regex Pattern", "type": "string", "required": True},
            {"key": "label", "label": "Pattern Label (e.g. valid email)", "type": "string", "default": "pattern"},
        ],
    },
    {
        "id": "string_length",
        "name": "String Length",
        "category": "Validity",
        "description": "% of rows where string length is outside min/max bounds.",
        "config_schema": [
            {"key": "column", "label": "Column", "type": "column", "required": True},
            {"key": "min_length", "label": "Min Length", "type": "number", "default": 1},
            {"key": "max_length", "label": "Max Length", "type": "number", "default": 255},
        ],
    },
    {
        "id": "referential_integrity",
        "name": "Referential Integrity",
        "category": "Consistency",
        "description": "% of rows where the FK value does NOT exist in the reference table.",
        "config_schema": [
            {"key": "column", "label": "Column", "type": "column", "required": True},
            {"key": "ref_table", "label": "Reference Table (fully qualified)", "type": "string", "required": True},
            {"key": "ref_column", "label": "Reference Column", "type": "string", "required": True},
        ],
    },
    {
        "id": "freshness",
        "name": "Data Freshness",
        "category": "Timeliness",
        "description": "Most recent timestamp must be within the expected age window.",
        "config_schema": [
            {"key": "column", "label": "Timestamp Column", "type": "column", "required": True},
            {"key": "max_age_hours", "label": "Max Age (hours)", "type": "number", "default": 24},
        ],
    },
    {
        "id": "mean_in_range",
        "name": "Mean Value",
        "category": "Statistical",
        "description": "Column mean must fall within the expected range.",
        "config_schema": [
            {"key": "column", "label": "Numeric Column", "type": "column", "required": True},
            {"key": "min_mean", "label": "Min Expected Mean", "type": "number", "required": True},
            {"key": "max_mean", "label": "Max Expected Mean", "type": "number", "required": True},
        ],
    },
    {
        "id": "schema_snapshot",
        "name": "Schema Snapshot",
        "category": "Schema",
        "description": "Detects column additions, removals, or type changes vs. a saved baseline. Baseline is captured on the first scan.",
        "config_schema": [
            {"key": "baseline_json", "label": "Baseline (auto-captured on first scan)", "type": "readonly"},
        ],
    },
    {
        "id": "custom_sql",
        "name": "Custom SQL Check",
        "category": "Custom",
        "description": "SQL that returns a single row with column 'pass_rate' (0–100). Use {table} as placeholder.",
        "config_schema": [
            {"key": "sql", "label": "SQL Query", "type": "sql", "required": True},
        ],
    },
]

RULE_MAP = {r["id"]: r for r in RULE_CATALOG}


# ── Table name quoting ────────────────────────────────────────────────────────

def _quote_table(table: str) -> str:
    """
    Wrap each dot-separated component of a Dremio table path in double quotes.
    Handles: @mark.my_table → "@mark"."my_table"
    Already-quoted parts (e.g. "@mark"."t") are left untouched.
    """
    parts = table.split(".")
    quoted = []
    for part in parts:
        part = part.strip()
        if part.startswith('"') and part.endswith('"'):
            quoted.append(part)
        else:
            # Escape any existing double quotes inside the part name
            quoted.append('"' + part.replace('"', '""') + '"')
    return ".".join(quoted)


# ── SQL generators ────────────────────────────────────────────────────────────

def _generate_sql(table: str, rule_id: str, config: dict) -> Optional[str]:
    """Return SQL for the given rule. Returns None for rules handled outside SQL (schema_snapshot)."""
    # Properly quote the table name so @-prefixed home spaces work in Dremio SQL
    table = _quote_table(table)
    if rule_id == "null_check":
        col = config["column"]
        return (
            f"SELECT CASE WHEN COUNT(*) = 0 THEN 0.0 "
            f"ELSE (COUNT(*) - COUNT({col})) * 100.0 / COUNT(*) END AS null_pct, "
            f"COUNT(*) AS total_rows FROM {table}"
        )

    if rule_id == "not_null_strict":
        col = config["column"]
        return f"SELECT SUM(CASE WHEN {col} IS NULL THEN 1 ELSE 0 END) AS null_count, COUNT(*) AS total_rows FROM {table}"

    if rule_id == "row_count":
        return f"SELECT COUNT(*) AS row_count FROM {table}"

    if rule_id == "uniqueness":
        col = config["column"]
        return (
            f"SELECT CASE WHEN COUNT(*) = 0 THEN 100.0 "
            f"ELSE COUNT(DISTINCT {col}) * 100.0 / COUNT(*) END AS unique_pct, "
            f"COUNT(*) AS total_rows FROM {table}"
        )

    if rule_id == "duplicate_rows":
        cols = [c.strip() for c in config.get("key_columns", "").split(",") if c.strip()]
        concat_expr = " || '|' || ".join(f"COALESCE(CAST({c} AS VARCHAR), '')" for c in cols)
        return (
            f"SELECT CASE WHEN COUNT(*) = 0 THEN 0.0 "
            f"ELSE (COUNT(*) - COUNT(DISTINCT {concat_expr})) * 100.0 / COUNT(*) END AS dup_pct, "
            f"COUNT(*) AS total_rows FROM {table}"
        )

    if rule_id == "accepted_values":
        col = config["column"]
        vals = [v.strip() for v in config.get("values", "").split(",") if v.strip()]
        in_list = ", ".join(f"'{v}'" for v in vals)
        return (
            f"SELECT CASE WHEN COUNT(*) = 0 THEN 0.0 "
            f"ELSE SUM(CASE WHEN {col} IS NOT NULL AND CAST({col} AS VARCHAR) NOT IN ({in_list}) "
            f"THEN 1 ELSE 0 END) * 100.0 / COUNT(*) END AS fail_pct, "
            f"COUNT(*) AS total_rows FROM {table}"
        )

    if rule_id == "numeric_range":
        col = config["column"]
        min_v = config.get("min_value", 0)
        max_v = config.get("max_value", 100)
        return (
            f"SELECT CASE WHEN COUNT(*) = 0 THEN 0.0 "
            f"ELSE SUM(CASE WHEN {col} IS NOT NULL AND "
            f"(CAST({col} AS DOUBLE) < {min_v} OR CAST({col} AS DOUBLE) > {max_v}) "
            f"THEN 1 ELSE 0 END) * 100.0 / COUNT(*) END AS fail_pct, "
            f"COUNT(*) AS total_rows FROM {table}"
        )

    if rule_id == "regex_match":
        col = config["column"]
        pattern = config.get("pattern", ".*").replace("'", "\\'")
        return (
            f"SELECT CASE WHEN COUNT(*) = 0 THEN 0.0 "
            f"ELSE SUM(CASE WHEN {col} IS NOT NULL AND "
            f"NOT REGEXP_LIKE(CAST({col} AS VARCHAR), '{pattern}') "
            f"THEN 1 ELSE 0 END) * 100.0 / COUNT(*) END AS fail_pct, "
            f"COUNT(*) AS total_rows FROM {table}"
        )

    if rule_id == "string_length":
        col = config["column"]
        min_l = config.get("min_length", 1)
        max_l = config.get("max_length", 255)
        return (
            f"SELECT CASE WHEN COUNT(*) = 0 THEN 0.0 "
            f"ELSE SUM(CASE WHEN {col} IS NOT NULL AND "
            f"(LENGTH(CAST({col} AS VARCHAR)) < {min_l} OR LENGTH(CAST({col} AS VARCHAR)) > {max_l}) "
            f"THEN 1 ELSE 0 END) * 100.0 / COUNT(*) END AS fail_pct, "
            f"COUNT(*) AS total_rows FROM {table}"
        )

    if rule_id == "referential_integrity":
        col = config["column"]
        ref_table = config["ref_table"]
        ref_col = config["ref_column"]
        return (
            f"SELECT CASE WHEN COUNT(*) = 0 THEN 0.0 "
            f"ELSE SUM(CASE WHEN {col} IS NOT NULL AND "
            f"{col} NOT IN (SELECT DISTINCT {ref_col} FROM {ref_table}) "
            f"THEN 1 ELSE 0 END) * 100.0 / COUNT(*) END AS fail_pct, "
            f"COUNT(*) AS total_rows FROM {table}"
        )

    if rule_id == "freshness":
        col = config["column"]
        return f"SELECT MAX({col}) AS last_ts, COUNT(*) AS total_rows FROM {table}"

    if rule_id == "mean_in_range":
        col = config["column"]
        return f"SELECT AVG(CAST({col} AS DOUBLE)) AS mean_val, COUNT(*) AS total_rows FROM {table}"

    if rule_id == "custom_sql":
        sql = config.get("sql", "").replace("{table}", table)
        return sql

    return None  # schema_snapshot handled separately


# ── Result interpreters ───────────────────────────────────────────────────────

def _interpret(rule_id: str, config: dict, row: dict) -> dict:
    """Turn raw SQL row into {pass_rate, status, detail, message}."""

    def _result(pass_rate: float, passed: bool, detail: dict, msg: str) -> dict:
        if passed:
            status = "passed"
        elif pass_rate >= 70:
            status = "warned"
        else:
            status = "failed"
        return {"pass_rate": round(pass_rate, 2), "status": status, "detail": detail, "message": msg}

    total = int(row.get("total_rows", 0) or 0)

    if rule_id == "null_check":
        null_pct = float(row.get("null_pct", 0) or 0)
        threshold = float(config.get("max_null_pct", 5))
        pr = max(0.0, 100.0 - null_pct)
        return _result(pr, null_pct <= threshold,
                       {"null_pct": round(null_pct, 2), "total_rows": total},
                       f"{round(null_pct, 2)}% nulls — threshold {threshold}%")

    if rule_id == "not_null_strict":
        null_count = int(row.get("null_count", 0) or 0)
        pr = 100.0 if null_count == 0 else 0.0
        return _result(pr, null_count == 0,
                       {"null_count": null_count, "total_rows": total},
                       f"{null_count} null values found")

    if rule_id == "row_count":
        count = int(row.get("row_count", 0) or 0)
        min_r = int(config.get("min_rows", 1))
        max_r = int(config.get("max_rows", 0))
        passed = count >= min_r and (max_r == 0 or count <= max_r)
        pr = 100.0 if passed else 0.0
        limit_str = f", max {max_r:,}" if max_r else ""
        return _result(pr, passed,
                       {"row_count": count},
                       f"{count:,} rows (expected: ≥{min_r:,}{limit_str})")

    if rule_id == "uniqueness":
        upct = float(row.get("unique_pct", 100) or 100)
        threshold = float(config.get("min_unique_pct", 95))
        return _result(upct, upct >= threshold,
                       {"unique_pct": round(upct, 2), "total_rows": total},
                       f"{round(upct, 2)}% unique — threshold ≥{threshold}%")

    if rule_id == "duplicate_rows":
        dup_pct = float(row.get("dup_pct", 0) or 0)
        threshold = float(config.get("max_dup_pct", 0))
        pr = max(0.0, 100.0 - dup_pct)
        return _result(pr, dup_pct <= threshold,
                       {"dup_pct": round(dup_pct, 2), "total_rows": total},
                       f"{round(dup_pct, 2)}% duplicate rows — threshold ≤{threshold}%")

    if rule_id in ("accepted_values", "numeric_range", "regex_match", "string_length", "referential_integrity"):
        fail_pct = float(row.get("fail_pct", 0) or 0)
        pr = max(0.0, 100.0 - fail_pct)
        labels = {
            "accepted_values": "invalid values",
            "numeric_range": "out-of-range values",
            "regex_match": f"non-matching {config.get('label', 'pattern')}",
            "string_length": "length violations",
            "referential_integrity": "orphaned FK values",
        }
        return _result(pr, fail_pct == 0,
                       {"fail_pct": round(fail_pct, 2), "total_rows": total},
                       f"{round(fail_pct, 2)}% {labels[rule_id]}")

    if rule_id == "freshness":
        raw = row.get("last_ts")
        max_age_hours = float(config.get("max_age_hours", 24))
        total_r = int(row.get("total_rows", 0) or 0)
        if raw is None:
            return {"pass_rate": 0, "status": "failed", "detail": {"age_hours": None, "total_rows": total_r},
                    "message": "Table is empty — no timestamp data"}
        try:
            if isinstance(raw, str):
                last_ts = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            else:
                last_ts = raw
            if getattr(last_ts, "tzinfo", None) is None:
                last_ts = last_ts.replace(tzinfo=timezone.utc)
            age_hours = (datetime.now(timezone.utc) - last_ts).total_seconds() / 3600
        except Exception as e:
            return {"pass_rate": 0, "status": "error", "detail": {}, "message": f"Could not parse timestamp: {e}"}
        pr = 100.0 if age_hours <= max_age_hours else max(0.0, 100.0 - ((age_hours - max_age_hours) / max_age_hours) * 100.0)
        return _result(pr, age_hours <= max_age_hours,
                       {"age_hours": round(age_hours, 1), "last_ts": str(raw), "total_rows": total_r},
                       f"Data is {round(age_hours, 1)}h old — threshold {max_age_hours}h")

    if rule_id == "mean_in_range":
        mean_val = float(row.get("mean_val", 0) or 0)
        min_m = float(config.get("min_mean", 0))
        max_m = float(config.get("max_mean", 100))
        passed = min_m <= mean_val <= max_m
        return _result(100.0 if passed else 0.0, passed,
                       {"mean": round(mean_val, 4), "total_rows": total},
                       f"Mean = {round(mean_val, 4)} (expected {min_m}–{max_m})")

    if rule_id == "custom_sql":
        pr = float(row.get("pass_rate", row.get("PASS_RATE", 0)) or 0)
        return _result(pr, pr >= 90,
                       {"pass_rate": round(pr, 2)},
                       f"Pass rate: {round(pr, 2)}%")

    return {"pass_rate": 0, "status": "error", "detail": {}, "message": f"Unknown rule: {rule_id}"}


# ── Schema snapshot helpers ───────────────────────────────────────────────────

async def _evaluate_schema_snapshot(table: str, config: dict, catalog_client) -> dict:
    """Compare current schema against stored baseline."""
    try:
        parts = table.rsplit(".", 1)
        ns = parts[0] if len(parts) == 2 else table
        tbl = parts[1] if len(parts) == 2 else table
        cols = await catalog_client.get_table_schema(ns, tbl)
        current = {c["name"]: c.get("type", "") for c in (cols or [])}
    except Exception as e:
        return {"pass_rate": 0, "status": "error", "detail": {}, "message": f"Schema fetch failed: {e}"}

    baseline_raw = config.get("baseline_json")
    if not baseline_raw:
        # First scan — capture baseline
        return {
            "pass_rate": 100.0,
            "status": "passed",
            "detail": {"baseline_captured": True, "columns": current},
            "message": f"Baseline captured: {len(current)} columns",
            "new_baseline": current,
        }

    try:
        baseline = json.loads(baseline_raw) if isinstance(baseline_raw, str) else baseline_raw
    except Exception:
        baseline = {}

    added = [c for c in current if c not in baseline]
    removed = [c for c in baseline if c not in current]
    changed = [c for c in current if c in baseline and current[c] != baseline[c]]

    issues = []
    if added:
        issues.append(f"Added: {', '.join(added)}")
    if removed:
        issues.append(f"Removed: {', '.join(removed)}")
    if changed:
        issues.append(f"Type changed: {', '.join(changed)}")

    passed = not (added or removed or changed)
    pr = 100.0 if passed else max(0.0, 100.0 - (len(added) + len(removed) + len(changed)) * 20)
    return {
        "pass_rate": pr,
        "status": "passed" if passed else "failed",
        "detail": {"added": added, "removed": removed, "type_changed": changed, "current_columns": current},
        "message": " | ".join(issues) if issues else f"Schema unchanged ({len(current)} columns)",
    }


# ── Main entry point ──────────────────────────────────────────────────────────

async def evaluate_rule(table: str, rule_id: str, config: dict,
                        dremio_client, catalog_client=None) -> dict:
    """Run one DQ rule. Returns {rule_id, rule_name, pass_rate, status, detail, message}."""
    rule_meta = RULE_MAP.get(rule_id, {})
    base = {"rule_id": rule_id, "rule_name": rule_meta.get("name", rule_id),
            "category": rule_meta.get("category", "Custom")}

    if rule_id == "schema_snapshot":
        if catalog_client is None:
            result = {"pass_rate": 0, "status": "error", "detail": {}, "message": "catalog_client not available"}
        else:
            result = await _evaluate_schema_snapshot(table, config, catalog_client)
        return {**base, **result}

    sql = _generate_sql(table, rule_id, config)
    if not sql:
        return {**base, "pass_rate": 0, "status": "error", "detail": {}, "message": "No SQL generated"}

    try:
        rows = await dremio_client.run_query(sql)
        row = rows[0] if rows else {}
    except Exception as e:
        return {**base, "pass_rate": 0, "status": "error", "detail": {}, "message": f"Query error: {e}"}

    result = _interpret(rule_id, config, row)
    return {**base, **result}


async def run_scan(table: str, rules: list[dict],
                   dremio_client, catalog_client=None) -> dict:
    """
    Run all rules for a monitor. Returns:
      { overall_score, row_count, rule_results, status, error_message }
    """
    import time
    t0 = time.time()
    rule_results = []
    row_count = None

    for rule_cfg in rules:
        rule_id = rule_cfg.get("rule_id") or rule_cfg.get("id")
        if not rule_id:
            continue
        config = rule_cfg.get("config", {})
        try:
            result = await evaluate_rule(table, rule_id, config, dremio_client, catalog_client)
        except Exception as e:
            result = {"rule_id": rule_id, "rule_name": rule_id, "pass_rate": 0,
                      "status": "error", "detail": {}, "message": str(e)}
        rule_results.append(result)
        # Extract row_count from the first rule that provides it
        if row_count is None and "total_rows" in result.get("detail", {}):
            row_count = result["detail"]["total_rows"]
        elif row_count is None and result.get("detail", {}).get("row_count") is not None:
            row_count = result["detail"]["row_count"]

    if not rule_results:
        return {"overall_score": 100.0, "row_count": 0, "rule_results": [],
                "status": "passed", "error_message": None, "duration_ms": 0}

    # Weighted average — each rule has equal weight unless config specifies weight
    total_weight = sum(float(r.get("weight", 1)) for r in rules)
    if total_weight == 0:
        total_weight = len(rules)
    score = sum(
        res["pass_rate"] * float(rules[i].get("weight", 1) if i < len(rules) else 1)
        for i, res in enumerate(rule_results)
    ) / total_weight

    error_count = sum(1 for r in rule_results if r["status"] == "error")
    fail_count = sum(1 for r in rule_results if r["status"] == "failed")
    warn_count = sum(1 for r in rule_results if r["status"] == "warned")

    if error_count == len(rule_results):
        status = "error"
    elif fail_count > 0:
        status = "failed"
    elif warn_count > 0:
        status = "warned"
    else:
        status = "passed"

    duration_ms = int((time.time() - t0) * 1000)
    return {
        "overall_score": round(score, 1),
        "row_count": row_count,
        "rule_results": rule_results,
        "status": status,
        "error_message": None,
        "duration_ms": duration_ms,
    }
