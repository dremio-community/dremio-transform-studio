from __future__ import annotations
import json
from models import TransformType, TransformParam
from transforms.utils import subq_filter_select


# ── Transform Definitions ────────────────────────────────────────────────────

GROUP_AGGREGATE = TransformType(
    id="group_aggregate",
    name="Group & Aggregate",
    category="aggregate",
    description="Group rows and compute aggregations (SUM, COUNT, AVG, MIN, MAX, COUNT DISTINCT).",
    icon="📊",
    params=[
        TransformParam(name="group_by", type="columns", label="Group by columns"),
        TransformParam(
            name="aggregations",
            type="text",
            label='Aggregations (JSON: [{"column":"col","function":"SUM","alias":"total"}])',
            placeholder='[{"column":"revenue","function":"SUM","alias":"total_revenue"}]',
        ),
    ],
)

TOP_N_PER_GROUP = TransformType(
    id="top_n_per_group",
    name="Top N Per Group",
    category="aggregate",
    description="Keep the top N rows within each group, ordered by a ranking column.",
    icon="🏆",
    params=[
        TransformParam(name="group_by", type="column", label="Partition / group column"),
        TransformParam(name="order_by", type="column", label="Rank by this column"),
        TransformParam(name="n", type="number", label="N (rows to keep per group)", default=10),
        TransformParam(
            name="direction",
            type="select",
            label="Direction",
            options=["desc", "asc"],
            default="desc",
        ),
    ],
)

DEDUPE_KEEP_LATEST = TransformType(
    id="dedupe_keep_latest",
    name="Deduplicate (Keep Latest)",
    category="aggregate",
    description="Remove duplicate rows by key columns, keeping the row with the latest timestamp.",
    icon="⏰",
    params=[
        TransformParam(name="key_columns", type="columns", label="Unique key columns"),
        TransformParam(name="timestamp_column", type="column", label="Timestamp column (determines latest)"),
    ],
)

ROLLING_WINDOW = TransformType(
    id="rolling_window",
    name="Rolling Window",
    category="aggregate",
    description="Compute a rolling/moving aggregation (SUM, AVG, MIN, MAX) over a sliding window of rows.",
    icon="📉",
    params=[
        TransformParam(name="column", type="column", label="Column to aggregate"),
        TransformParam(
            name="function",
            type="select",
            label="Aggregation function",
            options=["AVG", "SUM", "MIN", "MAX", "COUNT"],
            default="AVG",
        ),
        TransformParam(name="window_size", type="number", label="Window size (rows)", default=7),
        TransformParam(name="order_by", type="column", label="Order by column"),
        TransformParam(
            name="partition_by",
            type="column",
            label="Partition by (optional)",
            required=False,
        ),
        TransformParam(name="output_name", type="text", label="Output column name", placeholder="e.g. rolling_avg_7d"),
    ],
)

SAMPLE_ROWS = TransformType(
    id="sample_rows",
    name="Sample Rows",
    category="aggregate",
    description="Randomly sample N rows from the dataset.",
    icon="🎲",
    params=[
        TransformParam(name="n", type="number", label="Number of rows to sample", default=1000),
        TransformParam(
            name="seed",
            type="number",
            label="Random seed (optional, for reproducibility)",
            required=False,
            default=42,
        ),
    ],
)

SCD_TYPE_1 = TransformType(
    id="scd_type_1",
    name="SCD Type 1 (Keep Latest)",
    category="aggregate",
    description="Slowly Changing Dimension Type 1 — deduplicate by business key, keeping only the most recent record. Overwrites history.",
    icon="🔄",
    params=[
        TransformParam(name="key_columns", type="columns", label="Business key columns (uniquely identify a record)"),
        TransformParam(name="timestamp_column", type="column", label="Timestamp / updated-at column (determines latest)"),
        TransformParam(
            name="include_metadata",
            type="boolean",
            label="Add _scd_updated_at metadata column",
            required=False,
            default=False,
        ),
    ],
)

ALL_TRANSFORMS = [
    GROUP_AGGREGATE,
    TOP_N_PER_GROUP,
    DEDUPE_KEEP_LATEST,
    ROLLING_WINDOW,
    SAMPLE_ROWS,
    SCD_TYPE_1,
]


# ── Codegen Functions ─────────────────────────────────────────────────────────

def codegen_group_aggregate(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    group_by_cols = config.get("group_by", [])
    aggregations_raw = config.get("aggregations", "[]")

    try:
        aggregations = json.loads(aggregations_raw) if isinstance(aggregations_raw, str) else aggregations_raw
    except (json.JSONDecodeError, TypeError):
        aggregations = []

    if not group_by_cols and not aggregations:
        return f"SELECT * FROM {input_alias}", None

    select_parts = list(group_by_cols)
    fn_map = {
        "SUM": lambda col: f"SUM({col})",
        "COUNT": lambda col: f"COUNT({col})",
        "AVG": lambda col: f"AVG({col})",
        "MIN": lambda col: f"MIN({col})",
        "MAX": lambda col: f"MAX({col})",
        "COUNT_DISTINCT": lambda col: f"COUNT(DISTINCT {col})",
    }

    agg_aliases = []
    for agg in aggregations:
        col = agg.get("column", "")
        fn = agg.get("function", "SUM").upper()
        alias = agg.get("alias", f"{fn.lower()}_{col}")
        fn_builder = fn_map.get(fn, lambda c: f"SUM({c})")
        select_parts.append(f"{fn_builder(col)} AS {alias}")
        agg_aliases.append(alias)

    select_clause = ", ".join(select_parts)
    group_clause = ", ".join(group_by_cols) if group_by_cols else "1"
    sql = f"SELECT {select_clause} FROM {input_alias} GROUP BY {group_clause}"
    new_cols = list(group_by_cols) + agg_aliases
    return sql, new_cols


def codegen_top_n_per_group(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    group_by = config.get("group_by", "")
    order_by = config.get("order_by", "")
    n = int(config.get("n", 10))
    direction = config.get("direction", "desc").upper()

    if not group_by or not order_by:
        return f"SELECT * FROM {input_alias}", None

    window_expr = f"ROW_NUMBER() OVER (PARTITION BY {group_by} ORDER BY {order_by} {direction})"
    if columns:
        sql = subq_filter_select(columns, input_alias, window_expr, "_rank", f"_t._rank <= {n}")
    else:
        sql = (
            f"SELECT * FROM ("
            f"SELECT *, {window_expr} AS _rank FROM {input_alias}"
            f") _t WHERE _t._rank <= {n}"
        )
    return sql, None


def codegen_dedupe_keep_latest(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    key_cols = config.get("key_columns", [])
    ts_col = config.get("timestamp_column", "")

    if not key_cols or not ts_col:
        return f"SELECT * FROM {input_alias}", None

    partition_cols = ", ".join(key_cols)
    window_expr = f"ROW_NUMBER() OVER (PARTITION BY {partition_cols} ORDER BY {ts_col} DESC)"
    if columns:
        sql = subq_filter_select(columns, input_alias, window_expr, "_rn", "_t._rn = 1")
    else:
        sql = (
            f"SELECT * FROM ("
            f"SELECT *, {window_expr} AS _rn FROM {input_alias}"
            f") _t WHERE _t._rn = 1"
        )
    return sql, None


def codegen_rolling_window(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    function = config.get("function", "AVG").upper()
    window_size = int(config.get("window_size", 7))
    order_by = config.get("order_by", "")
    partition_by = config.get("partition_by", "")
    output_name = config.get("output_name", "") or f"rolling_{function.lower()}_{window_size}"

    if not col or not order_by:
        return f"SELECT * FROM {input_alias}", None

    preceding = window_size - 1
    frame = f"ROWS BETWEEN {preceding} PRECEDING AND CURRENT ROW"
    over_parts = []
    if partition_by:
        over_parts.append(f"PARTITION BY {partition_by}")
    over_parts.append(f"ORDER BY {order_by}")
    over_parts.append(frame)
    over_clause = " ".join(over_parts)

    expr = f"{function}({col}) OVER ({over_clause})"
    sql = f"SELECT *, {expr} AS {output_name} FROM {input_alias}"
    new_cols = list(columns) + [output_name] if columns else None
    return sql, new_cols


def codegen_sample_rows(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    n = int(config.get("n", 1000))
    seed = config.get("seed", 42)

    col_list = ", ".join(columns) if columns else "*"
    # Dremio supports TABLESAMPLE — use ORDER BY RAND() for deterministic seed
    sql = f"SELECT {col_list} FROM {input_alias} ORDER BY RAND() LIMIT {n}"
    return sql, None


def codegen_scd_type_1(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    key_cols = config.get("key_columns", [])
    ts_col = config.get("timestamp_column", "")
    include_metadata = config.get("include_metadata", False)

    if not key_cols or not ts_col:
        return f"SELECT * FROM {input_alias}", None

    partition_cols = ", ".join(key_cols)
    window_expr = f"ROW_NUMBER() OVER (PARTITION BY {partition_cols} ORDER BY {ts_col} DESC)"

    if columns:
        col_list = ", ".join(columns)
        if include_metadata:
            sql = (
                f"SELECT {col_list}, {ts_col} AS _scd_updated_at "
                f"FROM (SELECT *, {window_expr} AS _rn FROM {input_alias}) _t "
                f"WHERE _t._rn = 1"
            )
            new_cols = list(columns) + ["_scd_updated_at"]
        else:
            sql = (
                f"SELECT {col_list} "
                f"FROM (SELECT *, {window_expr} AS _rn FROM {input_alias}) _t "
                f"WHERE _t._rn = 1"
            )
            new_cols = None
    else:
        metadata_col = f", {ts_col} AS _scd_updated_at" if include_metadata else ""
        sql = (
            f"SELECT *{metadata_col} "
            f"FROM (SELECT *, {window_expr} AS _rn FROM {input_alias}) _t "
            f"WHERE _t._rn = 1"
        )
        new_cols = None

    return sql, new_cols


# ── Dispatch Table ────────────────────────────────────────────────────────────

CODEGEN_MAP: dict = {
    "group_aggregate": codegen_group_aggregate,
    "top_n_per_group": codegen_top_n_per_group,
    "dedupe_keep_latest": codegen_dedupe_keep_latest,
    "rolling_window": codegen_rolling_window,
    "sample_rows": codegen_sample_rows,
    "scd_type_1": codegen_scd_type_1,
}
