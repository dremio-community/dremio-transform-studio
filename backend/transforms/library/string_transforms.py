from __future__ import annotations
from models import TransformType, TransformParam
from transforms.utils import replace_select


# ── Transform Definitions ────────────────────────────────────────────────────

EXTRACT_REGEX = TransformType(
    id="extract_regex",
    name="Extract with Regex",
    category="string",
    description="Extract a capture group from a string column using a regular expression.",
    icon="🔬",
    params=[
        TransformParam(name="column", type="column", label="Column"),
        TransformParam(
            name="pattern",
            type="text",
            label="Regex pattern (with capture group)",
            placeholder=r"e.g. (\d{4}-\d{2}-\d{2})",
        ),
        TransformParam(name="output_name", type="text", label="Output column name"),
    ],
)

PAD_STRING = TransformType(
    id="pad_string",
    name="Pad String",
    category="string",
    description="Left-pad or right-pad a column to a fixed length with a fill character.",
    icon="📏",
    params=[
        TransformParam(name="column", type="column", label="Column"),
        TransformParam(
            name="direction",
            type="select",
            label="Pad direction",
            options=["left", "right"],
            default="left",
        ),
        TransformParam(name="length", type="number", label="Target length", default=10),
        TransformParam(
            name="fill_char",
            type="text",
            label="Fill character",
            required=False,
            default="0",
            placeholder="e.g. 0 or space",
        ),
    ],
)

SUBSTRING = TransformType(
    id="substring",
    name="Substring",
    category="string",
    description="Extract a portion of a string column by start position and length.",
    icon="✂️",
    params=[
        TransformParam(name="column", type="column", label="Column"),
        TransformParam(name="start", type="number", label="Start position (1-based)", default=1),
        TransformParam(name="length", type="number", label="Number of characters", default=10),
        TransformParam(name="output_name", type="text", label="Output column name", placeholder="Leave blank to replace original"),
    ],
)

STRING_LENGTH = TransformType(
    id="string_length",
    name="String Length",
    category="string",
    description="Add a column with the character length of a string column.",
    icon="📐",
    params=[
        TransformParam(name="column", type="column", label="Column"),
        TransformParam(name="output_name", type="text", label="Output column name", placeholder="e.g. name_length"),
    ],
)

UPPER_LOWER = TransformType(
    id="upper_lower",
    name="Upper / Lower Case",
    category="string",
    description="Convert multiple string columns to upper or lower case in one step.",
    icon="🔤",
    params=[
        TransformParam(name="columns", type="columns", label="Columns to convert"),
        TransformParam(
            name="case",
            type="select",
            label="Target case",
            options=["upper", "lower", "title"],
            default="lower",
        ),
    ],
)

CONCAT_LITERAL = TransformType(
    id="concat_literal",
    name="Concat with Text",
    category="string",
    description="Prepend or append a fixed text string to a column.",
    icon="➕",
    params=[
        TransformParam(name="column", type="column", label="Column"),
        TransformParam(name="prefix", type="text", label="Prefix", required=False, placeholder="e.g. ID-"),
        TransformParam(name="suffix", type="text", label="Suffix", required=False, placeholder="e.g. _v2"),
        TransformParam(name="output_name", type="text", label="Output column name", placeholder="Leave blank to replace original"),
    ],
)

HASH_COLUMN = TransformType(
    id="hash_column",
    name="Hash Column",
    category="string",
    description="Hash a column's value using MD5 or SHA-256. Useful for anonymization, masking PII, or generating consistent identifiers.",
    icon="🔒",
    params=[
        TransformParam(name="column", type="column", label="Column to hash"),
        TransformParam(
            name="algorithm",
            type="select",
            label="Hash algorithm",
            options=["MD5", "SHA1", "SHA256"],
            default="MD5",
        ),
        TransformParam(
            name="output_name",
            type="text",
            label="Output column name",
            placeholder="Leave blank to replace original",
        ),
    ],
)

SURROGATE_KEY = TransformType(
    id="surrogate_key",
    name="Surrogate Key",
    category="string",
    description="Generate a surrogate key by hashing one or more columns together — produces a stable, unique identifier.",
    icon="🗝️",
    params=[
        TransformParam(name="columns", type="columns", label="Columns to hash together"),
        TransformParam(
            name="output_name",
            type="text",
            label="Output column name",
            placeholder="e.g. sk_customer",
        ),
        TransformParam(
            name="separator",
            type="text",
            label="Separator between column values",
            required=False,
            default="|",
            placeholder="e.g. |",
        ),
    ],
)

ALL_TRANSFORMS = [
    EXTRACT_REGEX,
    PAD_STRING,
    SUBSTRING,
    STRING_LENGTH,
    UPPER_LOWER,
    CONCAT_LITERAL,
    HASH_COLUMN,
    SURROGATE_KEY,
]


# ── Codegen Functions ─────────────────────────────────────────────────────────

def codegen_extract_regex(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    pattern = config.get("pattern", "")
    output_name = config.get("output_name", "")

    if not col or not pattern or not output_name:
        return f"SELECT * FROM {input_alias}", None

    # Dremio uses REGEXP_EXTRACT(col, pattern, group_index)
    expr = f"REGEXP_EXTRACT({col}, '{pattern}', 1)"
    sql = f"SELECT *, {expr} AS {output_name} FROM {input_alias}"
    new_cols = list(columns) + [output_name] if columns else None
    return sql, new_cols


def codegen_pad_string(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    direction = config.get("direction", "left")
    length = int(config.get("length", 10))
    fill_char = config.get("fill_char", "0") or "0"

    if not col:
        return f"SELECT * FROM {input_alias}", None

    fn = "LPAD" if direction == "left" else "RPAD"
    expr = f"{fn}(CAST({col} AS VARCHAR), {length}, '{fill_char}')"

    if columns:
        sql = replace_select(columns, {col: expr}, input_alias)
    else:
        sql = f"SELECT * FROM {input_alias}"
    return sql, None


def codegen_substring(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    start = int(config.get("start", 1))
    length = int(config.get("length", 10))
    output_name = config.get("output_name", "").strip() or col

    if not col:
        return f"SELECT * FROM {input_alias}", None

    expr = f"SUBSTR({col}, {start}, {length})"

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


def codegen_string_length(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    output_name = config.get("output_name", "").strip() or f"{col}_length"

    if not col:
        return f"SELECT * FROM {input_alias}", None

    expr = f"LENGTH({col})"
    sql = f"SELECT *, {expr} AS {output_name} FROM {input_alias}"
    new_cols = list(columns) + [output_name] if columns else None
    return sql, new_cols


def codegen_upper_lower(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    cols = config.get("columns", [])
    case = config.get("case", "lower")

    if not cols:
        return f"SELECT * FROM {input_alias}", None

    fn_map = {"upper": "UPPER", "lower": "LOWER", "title": "INITCAP"}
    fn = fn_map.get(case, "LOWER")

    if columns:
        replacements = {c: f"{fn}({c})" for c in cols}
        sql = replace_select(columns, replacements, input_alias)
    else:
        sql = f"SELECT * FROM {input_alias}"
    return sql, None


def codegen_concat_literal(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    prefix = config.get("prefix", "")
    suffix = config.get("suffix", "")
    output_name = config.get("output_name", "").strip() or col

    if not col:
        return f"SELECT * FROM {input_alias}", None

    parts = []
    if prefix:
        parts.append(f"'{prefix}'")
    parts.append(col)
    if suffix:
        parts.append(f"'{suffix}'")

    expr = f"CONCAT({', '.join(parts)})" if len(parts) > 1 else col

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


def codegen_hash_column(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    col = config.get("column", "")
    algorithm = config.get("algorithm", "MD5").upper()
    output_name = config.get("output_name", "").strip() or col

    if not col:
        return f"SELECT * FROM {input_alias}", None

    # Dremio supports MD5(), SHA1(), SHA256()
    fn_map = {"MD5": "MD5", "SHA1": "SHA1", "SHA256": "SHA256"}
    fn = fn_map.get(algorithm, "MD5")
    expr = f"{fn}(CAST({col} AS VARCHAR))"

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


def codegen_surrogate_key(
    config: dict, input_alias: str, columns: list[str] | None = None
) -> tuple[str, list[str] | None]:
    cols = config.get("columns", [])
    output_name = config.get("output_name", "sk").strip() or "sk"
    separator = config.get("separator", "|") or "|"

    if not cols or not output_name:
        return f"SELECT * FROM {input_alias}", None

    concat_parts = []
    for i, col in enumerate(cols):
        if i > 0:
            concat_parts.append(f"'{separator}'")
        concat_parts.append(f"CAST({col} AS VARCHAR)")

    concat_expr = f"CONCAT({', '.join(concat_parts)})"
    expr = f"MD5({concat_expr})"

    sql = f"SELECT *, {expr} AS {output_name} FROM {input_alias}"
    new_cols = list(columns) + [output_name] if columns else None
    return sql, new_cols


# ── Dispatch Table ────────────────────────────────────────────────────────────

CODEGEN_MAP: dict = {
    "extract_regex": codegen_extract_regex,
    "pad_string": codegen_pad_string,
    "substring": codegen_substring,
    "string_length": codegen_string_length,
    "upper_lower": codegen_upper_lower,
    "concat_literal": codegen_concat_literal,
    "hash_column": codegen_hash_column,
    "surrogate_key": codegen_surrogate_key,
}
