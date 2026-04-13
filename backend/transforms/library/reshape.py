from __future__ import annotations
from models import TransformType, TransformParam
from transforms.utils import replace_select, drop_select


# ── Transform Definitions ────────────────────────────────────────────────────

RENAME_COLUMNS = TransformType(
    id="rename_columns",
    name="Rename Columns",
    category="reshape",
    description="Rename one or more columns using a mapping of old name → new name.",
    icon="✏️",
    params=[
        TransformParam(
            name="renames",
            type="map",
            label="Old name → New name",
            placeholder="e.g. old_name: new_name",
        ),
    ],
)

SELECT_COLUMNS = TransformType(
    id="select_columns",
    name="Select Columns",
    category="reshape",
    description="Keep only the specified columns and discard all others.",
    icon="📋",
    params=[
        TransformParam(name="columns", type="columns", label="Columns to keep"),
    ],
)

DROP_COLUMNS = TransformType(
    id="drop_columns",
    name="Drop Columns",
    category="reshape",
    description="Remove specific columns from the dataset.",
    icon="🗑️",
    params=[
        TransformParam(name="columns", type="columns", label="Columns to remove"),
    ],
)

SPLIT_COLUMN = TransformType(
    id="split_column",
    name="Split Column",
    category="reshape",
    description="Split a string column into multiple columns using a delimiter.",
    icon="✂️",
    params=[
        TransformParam(name="column", type="column", label="Column to split"),
        TransformParam(name="delimiter", type="text", label="Delimiter", placeholder="e.g. , or |"),
        TransformParam(
            name="output_columns",
            type="text",
            label="Output column names (comma-separated)",
            placeholder="e.g. first_name, last_name",
        ),
        TransformParam(
            name="keep_original",
            type="boolean",
            label="Keep original column",
            required=False,
            default=False,
        ),
    ],
)

COMBINE_COLUMNS = TransformType(
    id="combine_columns",
    name="Combine Columns",
    category="reshape",
    description="Concatenate multiple columns into a single new column.",
    icon="🔗",
    params=[
        TransformParam(name="columns", type="columns", label="Columns to combine"),
        TransformParam(
            name="separator",
            type="text",
            label="Separator",
            required=False,
            default=" ",
            placeholder="e.g. space or _",
        ),
        TransformParam(name="output_name", type="text", label="Output column name"),
    ],
)

ADD_COLUMN = TransformType(
    id="add_column",
    name="Add Computed Column",
    category="reshape",
    description="Add a new column using a SQL expression.",
    icon="➕",
    params=[
        TransformParam(name="name", type="text", label="New column name"),
        TransformParam(
            name="expression",
            type="text",
            label="SQL expression",
            placeholder="e.g. col1 * 2  or  CONCAT(first, ' ', last)",
        ),
    ],
)

REORDER_COLUMNS = TransformType(
    id="reorder_columns",
    name="Reorder Columns",
    category="reshape",
    description="Change the column order by specifying columns in the desired sequence.",
    icon="↕️",
    params=[
        TransformParam(
            name="columns",
            type="columns",
            label="Columns in desired order (remaining columns appended at end)",
        ),
    ],
)

UNPIVOT = TransformType(
    id="unpivot",
    name="Unpivot (Melt)",
    category="reshape",
    description="Melt multiple value columns into key-value rows. Each row becomes N rows.",
    icon="🔀",
    params=[
        TransformParam(name="id_columns", type="columns", label="ID / anchor columns (kept as-is)"),
        TransformParam(
            name="value_columns",
            type="columns",
            label="Value columns to unpivot",
        ),
        TransformParam(name="key_column_name", type="text", label="New key column name", placeholder="e.g. metric"),
        TransformParam(name="value_column_name", type="text", label="New value column name", placeholder="e.g. value"),
    ],
)

FLATTEN_JSON = TransformType(
    id="flatten_json",
    name="Extract JSON Fields",
    category="reshape",
    description="Extract fields from a JSON string column into separate columns.",
    icon="📦",
    params=[
        TransformParam(name="column", type="column", label="JSON column"),
        TransformParam(
            name="fields",
            type="text",
            label="Fields to extract (comma-separated)",
            placeholder="e.g. name, address.city, items[0]",
        ),
        TransformParam(
            name="output_prefix",
            type="text",
            label="Output column prefix (optional)",
            required=False,
            placeholder="e.g. json_ → json_name, json_city",
        ),
    ],
)

JOIN = TransformType(
    id="join",
    name="Join",
    category="reshape",
    description="Join the current dataset with another table. Supports INNER, LEFT, RIGHT, FULL OUTER, SEMI, and ANTI joins.",
    icon="🔗",
    params=[
        TransformParam(
            name="join_type",
            type="select",
            label="Join type",
            options=["LEFT", "INNER", "RIGHT", "FULL OUTER", "LEFT SEMI", "LEFT ANTI"],
            default="LEFT",
        ),
        TransformParam(
            name="right_table",
            type="text",
            label="Right table (fully qualified)",
            placeholder="e.g. my_space.dim_customers",
        ),
        TransformParam(
            name="join_keys",
            type="map",
            label="Join keys (left column → right column)",
            placeholder="e.g. customer_id → id",
        ),
        TransformParam(
            name="right_columns",
            type="text",
            label="Columns to bring in from right table (comma-separated, blank = all)",
            required=False,
            placeholder="e.g. name, email, region",
        ),
    ],
)

UNION = TransformType(
    id="union",
    name="Union",
    category="reshape",
    description="Stack another table on top of this dataset. Use UNION ALL to keep duplicates or UNION to remove them.",
    icon="📚",
    params=[
        TransformParam(
            name="union_table",
            type="text",
            label="Table to union (fully qualified)",
            placeholder="e.g. my_space.sales_2024",
        ),
        TransformParam(
            name="mode",
            type="select",
            label="Mode",
            options=["UNION ALL", "UNION"],
            default="UNION ALL",
        ),
    ],
)

ALL_TRANSFORMS = [
    RENAME_COLUMNS,
    SELECT_COLUMNS,
    DROP_COLUMNS,
    SPLIT_COLUMN,
    COMBINE_COLUMNS,
    ADD_COLUMN,
    REORDER_COLUMNS,
    UNPIVOT,
    FLATTEN_JSON,
    JOIN,
    UNION,
]


# ── Codegen Functions ─────────────────────────────────────────────────────────

def codegen_rename_columns(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    renames: dict = config.get("renames", {})
    if not renames:
        return f"SELECT * FROM {input_alias}", None

    if columns:
        # Build explicit select; rename matching cols, pass others through
        parts = []
        new_cols = []
        for col in columns:
            if col in renames:
                new_name = renames[col]
                parts.append(f"{col} AS {new_name}")
                new_cols.append(new_name)
            else:
                parts.append(col)
                new_cols.append(col)
        sql = f"SELECT {', '.join(parts)} FROM {input_alias}"
        return sql, new_cols
    else:
        return f"SELECT * FROM {input_alias}", None


def codegen_select_columns(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    cols = config.get("columns", [])
    if not cols:
        return f"SELECT * FROM {input_alias}", None
    col_list = ", ".join(cols)
    return f"SELECT {col_list} FROM {input_alias}", list(cols)


def codegen_drop_columns(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    cols_to_drop = config.get("columns", [])
    if not cols_to_drop:
        return f"SELECT * FROM {input_alias}", None

    drop_set = set(cols_to_drop)
    if columns:
        new_cols = [c for c in columns if c not in drop_set]
        sql = drop_select(columns, drop_set, input_alias)
        return sql, new_cols
    else:
        return f"SELECT * FROM {input_alias}", None


def codegen_split_column(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    delimiter = config.get("delimiter", ",")
    output_columns_raw = config.get("output_columns", "")
    keep_original = config.get("keep_original", False)

    if not col or not output_columns_raw:
        return f"SELECT * FROM {input_alias}", None

    output_cols = [c.strip() for c in output_columns_raw.split(",") if c.strip()]
    split_parts = ", ".join(
        f"SPLIT_PART({col}, '{delimiter}', {i}) AS {out_col}"
        for i, out_col in enumerate(output_cols, start=1)
    )

    if keep_original:
        sql = f"SELECT *, {split_parts} FROM {input_alias}"
        new_cols = list(columns) + output_cols if columns else None
    else:
        if columns:
            kept = [c for c in columns if c != col]
            kept_sql = ", ".join(kept)
            sql = f"SELECT {kept_sql}, {split_parts} FROM {input_alias}"
            new_cols = kept + output_cols
        else:
            sql = f"SELECT * FROM {input_alias}"
            new_cols = None

    return sql, new_cols


def codegen_combine_columns(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    cols = config.get("columns", [])
    separator = config.get("separator", " ")
    output_name = config.get("output_name", "combined")

    if not cols or not output_name:
        return f"SELECT * FROM {input_alias}", None

    concat_parts = []
    for i, col in enumerate(cols):
        if i > 0:
            concat_parts.append(f"'{separator}'")
        concat_parts.append(col)

    concat_expr = f"CONCAT({', '.join(concat_parts)}) AS {output_name}"
    sql = f"SELECT *, {concat_expr} FROM {input_alias}"
    new_cols = list(columns) + [output_name] if columns else None
    return sql, new_cols


def codegen_add_column(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    name = config.get("name", "")
    expression = config.get("expression", "")

    if not name or not expression:
        return f"SELECT * FROM {input_alias}", None

    sql = f"SELECT *, {expression} AS {name} FROM {input_alias}"
    new_cols = list(columns) + [name] if columns else None
    return sql, new_cols


def codegen_reorder_columns(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    ordered = config.get("columns", [])
    if not ordered:
        return f"SELECT * FROM {input_alias}", None

    if columns:
        ordered_set = dict.fromkeys(ordered)  # preserve order, dedupe
        remainder = [c for c in columns if c not in ordered_set]
        final_order = [c for c in ordered if c in set(columns)] + remainder
        col_list = ", ".join(final_order)
        return f"SELECT {col_list} FROM {input_alias}", final_order
    else:
        col_list = ", ".join(ordered)
        return f"SELECT {col_list}, * FROM {input_alias}", None


def codegen_unpivot(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    id_cols = config.get("id_columns", [])
    val_cols = config.get("value_columns", [])
    key_name = config.get("key_column_name", "key") or "key"
    val_name = config.get("value_column_name", "value") or "value"

    if not id_cols or not val_cols:
        return f"SELECT * FROM {input_alias}", None

    id_select = ", ".join(id_cols)
    unions = []
    for vc in val_cols:
        unions.append(
            f"SELECT {id_select}, '{vc}' AS {key_name}, CAST({vc} AS VARCHAR) AS {val_name} FROM {input_alias}"
        )
    sql = "\nUNION ALL\n".join(unions)
    new_cols = list(id_cols) + [key_name, val_name]
    return sql, new_cols


def codegen_flatten_json(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    fields_raw = config.get("fields", "")
    prefix = config.get("output_prefix", "") or ""

    if not col or not fields_raw:
        return f"SELECT * FROM {input_alias}", None

    fields = [f.strip() for f in fields_raw.split(",") if f.strip()]
    extracted = []
    new_col_names = []
    for field in fields:
        # Build a safe column name from the field path
        safe_name = field.replace(".", "_").replace("[", "_").replace("]", "").replace(" ", "_")
        out_name = f"{prefix}{safe_name}"
        extracted.append(f"JSON_VALUE({col}, 'lax $.{field}') AS {out_name}")
        new_col_names.append(out_name)

    extras = ", ".join(extracted)
    sql = f"SELECT *, {extras} FROM {input_alias}"
    new_cols = list(columns) + new_col_names if columns else None
    return sql, new_cols


def codegen_join(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    join_type = config.get("join_type", "LEFT")
    right_table = config.get("right_table", "")
    join_keys: dict = config.get("join_keys", {})
    right_columns_raw = config.get("right_columns", "")

    if not right_table or not join_keys:
        return f"SELECT * FROM {input_alias}", None

    on_clause = " AND ".join(
        f"_l.{lk} = _r.{rk}" for lk, rk in join_keys.items()
    )

    right_cols = [c.strip() for c in right_columns_raw.split(",") if c.strip()]

    if join_type in ("LEFT SEMI", "LEFT ANTI"):
        exists_kw = "NOT EXISTS" if join_type == "LEFT ANTI" else "EXISTS"
        col_list = ", ".join(columns) if columns else "*"
        on_sub = " AND ".join(
            f"{input_alias}.{lk} = _r.{rk}" for lk, rk in join_keys.items()
        )
        sql = (
            f"SELECT {col_list} FROM {input_alias} "
            f"WHERE {exists_kw} (SELECT 1 FROM {right_table} _r WHERE {on_sub})"
        )
        return sql, columns if columns else None
    else:
        if right_cols:
            right_select = ", ".join(f"_r.{c}" for c in right_cols)
            select_clause = f"_l.*, {right_select}"
        else:
            select_clause = "_l.*"

        sql = (
            f"SELECT {select_clause} "
            f"FROM {input_alias} _l "
            f"{join_type} JOIN {right_table} _r "
            f"ON {on_clause}"
        )
        new_cols = list(columns) + right_cols if (columns and right_cols) else None
        return sql, new_cols


def codegen_union(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    union_table = config.get("union_table", "")
    mode = config.get("mode", "UNION ALL")

    if not union_table:
        return f"SELECT * FROM {input_alias}", None

    col_list = ", ".join(columns) if columns else "*"
    sql = (
        f"SELECT {col_list} FROM {input_alias}\n"
        f"{mode}\n"
        f"SELECT {col_list} FROM {union_table}"
    )
    return sql, None


# ── Dispatch Table ────────────────────────────────────────────────────────────

CODEGEN_MAP: dict = {
    "rename_columns": codegen_rename_columns,
    "select_columns": codegen_select_columns,
    "drop_columns": codegen_drop_columns,
    "split_column": codegen_split_column,
    "combine_columns": codegen_combine_columns,
    "add_column": codegen_add_column,
    "reorder_columns": codegen_reorder_columns,
    "unpivot": codegen_unpivot,
    "flatten_json": codegen_flatten_json,
    "join": codegen_join,
    "union": codegen_union,
}
