from __future__ import annotations
from models import TransformType, TransformParam
from transforms.utils import replace_select, subq_filter_select


# ── Transform Definitions ────────────────────────────────────────────────────

REMOVE_DUPLICATES = TransformType(
    id="remove_duplicates",
    name="Remove Duplicates",
    category="clean",
    description="Remove duplicate rows based on selected columns, keeping first or last occurrence.",
    icon="🗑️",
    params=[
        TransformParam(name="dedup_columns", type="columns", label="Columns to deduplicate on"),
        TransformParam(
            name="keep",
            type="select",
            label="Which to keep",
            options=["first", "last"],
            default="first",
        ),
        TransformParam(
            name="order_by",
            type="column",
            label="Order by column",
            required=False,
            placeholder="Optional — used to define first/last",
        ),
    ],
)

DROP_NULLS = TransformType(
    id="drop_nulls",
    name="Drop Null Rows",
    category="clean",
    description="Remove rows where any of the specified columns contain a null value.",
    icon="🚫",
    params=[
        TransformParam(name="columns", type="columns", label="Drop rows where any of these are null"),
    ],
)

FILL_NULL = TransformType(
    id="fill_null",
    name="Fill Null Values",
    category="clean",
    description="Replace null values in a column with a constant, the column mean, or the column mode.",
    icon="🔧",
    params=[
        TransformParam(name="column", type="column", label="Column"),
        TransformParam(
            name="strategy",
            type="select",
            label="Fill strategy",
            options=["constant", "mean", "mode"],
            default="constant",
        ),
        TransformParam(
            name="value",
            type="text",
            label="Fill value (for constant strategy)",
            required=False,
            placeholder="e.g. 0 or unknown",
        ),
    ],
)

TRIM_WHITESPACE = TransformType(
    id="trim_whitespace",
    name="Trim Whitespace",
    category="clean",
    description="Strip leading and trailing whitespace from string columns.",
    icon="✂️",
    params=[
        TransformParam(name="columns", type="columns", label="Columns to trim"),
    ],
)

STANDARDIZE_CASE = TransformType(
    id="standardize_case",
    name="Standardize Case",
    category="clean",
    description="Convert a string column to upper, lower, or title case.",
    icon="🔤",
    params=[
        TransformParam(name="column", type="column", label="Column"),
        TransformParam(
            name="case",
            type="select",
            label="Target case",
            options=["upper", "lower", "title"],
            default="lower",
        ),
    ],
)

CAST_TYPE = TransformType(
    id="cast_type",
    name="Cast Column Type",
    category="clean",
    description="Cast a column to a different data type, with optional null-on-error behavior.",
    icon="🔄",
    params=[
        TransformParam(name="column", type="column", label="Column"),
        TransformParam(
            name="target_type",
            type="select",
            label="Target type",
            options=["VARCHAR", "INTEGER", "BIGINT", "FLOAT", "DOUBLE", "DATE", "TIMESTAMP", "BOOLEAN"],
            default="VARCHAR",
        ),
        TransformParam(
            name="on_error",
            type="select",
            label="On cast error",
            options=["null", "fail"],
            default="null",
        ),
    ],
)

FILTER_ROWS = TransformType(
    id="filter_rows",
    name="Filter Rows",
    category="clean",
    description="Keep only rows that match a condition on a column.",
    icon="🔍",
    params=[
        TransformParam(name="column", type="column", label="Column"),
        TransformParam(
            name="operator",
            type="select",
            label="Operator",
            options=[
                "equals",
                "not_equals",
                "greater_than",
                "less_than",
                "contains",
                "starts_with",
                "ends_with",
                "is_null",
                "is_not_null",
                "regex_match",
            ],
            default="equals",
        ),
        TransformParam(
            name="value",
            type="text",
            label="Compare value",
            required=False,
            placeholder="Not needed for is_null / is_not_null",
        ),
    ],
)

REMOVE_SPECIAL_CHARS = TransformType(
    id="remove_special_chars",
    name="Remove Special Characters",
    category="clean",
    description="Strip characters from a column that don't match the allowed pattern.",
    icon="🧹",
    params=[
        TransformParam(name="column", type="column", label="Column"),
        TransformParam(
            name="keep_pattern",
            type="text",
            label="Characters to keep (regex class)",
            required=False,
            default="a-zA-Z0-9 ",
            placeholder="e.g. a-zA-Z0-9 ",
        ),
    ],
)

VALIDATE_REGEX = TransformType(
    id="validate_regex",
    name="Filter by Regex",
    category="clean",
    description="Keep only rows where a column matches (or doesn't match) a regular expression.",
    icon="🔎",
    params=[
        TransformParam(name="column", type="column", label="Column"),
        TransformParam(
            name="pattern",
            type="text",
            label="Regex pattern",
            placeholder=r"e.g. ^\d{4}-\d{2}-\d{2}$",
        ),
        TransformParam(
            name="mode",
            type="select",
            label="Keep rows that…",
            options=["match", "not_match"],
            default="match",
        ),
    ],
)

CLIP_VALUES = TransformType(
    id="clip_values",
    name="Clip / Clamp Values",
    category="clean",
    description="Clamp numeric values to a minimum and/or maximum threshold.",
    icon="📐",
    params=[
        TransformParam(name="column", type="column", label="Column"),
        TransformParam(name="min_value", type="text", label="Minimum value", required=False, placeholder="Leave blank for no lower bound"),
        TransformParam(name="max_value", type="text", label="Maximum value", required=False, placeholder="Leave blank for no upper bound"),
    ],
)

REPLACE_STRING = TransformType(
    id="replace_string",
    name="Find & Replace Text",
    category="clean",
    description="Replace occurrences of a substring or regex pattern within a column.",
    icon="🔁",
    params=[
        TransformParam(name="column", type="column", label="Column"),
        TransformParam(name="find", type="text", label="Find (text or regex)", placeholder="e.g. foo or ^bad_"),
        TransformParam(name="replace", type="text", label="Replace with", placeholder="e.g. bar"),
        TransformParam(
            name="use_regex",
            type="boolean",
            label="Use regex (REGEXP_REPLACE)",
            required=False,
            default=False,
        ),
    ],
)

OUTLIER_FILTER = TransformType(
    id="outlier_filter",
    name="Outlier Filter",
    category="clean",
    description="Remove or keep rows where a numeric column falls outside a threshold based on standard deviations from the mean.",
    icon="📊",
    params=[
        TransformParam(name="column", type="column", label="Numeric column"),
        TransformParam(
            name="threshold",
            type="number",
            label="Standard deviation threshold",
            default=3,
        ),
        TransformParam(
            name="action",
            type="select",
            label="Action",
            options=["remove_outliers", "keep_outliers"],
            default="remove_outliers",
        ),
    ],
)

ALL_TRANSFORMS = [
    REMOVE_DUPLICATES,
    DROP_NULLS,
    FILL_NULL,
    TRIM_WHITESPACE,
    STANDARDIZE_CASE,
    CAST_TYPE,
    FILTER_ROWS,
    REMOVE_SPECIAL_CHARS,
    VALIDATE_REGEX,
    CLIP_VALUES,
    REPLACE_STRING,
    OUTLIER_FILTER,
]


# ── Codegen Functions ─────────────────────────────────────────────────────────
# Each returns (sql, new_columns_or_None).
# new_columns is None if the column list is unchanged.

def codegen_remove_duplicates(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    cols = config.get("dedup_columns", [])
    keep = config.get("keep", "first")
    order_by = config.get("order_by", "")

    if not cols:
        return f"SELECT * FROM {input_alias}", None

    partition_cols = ", ".join(cols)
    # When no order_by is specified use the partition columns themselves — avoids
    # scalar subquery (SELECT 0) which Dremio's Calcite planner rejects.
    if order_by:
        order_expr = f"{order_by} {'DESC' if keep == 'last' else 'ASC'}"
    else:
        order_expr = partition_cols

    window_expr = f"ROW_NUMBER() OVER (PARTITION BY {partition_cols} ORDER BY {order_expr})"
    if columns:
        sql = subq_filter_select(columns, input_alias, window_expr, "_rn", "_t._rn = 1")
    else:
        sql = (
            f"SELECT * FROM ("
            f"SELECT *, {window_expr} AS _rn FROM {input_alias}"
            f") _t WHERE _t._rn = 1"
        )
    return sql, None


def codegen_drop_nulls(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    cols = config.get("columns", [])
    if not cols:
        return f"SELECT * FROM {input_alias}", None
    conditions = " AND ".join(f"{c} IS NOT NULL" for c in cols)
    return f"SELECT * FROM {input_alias} WHERE {conditions}", None


def codegen_fill_null(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    strategy = config.get("strategy", "constant")
    value = config.get("value", "")

    if not col:
        return f"SELECT * FROM {input_alias}", None

    if strategy == "constant":
        fill_expr = f"COALESCE({col}, '{value}')"
    elif strategy == "mean":
        fill_expr = f"COALESCE({col}, AVG({col}) OVER ())"
    elif strategy == "mode":
        fill_expr = (
            f"COALESCE({col}, ("
            f"SELECT {col} FROM {input_alias} WHERE {col} IS NOT NULL "
            f"GROUP BY {col} ORDER BY COUNT(*) DESC LIMIT 1"
            f"))"
        )
    else:
        fill_expr = f"COALESCE({col}, '{value}')"

    if columns:
        sql = replace_select(columns, {col: fill_expr}, input_alias)
    else:
        sql = f"SELECT * FROM {input_alias}"
    return sql, None


def codegen_trim_whitespace(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    cols = config.get("columns", [])
    if not cols:
        return f"SELECT * FROM {input_alias}", None

    if columns:
        replacements = {c: f"TRIM({c})" for c in cols}
        sql = replace_select(columns, replacements, input_alias)
    else:
        sql = f"SELECT * FROM {input_alias}"
    return sql, None


def codegen_standardize_case(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    case = config.get("case", "lower")

    if not col:
        return f"SELECT * FROM {input_alias}", None

    fn_map = {"upper": "UPPER", "lower": "LOWER", "title": "INITCAP"}
    fn = fn_map.get(case, "LOWER")

    if columns:
        sql = replace_select(columns, {col: f"{fn}({col})"}, input_alias)
    else:
        sql = f"SELECT * FROM {input_alias}"
    return sql, None


def codegen_cast_type(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    target_type = config.get("target_type", "VARCHAR")
    on_error = config.get("on_error", "null")

    if not col:
        return f"SELECT * FROM {input_alias}", None

    cast_expr = f"TRY_CAST({col} AS {target_type})" if on_error == "null" else f"CAST({col} AS {target_type})"

    if columns:
        sql = replace_select(columns, {col: cast_expr}, input_alias)
    else:
        sql = f"SELECT * FROM {input_alias}"
    return sql, None


def codegen_filter_rows(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    operator = config.get("operator", "equals")
    value = config.get("value", "")

    if not col:
        return f"SELECT * FROM {input_alias}", None

    op_map = {
        "equals": f"{col} = '{value}'",
        "not_equals": f"{col} <> '{value}'",
        "greater_than": f"{col} > '{value}'",
        "less_than": f"{col} < '{value}'",
        "contains": f"{col} LIKE '%{value}%'",
        "starts_with": f"{col} LIKE '{value}%'",
        "ends_with": f"{col} LIKE '%{value}'",
        "is_null": f"{col} IS NULL",
        "is_not_null": f"{col} IS NOT NULL",
        "regex_match": f"REGEXP_LIKE({col}, '{value}')",
    }

    condition = op_map.get(operator, f"{col} = '{value}'")
    return f"SELECT * FROM {input_alias} WHERE {condition}", None


def codegen_remove_special_chars(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    keep_pattern = config.get("keep_pattern", "a-zA-Z0-9 ")

    if not col:
        return f"SELECT * FROM {input_alias}", None

    expr = f"REGEXP_REPLACE({col}, '[^{keep_pattern}]', '')"
    if columns:
        sql = replace_select(columns, {col: expr}, input_alias)
    else:
        sql = f"SELECT * FROM {input_alias}"
    return sql, None


def codegen_validate_regex(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    pattern = config.get("pattern", "")
    mode = config.get("mode", "match")

    if not col or not pattern:
        return f"SELECT * FROM {input_alias}", None

    if mode == "not_match":
        condition = f"NOT REGEXP_LIKE({col}, '{pattern}')"
    else:
        condition = f"REGEXP_LIKE({col}, '{pattern}')"

    col_list = ", ".join(columns) if columns else "*"
    return f"SELECT {col_list} FROM {input_alias} WHERE {condition}", None


def codegen_clip_values(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    min_val = config.get("min_value", "")
    max_val = config.get("max_value", "")

    if not col:
        return f"SELECT * FROM {input_alias}", None

    expr = col
    if min_val != "":
        expr = f"GREATEST({expr}, {min_val})"
    if max_val != "":
        expr = f"LEAST({expr}, {max_val})"

    if columns:
        sql = replace_select(columns, {col: expr}, input_alias)
    else:
        sql = f"SELECT * FROM {input_alias}"
    return sql, None


def codegen_replace_string(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    find = config.get("find", "")
    replace = config.get("replace", "")
    use_regex = config.get("use_regex", False)

    if not col or not find:
        return f"SELECT * FROM {input_alias}", None

    if use_regex:
        expr = f"REGEXP_REPLACE({col}, '{find}', '{replace}')"
    else:
        expr = f"REPLACE({col}, '{find}', '{replace}')"

    if columns:
        sql = replace_select(columns, {col: expr}, input_alias)
    else:
        sql = f"SELECT * FROM {input_alias}"
    return sql, None


def codegen_outlier_filter(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    threshold = float(config.get("threshold", 3))
    action = config.get("action", "remove_outliers")

    if not col:
        return f"SELECT * FROM {input_alias}", None

    # Use window functions to compute mean and stddev over the full dataset
    mean_expr = f"AVG(CAST({col} AS DOUBLE)) OVER ()"
    std_expr = f"STDDEV(CAST({col} AS DOUBLE)) OVER ()"
    col_list = ", ".join(columns) if columns else "*"

    if action == "keep_outliers":
        condition = f"ABS(CAST({col} AS DOUBLE) - _mean) > {threshold} * _std"
    else:
        condition = f"ABS(CAST({col} AS DOUBLE) - _mean) <= {threshold} * _std OR _std = 0"

    sql = (
        f"SELECT {col_list} FROM ("
        f"SELECT *, {mean_expr} AS _mean, {std_expr} AS _std "
        f"FROM {input_alias}"
        f") _t WHERE {condition}"
    )
    return sql, None


# ── Dispatch Table ────────────────────────────────────────────────────────────

CODEGEN_MAP: dict = {
    "remove_duplicates": codegen_remove_duplicates,
    "drop_nulls": codegen_drop_nulls,
    "fill_null": codegen_fill_null,
    "trim_whitespace": codegen_trim_whitespace,
    "standardize_case": codegen_standardize_case,
    "cast_type": codegen_cast_type,
    "filter_rows": codegen_filter_rows,
    "remove_special_chars": codegen_remove_special_chars,
    "validate_regex": codegen_validate_regex,
    "clip_values": codegen_clip_values,
    "replace_string": codegen_replace_string,
    "outlier_filter": codegen_outlier_filter,
}
