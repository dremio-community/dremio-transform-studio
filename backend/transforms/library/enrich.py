from __future__ import annotations
import json
from models import TransformType, TransformParam
from transforms.utils import replace_select


# ── Transform Definitions ────────────────────────────────────────────────────

LOOKUP_JOIN = TransformType(
    id="lookup_join",
    name="Lookup / Enrich",
    category="enrich",
    description="Enrich the dataset by joining with a lookup table.",
    icon="🔗",
    params=[
        TransformParam(
            name="lookup_table",
            type="text",
            label="Lookup table (fully qualified)",
            placeholder="e.g. my_space.dim_products",
        ),
        TransformParam(name="join_key_source", type="column", label="Key in source table"),
        TransformParam(
            name="join_key_lookup",
            type="text",
            label="Key in lookup table",
            placeholder="e.g. product_id",
        ),
        TransformParam(
            name="lookup_columns",
            type="text",
            label="Columns to bring in (comma-separated)",
            placeholder="e.g. product_name, category",
        ),
        TransformParam(
            name="join_type",
            type="select",
            label="Join type",
            options=["left", "inner"],
            default="left",
        ),
    ],
)

MAP_VALUES = TransformType(
    id="map_values",
    name="Map / Replace Values",
    category="enrich",
    description="Replace values in a column using a lookup mapping.",
    icon="🗺️",
    params=[
        TransformParam(name="column", type="column", label="Column"),
        TransformParam(name="mapping", type="map", label="Value → Label"),
        TransformParam(
            name="default_value",
            type="text",
            label="Default value for unmapped entries",
            required=False,
            placeholder="Leave blank to keep original",
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

BIN_VALUES = TransformType(
    id="bin_values",
    name="Bin / Bucket Values",
    category="enrich",
    description="Assign rows to named buckets based on numeric ranges.",
    icon="🪣",
    params=[
        TransformParam(name="column", type="column", label="Column to bin"),
        TransformParam(
            name="bins",
            type="text",
            label='Bins (JSON array of {"label","min","max"})',
            placeholder='[{"label":"Low","min":0,"max":100},{"label":"High","min":100,"max":1000}]',
        ),
        TransformParam(name="output_name", type="text", label="Output column name"),
    ],
)

ADD_ROW_NUMBER = TransformType(
    id="add_row_number",
    name="Add Row Number",
    category="enrich",
    description="Add a sequential row number column, optionally partitioned.",
    icon="🔢",
    params=[
        TransformParam(name="order_by", type="column", label="Order by column"),
        TransformParam(
            name="partition_by",
            type="column",
            label="Partition by column (optional)",
            required=False,
            placeholder="Leave blank for global row number",
        ),
        TransformParam(
            name="output_name",
            type="text",
            label="Output column name",
            required=False,
            default="row_num",
        ),
        TransformParam(
            name="direction",
            type="select",
            label="Sort direction",
            options=["asc", "desc"],
            default="asc",
        ),
    ],
)

ADD_RUNNING_TOTAL = TransformType(
    id="add_running_total",
    name="Running Total",
    category="enrich",
    description="Add a cumulative running sum of a column, ordered by another column.",
    icon="📈",
    params=[
        TransformParam(name="column", type="column", label="Column to sum"),
        TransformParam(name="order_by", type="column", label="Order by column"),
        TransformParam(
            name="partition_by",
            type="column",
            label="Partition by column (optional)",
            required=False,
        ),
        TransformParam(name="output_name", type="text", label="Output column name"),
    ],
)

CONDITIONAL_COLUMN = TransformType(
    id="conditional_column",
    name="Conditional Column (CASE)",
    category="enrich",
    description="Add a new column using CASE WHEN logic — like an IF/ELSE across rows.",
    icon="🔀",
    params=[
        TransformParam(name="output_name", type="text", label="New column name"),
        TransformParam(name="condition_column", type="column", label="Column to evaluate"),
        TransformParam(
            name="conditions",
            type="map",
            label="Value → Result (WHEN value THEN result)",
            placeholder="e.g. US → United States",
        ),
        TransformParam(
            name="else_value",
            type="text",
            label="ELSE value (default)",
            required=False,
            placeholder="Leave blank for NULL",
        ),
    ],
)

LAG_LEAD = TransformType(
    id="lag_lead",
    name="Lag / Lead",
    category="enrich",
    description="Access the previous or next row's value for a column (useful for time series).",
    icon="⏩",
    params=[
        TransformParam(name="column", type="column", label="Column"),
        TransformParam(
            name="function",
            type="select",
            label="Function",
            options=["LAG", "LEAD"],
            default="LAG",
        ),
        TransformParam(name="offset", type="number", label="Offset (rows)", default=1),
        TransformParam(name="order_by", type="column", label="Order by column"),
        TransformParam(
            name="partition_by",
            type="column",
            label="Partition by (optional)",
            required=False,
        ),
        TransformParam(name="output_name", type="text", label="Output column name"),
        TransformParam(
            name="default_value",
            type="text",
            label="Default value (for first/last row)",
            required=False,
            placeholder="e.g. 0 or NULL",
        ),
    ],
)

PERCENT_OF_TOTAL = TransformType(
    id="percent_of_total",
    name="Percent of Total",
    category="enrich",
    description="Add a column showing each row's value as a percentage of the group (or overall) total.",
    icon="💯",
    params=[
        TransformParam(name="column", type="column", label="Column to compute % of"),
        TransformParam(
            name="partition_by",
            type="column",
            label="Partition by (optional — for % within group)",
            required=False,
        ),
        TransformParam(name="output_name", type="text", label="Output column name", placeholder="e.g. pct_of_total"),
        TransformParam(
            name="decimals",
            type="number",
            label="Decimal places",
            default=2,
        ),
    ],
)

UNIT_CONVERSION = TransformType(
    id="unit_conversion",
    name="Unit Conversion",
    category="enrich",
    description="Convert a numeric column from one unit to another (length, weight, temperature, speed, area).",
    icon="📐",
    params=[
        TransformParam(name="column", type="column", label="Column to convert"),
        TransformParam(
            name="category",
            type="select",
            label="Unit category",
            options=["length", "weight", "temperature", "speed", "area"],
            default="length",
        ),
        TransformParam(
            name="from_unit",
            type="text",
            label="From unit",
            placeholder="e.g. km, kg, celsius, mph, sqft",
        ),
        TransformParam(
            name="to_unit",
            type="text",
            label="To unit",
            placeholder="e.g. miles, lbs, fahrenheit, kph, sqm",
        ),
        TransformParam(
            name="output_name",
            type="text",
            label="Output column name",
            placeholder="Leave blank to replace original",
        ),
    ],
)

ALL_TRANSFORMS = [
    LOOKUP_JOIN,
    MAP_VALUES,
    BIN_VALUES,
    ADD_ROW_NUMBER,
    ADD_RUNNING_TOTAL,
    CONDITIONAL_COLUMN,
    LAG_LEAD,
    PERCENT_OF_TOTAL,
    UNIT_CONVERSION,
]


# ── Codegen Functions ─────────────────────────────────────────────────────────

def codegen_lookup_join(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    lookup_table = config.get("lookup_table", "")
    source_key = config.get("join_key_source", "")
    lookup_key = config.get("join_key_lookup", "")
    lookup_columns_raw = config.get("lookup_columns", "")
    join_type = config.get("join_type", "left").upper()

    if not lookup_table or not source_key or not lookup_key:
        return f"SELECT * FROM {input_alias}", None

    lookup_cols = [c.strip() for c in lookup_columns_raw.split(",") if c.strip()]
    if lookup_cols:
        cols_expr = ", ".join(f"lkp.{c}" for c in lookup_cols)
        select_clause = f"src.*, {cols_expr}"
    else:
        select_clause = "src.*"

    sql = (
        f"SELECT {select_clause} "
        f"FROM {input_alias} src "
        f"{join_type} JOIN {lookup_table} lkp "
        f"ON src.{source_key} = lkp.{lookup_key}"
    )
    new_cols = list(columns) + lookup_cols if (columns and lookup_cols) else None
    return sql, new_cols


def codegen_map_values(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    mapping: dict = config.get("mapping", {})
    default_value = config.get("default_value", "")
    output_name = config.get("output_name", "") or col

    if not col or not mapping:
        return f"SELECT * FROM {input_alias}", None

    when_clauses = "\n    ".join(
        f"WHEN {col} = '{k}' THEN '{v}'" for k, v in mapping.items()
    )
    else_clause = f"ELSE '{default_value}'" if default_value else f"ELSE {col}"
    case_expr = f"CASE\n    {when_clauses}\n    {else_clause}\n  END"

    if output_name == col:
        if columns:
            sql = replace_select(columns, {col: case_expr}, input_alias)
        else:
            sql = f"SELECT * FROM {input_alias}"
        return sql, None
    else:
        sql = f"SELECT *, {case_expr} AS {output_name} FROM {input_alias}"
        new_cols = list(columns) + [output_name] if columns else None
        return sql, new_cols


def codegen_bin_values(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    bins_raw = config.get("bins", "[]")
    output_name = config.get("output_name", "bin")

    if not col:
        return f"SELECT * FROM {input_alias}", None

    try:
        bins = json.loads(bins_raw) if isinstance(bins_raw, str) else bins_raw
    except (json.JSONDecodeError, TypeError):
        bins = []

    if not bins:
        sql = f"SELECT *, NULL AS {output_name} FROM {input_alias}"
        new_cols = list(columns) + [output_name] if columns else None
        return sql, new_cols

    when_clauses = []
    for b in bins:
        label = b.get("label", "")
        lo = b.get("min")
        hi = b.get("max")
        if lo is not None and hi is not None:
            when_clauses.append(f"WHEN {col} >= {lo} AND {col} < {hi} THEN '{label}'")
        elif lo is not None:
            when_clauses.append(f"WHEN {col} >= {lo} THEN '{label}'")
        elif hi is not None:
            when_clauses.append(f"WHEN {col} < {hi} THEN '{label}'")

    when_sql = "\n    ".join(when_clauses)
    case_expr = f"CASE\n    {when_sql}\n    ELSE NULL\n  END"
    sql = f"SELECT *, {case_expr} AS {output_name} FROM {input_alias}"
    new_cols = list(columns) + [output_name] if columns else None
    return sql, new_cols


def codegen_add_row_number(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    order_by = config.get("order_by", "")
    partition_by = config.get("partition_by", "")
    output_name = config.get("output_name", "row_num") or "row_num"
    direction = config.get("direction", "asc").upper()

    if not order_by:
        return f"SELECT * FROM {input_alias}", None

    over_clause = (
        f"PARTITION BY {partition_by} ORDER BY {order_by} {direction}"
        if partition_by
        else f"ORDER BY {order_by} {direction}"
    )
    expr = f"ROW_NUMBER() OVER ({over_clause})"
    sql = f"SELECT *, {expr} AS {output_name} FROM {input_alias}"
    new_cols = list(columns) + [output_name] if columns else None
    return sql, new_cols


def codegen_add_running_total(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    order_by = config.get("order_by", "")
    partition_by = config.get("partition_by", "")
    output_name = config.get("output_name", "running_total")

    if not col or not order_by:
        return f"SELECT * FROM {input_alias}", None

    over_clause = (
        f"PARTITION BY {partition_by} ORDER BY {order_by} ROWS UNBOUNDED PRECEDING"
        if partition_by
        else f"ORDER BY {order_by} ROWS UNBOUNDED PRECEDING"
    )
    expr = f"SUM({col}) OVER ({over_clause})"
    sql = f"SELECT *, {expr} AS {output_name} FROM {input_alias}"
    new_cols = list(columns) + [output_name] if columns else None
    return sql, new_cols


def codegen_conditional_column(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    output_name = config.get("output_name", "")
    condition_col = config.get("condition_column", "")
    conditions: dict = config.get("conditions", {})
    else_value = config.get("else_value", "")

    if not output_name or not condition_col:
        return f"SELECT * FROM {input_alias}", None

    when_clauses = "\n    ".join(
        f"WHEN {condition_col} = '{k}' THEN '{v}'" for k, v in conditions.items()
    )
    else_clause = f"ELSE '{else_value}'" if else_value else "ELSE NULL"
    case_expr = f"CASE\n    {when_clauses}\n    {else_clause}\n  END"

    sql = f"SELECT *, {case_expr} AS {output_name} FROM {input_alias}"
    new_cols = list(columns) + [output_name] if columns else None
    return sql, new_cols


def codegen_lag_lead(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    function = config.get("function", "LAG").upper()
    offset = int(config.get("offset", 1))
    order_by = config.get("order_by", "")
    partition_by = config.get("partition_by", "")
    output_name = config.get("output_name", "")
    default_value = config.get("default_value", "")

    if not col or not order_by or not output_name:
        return f"SELECT * FROM {input_alias}", None

    default_part = f", {default_value}" if default_value else ""
    fn_call = f"{function}({col}, {offset}{default_part})"

    over_clause = (
        f"PARTITION BY {partition_by} ORDER BY {order_by}"
        if partition_by
        else f"ORDER BY {order_by}"
    )
    expr = f"{fn_call} OVER ({over_clause})"

    sql = f"SELECT *, {expr} AS {output_name} FROM {input_alias}"
    new_cols = list(columns) + [output_name] if columns else None
    return sql, new_cols


def codegen_percent_of_total(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    partition_by = config.get("partition_by", "")
    output_name = config.get("output_name", "pct_of_total") or "pct_of_total"
    decimals = int(config.get("decimals", 2))

    if not col:
        return f"SELECT * FROM {input_alias}", None

    over_clause = f"PARTITION BY {partition_by}" if partition_by else ""
    expr = f"ROUND(100.0 * {col} / NULLIF(SUM({col}) OVER ({over_clause}), 0), {decimals})"

    sql = f"SELECT *, {expr} AS {output_name} FROM {input_alias}"
    new_cols = list(columns) + [output_name] if columns else None
    return sql, new_cols


def codegen_unit_conversion(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    from_unit = config.get("from_unit", "").strip().lower()
    to_unit = config.get("to_unit", "").strip().lower()
    output_name = config.get("output_name", "").strip() or col

    if not col or not from_unit or not to_unit:
        return f"SELECT * FROM {input_alias}", None

    # Conversion factor table — all relative to a base unit
    # length: base = meters
    length = {"m": 1, "meters": 1, "meter": 1, "km": 1000, "kilometers": 1000,
              "ft": 0.3048, "feet": 0.3048, "foot": 0.3048,
              "miles": 1609.344, "mile": 1609.344, "mi": 1609.344,
              "in": 0.0254, "inches": 0.0254, "inch": 0.0254,
              "cm": 0.01, "centimeters": 0.01, "mm": 0.001, "millimeters": 0.001,
              "yards": 0.9144, "yd": 0.9144}
    # weight: base = kilograms
    weight = {"kg": 1, "kilograms": 1, "g": 0.001, "grams": 0.001,
              "lbs": 0.453592, "lb": 0.453592, "pounds": 0.453592,
              "oz": 0.0283495, "ounces": 0.0283495, "t": 1000, "tons": 1000}
    # speed: base = m/s
    speed = {"ms": 1, "m/s": 1, "kph": 1 / 3.6, "kmh": 1 / 3.6,
             "mph": 0.44704, "knots": 0.514444, "fps": 0.3048}
    # area: base = sq meters
    area = {"sqm": 1, "m2": 1, "sqkm": 1e6, "km2": 1e6,
            "sqft": 0.092903, "sqmi": 2.59e6, "acres": 4046.86, "hectares": 10000}

    tables = [length, weight, speed, area]

    # Temperature is special (not a simple factor)
    temp_pairs = {
        ("celsius", "fahrenheit"): f"({col} * 9.0 / 5.0 + 32)",
        ("fahrenheit", "celsius"): f"(({col} - 32) * 5.0 / 9.0)",
        ("celsius", "kelvin"): f"({col} + 273.15)",
        ("kelvin", "celsius"): f"({col} - 273.15)",
        ("fahrenheit", "kelvin"): f"(({col} - 32) * 5.0 / 9.0 + 273.15)",
        ("kelvin", "fahrenheit"): f"(({col} - 273.15) * 9.0 / 5.0 + 32)",
        ("c", "f"): f"({col} * 9.0 / 5.0 + 32)",
        ("f", "c"): f"(({col} - 32) * 5.0 / 9.0)",
    }

    expr = None

    # Check temperature first
    pair = (from_unit, to_unit)
    if pair in temp_pairs:
        expr = temp_pairs[pair]
    else:
        # Look up factor-based conversion
        for table in tables:
            if from_unit in table and to_unit in table:
                factor = table[to_unit] / table[from_unit] if table[from_unit] != 0 else None
                if factor is not None:
                    expr = f"({col} * {factor})"
                break

    if expr is None:
        # Unknown — return a comment placeholder
        expr = f"({col} /* unknown conversion {from_unit} → {to_unit} */)"

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
    "lookup_join": codegen_lookup_join,
    "map_values": codegen_map_values,
    "bin_values": codegen_bin_values,
    "add_row_number": codegen_add_row_number,
    "add_running_total": codegen_add_running_total,
    "conditional_column": codegen_conditional_column,
    "lag_lead": codegen_lag_lead,
    "percent_of_total": codegen_percent_of_total,
    "unit_conversion": codegen_unit_conversion,
}
