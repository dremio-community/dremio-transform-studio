from __future__ import annotations
from models import TransformType, TransformParam
from transforms.utils import replace_select


# ── Transform Definitions ────────────────────────────────────────────────────

PARSE_DATE = TransformType(
    id="parse_date",
    name="Parse Date String",
    category="datetime",
    description="Convert a string column to a DATE or TIMESTAMP using a specified format.",
    icon="📅",
    params=[
        TransformParam(name="column", type="column", label="Source column"),
        TransformParam(
            name="format",
            type="text",
            label="Date format",
            placeholder="e.g. YYYY-MM-DD or MM/DD/YYYY HH:mm:ss",
        ),
        TransformParam(
            name="output_type",
            type="select",
            label="Output type",
            options=["DATE", "TIMESTAMP"],
            default="TIMESTAMP",
        ),
        TransformParam(
            name="output_name",
            type="text",
            label="Output column name (defaults to source column)",
            required=False,
            placeholder="Leave blank to replace source column",
        ),
    ],
)

EXTRACT_DATE_PART = TransformType(
    id="extract_date_part",
    name="Extract Date Part",
    category="datetime",
    description="Extract a component (year, month, day, etc.) from a date/timestamp column.",
    icon="🗓️",
    params=[
        TransformParam(name="column", type="column", label="Date column"),
        TransformParam(
            name="part",
            type="select",
            label="Date part",
            options=["year", "month", "day", "hour", "minute", "second", "quarter", "week", "dayofweek"],
            default="year",
        ),
        TransformParam(
            name="output_name",
            type="text",
            label="Output column name",
            required=False,
            placeholder="Defaults to col_part",
        ),
    ],
)

TRUNCATE_DATE = TransformType(
    id="truncate_date",
    name="Truncate to Period",
    category="datetime",
    description="Truncate a timestamp to the start of a time period (year, month, day, etc.).",
    icon="⏱️",
    params=[
        TransformParam(name="column", type="column", label="Date column"),
        TransformParam(
            name="period",
            type="select",
            label="Truncate to",
            options=["year", "quarter", "month", "week", "day", "hour"],
            default="month",
        ),
        TransformParam(
            name="output_name",
            type="text",
            label="Output column name",
            required=False,
            placeholder="Defaults to col_trunc",
        ),
    ],
)

DATE_DIFF = TransformType(
    id="date_diff",
    name="Date Difference",
    category="datetime",
    description="Calculate the difference between two date columns (or between a column and today).",
    icon="📏",
    params=[
        TransformParam(name="start_column", type="column", label="Start date column"),
        TransformParam(
            name="end_column",
            type="column",
            label="End date column (blank = use CURRENT_DATE)",
            required=False,
            placeholder="Leave blank to use today",
        ),
        TransformParam(
            name="unit",
            type="select",
            label="Difference unit",
            options=["day", "month", "year", "hour"],
            default="day",
        ),
        TransformParam(name="output_name", type="text", label="Output column name"),
    ],
)

DATE_ADD = TransformType(
    id="date_add",
    name="Add/Subtract Time",
    category="datetime",
    description="Add or subtract a fixed amount of time from a date/timestamp column.",
    icon="⏩",
    params=[
        TransformParam(name="column", type="column", label="Date column"),
        TransformParam(
            name="operation",
            type="select",
            label="Operation",
            options=["add", "subtract"],
            default="add",
        ),
        TransformParam(name="amount", type="number", label="Amount", default=1),
        TransformParam(
            name="unit",
            type="select",
            label="Unit",
            options=["day", "month", "year", "hour"],
            default="day",
        ),
        TransformParam(
            name="output_name",
            type="text",
            label="Output column name",
            required=False,
            placeholder="Defaults to source column",
        ),
    ],
)

ALL_TRANSFORMS = [
    PARSE_DATE,
    EXTRACT_DATE_PART,
    TRUNCATE_DATE,
    DATE_DIFF,
    DATE_ADD,
]


# ── Codegen Functions ─────────────────────────────────────────────────────────

def codegen_parse_date(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    fmt = config.get("format", "YYYY-MM-DD")
    output_type = config.get("output_type", "TIMESTAMP")
    output_name = config.get("output_name", "") or col

    if not col:
        return f"SELECT * FROM {input_alias}", None

    cast_expr = f"TO_DATE({col}, '{fmt}')" if output_type == "DATE" else f"TO_TIMESTAMP({col}, '{fmt}')"

    if output_name == col:
        # In-place replacement
        if columns:
            sql = replace_select(columns, {col: cast_expr}, input_alias)
        else:
            sql = f"SELECT * FROM {input_alias}"
        return sql, None
    else:
        # New column
        sql = f"SELECT *, {cast_expr} AS {output_name} FROM {input_alias}"
        new_cols = list(columns) + [output_name] if columns else None
        return sql, new_cols


def codegen_extract_date_part(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    part = config.get("part", "year")
    output_name = config.get("output_name", "") or f"{col}_{part}"

    if not col:
        return f"SELECT * FROM {input_alias}", None

    fn_map = {
        "year": f"YEAR({col})",
        "month": f"MONTH({col})",
        "day": f"DAY({col})",
        "hour": f"HOUR({col})",
        "minute": f"MINUTE({col})",
        "second": f"SECOND({col})",
        "quarter": f"QUARTER({col})",
        "week": f"WEEK({col})",
        "dayofweek": f"DAYOFWEEK({col})",
    }
    expr = fn_map.get(part, f"YEAR({col})")
    sql = f"SELECT *, {expr} AS {output_name} FROM {input_alias}"
    new_cols = list(columns) + [output_name] if columns else None
    return sql, new_cols


def codegen_truncate_date(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    period = config.get("period", "month")
    output_name = config.get("output_name", "") or f"{col}_trunc"

    if not col:
        return f"SELECT * FROM {input_alias}", None

    expr = f"DATE_TRUNC('{period}', {col})"
    sql = f"SELECT *, {expr} AS {output_name} FROM {input_alias}"
    new_cols = list(columns) + [output_name] if columns else None
    return sql, new_cols


def codegen_date_diff(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    start_col = config.get("start_column", "")
    end_col = config.get("end_column", "") or "CURRENT_DATE"
    unit = config.get("unit", "day")
    output_name = config.get("output_name", "date_diff")

    if not start_col:
        return f"SELECT * FROM {input_alias}", None

    expr = f"DATEDIFF({unit}, {start_col}, {end_col})"
    sql = f"SELECT *, {expr} AS {output_name} FROM {input_alias}"
    new_cols = list(columns) + [output_name] if columns else None
    return sql, new_cols


def codegen_date_add(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    operation = config.get("operation", "add")
    amount = int(config.get("amount", 1))
    unit = config.get("unit", "day")
    output_name = config.get("output_name", "") or col

    if not col:
        return f"SELECT * FROM {input_alias}", None

    if operation == "subtract":
        amount = -amount

    expr = f"DATEADD({unit}, {amount}, {col})"

    if output_name == col:
        if columns:
            sql = replace_select(columns, {col: expr}, input_alias)
        else:
            sql = f"SELECT * FROM {input_alias}"
        return sql, None
    else:
        sql = f"SELECT *, {expr} AS {output_name} FROM {input_alias}"
        new_cols = list(columns) + [output_name] if columns else None
        return sql, new_cols


# ── Dispatch Table ────────────────────────────────────────────────────────────

CODEGEN_MAP: dict = {
    "parse_date": codegen_parse_date,
    "extract_date_part": codegen_extract_date_part,
    "truncate_date": codegen_truncate_date,
    "date_diff": codegen_date_diff,
    "date_add": codegen_date_add,
}
