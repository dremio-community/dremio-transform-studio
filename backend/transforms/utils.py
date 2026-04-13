"""
Shared SQL helpers for schema-aware codegen.
All helpers take an explicit column list and produce SQL without SELECT * EXCEPT,
which is not supported in Dremio.
"""
from __future__ import annotations


def replace_select(cols: list[str], replacements: dict[str, str], input_alias: str) -> str:
    """
    Build: SELECT col1, expr AS col2, col3, ...
    replacements: {col_name: sql_expression_without_alias}
    Columns not in replacements are passed through unchanged.
    """
    parts = [f"{replacements[c]} AS {c}" if c in replacements else c for c in cols]
    return f"SELECT {', '.join(parts)} FROM {input_alias}"


def drop_select(cols: list[str], to_drop: set[str], input_alias: str) -> str:
    """SELECT all columns except those in to_drop."""
    kept = [c for c in cols if c not in to_drop]
    col_list = ", ".join(kept) if kept else "1"
    return f"SELECT {col_list} FROM {input_alias}"


def subq_filter_select(
    cols: list[str],
    input_alias: str,
    window_expr: str,
    window_alias: str,
    condition: str,
) -> str:
    """
    SELECT explicit_cols FROM (SELECT *, window_expr AS window_alias FROM input) _t WHERE condition
    Used for ROW_NUMBER() / RANK() patterns where _rn/_rank must not appear in output.
    """
    col_list = ", ".join(cols) if cols else "*"
    return (
        f"SELECT {col_list} FROM ("
        f"SELECT *, {window_expr} AS {window_alias} FROM {input_alias}"
        f") _t WHERE {condition}"
    )
