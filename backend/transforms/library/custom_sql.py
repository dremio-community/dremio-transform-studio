from __future__ import annotations
from models import TransformType, TransformParam

CUSTOM_SQL = TransformType(
    id="custom_sql",
    name="Custom SQL",
    category="custom",
    description="Write any SQL. Reference the previous step as {input}.",
    icon="✏️",
    params=[
        TransformParam(
            name="sql",
            type="text",
            label="SQL",
            required=True,
            placeholder="SELECT * FROM {input}",
        ),
    ],
)

ALL_TRANSFORMS = [CUSTOM_SQL]


def codegen_custom_sql(
    config: dict,
    input_alias: str,
    columns=None,
) -> tuple:
    sql = (config.get("sql") or "").strip()
    if not sql:
        return f"SELECT * FROM {input_alias}", columns
    # Replace {input} placeholder with the actual CTE alias
    return sql.replace("{input}", input_alias), None


CODEGEN_MAP = {"custom_sql": codegen_custom_sql}
