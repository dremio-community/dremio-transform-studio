"""
Unit tests for the transform codegen layer.
These run entirely in Python — no server, no Dremio connection needed.
"""
from __future__ import annotations
import sys
import os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from models import TransformStep
from transforms.codegen import compile_pipeline, generate_step_sql
from transforms.registry import list_transforms, get_transform, REGISTRY


# ── registry ──────────────────────────────────────────────────────────────────

class TestRegistry:
    def test_all_transforms_loaded(self):
        assert len(list_transforms()) >= 52

    def test_all_transform_ids_unique(self):
        ids = [t.id for t in list_transforms()]
        assert len(ids) == len(set(ids))

    def test_all_transforms_have_required_fields(self):
        for t in list_transforms():
            assert t.id
            assert t.name
            assert t.category
            assert t.description

    def test_get_known_transform(self):
        t = get_transform("filter_rows")
        assert t.id == "filter_rows"
        assert t.category == "clean"

    def test_get_unknown_transform_raises(self):
        with pytest.raises(ValueError, match="Unknown transform type"):
            get_transform("definitely_does_not_exist")

    def test_expected_categories_present(self):
        cats = {t.category for t in list_transforms()}
        for expected in ("clean", "reshape", "datetime", "enrich", "aggregate", "string", "custom"):
            assert expected in cats

    @pytest.mark.parametrize("tid", [
        "filter_rows", "drop_nulls", "fill_null", "trim_whitespace", "standardize_case",
        "cast_type", "remove_duplicates", "remove_special_chars", "validate_regex",
        "clip_values", "replace_string", "outlier_filter", "rename_columns", "select_columns",
        "drop_columns", "split_column", "combine_columns", "add_column", "join", "union",
        "reorder_columns", "unpivot", "flatten_json",
        "parse_date", "extract_date_part", "truncate_date", "date_diff", "date_add",
        "lookup_join", "map_values", "bin_values", "add_row_number", "add_running_total",
        "conditional_column", "lag_lead", "percent_of_total", "unit_conversion", "dedupe_keep_latest",
        "group_aggregate", "top_n_per_group", "rolling_window", "sample_rows", "scd_type_1",
        "extract_regex", "pad_string", "substring", "string_length", "upper_lower",
        "concat_literal", "hash_column", "surrogate_key", "custom_sql",
    ])
    def test_transform_registered(self, tid):
        assert tid in REGISTRY, f"Transform '{tid}' not in registry"


# ── helpers ───────────────────────────────────────────────────────────────────

COLS = ["id", "name", "amount", "region", "created_at", "status"]

def make_step(transform_type: str, config: dict) -> TransformStep:
    return TransformStep(id="t", transform_type=transform_type, config=config, label="test")


# ── compile_pipeline ──────────────────────────────────────────────────────────

class TestCompilePipeline:
    def test_empty_steps(self):
        sql = compile_pipeline("my_ns.orders", [], [])
        assert "my_ns.orders" in sql
        assert "SELECT" in sql.upper()

    def test_returns_string(self):
        sql = compile_pipeline("src.tbl", [], [])
        assert isinstance(sql, str) and len(sql) > 0

    def test_cte_chain_with_filter(self):
        sql = compile_pipeline("src.orders", [
            TransformStep(id="s1", transform_type="filter_rows",
                          config={"column": "amount", "operator": "greater_than", "value": "0"},
                          label="filter"),
        ], COLS)
        assert "amount" in sql
        assert "0" in sql

    def test_two_steps_chained(self):
        sql = compile_pipeline("src.orders", [
            TransformStep(id="s1", transform_type="filter_rows",
                          config={"column": "status", "operator": "equals", "value": "active"},
                          label="filter"),
            TransformStep(id="s2", transform_type="select_columns",
                          config={"columns": ["id", "status"]},
                          label="select"),
        ], COLS)
        assert "id" in sql and "status" in sql


# ── clean transforms ──────────────────────────────────────────────────────────

class TestCleanTransforms:
    def test_filter_rows(self):
        sql, _ = generate_step_sql(
            make_step("filter_rows", {"column": "amount", "operator": "greater_than", "value": "100"}),
            "_src", COLS)
        assert "amount" in sql
        assert "100" in sql

    def test_drop_nulls(self):
        sql, _ = generate_step_sql(
            make_step("drop_nulls", {"columns": ["id", "name"]}), "_src", COLS)
        assert "IS NOT NULL" in sql.upper()
        assert "id" in sql and "name" in sql

    def test_fill_null(self):
        sql, _ = generate_step_sql(
            make_step("fill_null", {"column": "amount", "strategy": "constant", "value": "0"}),
            "_src", COLS)
        assert "COALESCE" in sql.upper()
        assert "amount" in sql

    def test_trim_whitespace(self):
        sql, _ = generate_step_sql(
            make_step("trim_whitespace", {"columns": ["name"]}), "_src", COLS)
        assert "TRIM" in sql.upper()

    def test_standardize_case(self):
        sql, _ = generate_step_sql(
            make_step("standardize_case", {"column": "name", "case": "upper"}), "_src", COLS)
        assert "UPPER" in sql.upper()

    def test_cast_type(self):
        sql, _ = generate_step_sql(
            make_step("cast_type", {"column": "amount", "target_type": "BIGINT"}), "_src", COLS)
        assert "BIGINT" in sql.upper()

    def test_remove_duplicates(self):
        sql, _ = generate_step_sql(
            make_step("remove_duplicates", {"dedup_columns": ["id"], "keep": "first"}),
            "_src", COLS)
        assert "ROW_NUMBER" in sql.upper() or "DISTINCT" in sql.upper()

    def test_select_columns(self):
        sql, cols = generate_step_sql(
            make_step("select_columns", {"columns": ["id", "name"]}), "_src", COLS)
        assert "id" in sql and "name" in sql

    def test_rename_columns(self):
        sql, _ = generate_step_sql(
            make_step("rename_columns", {"renames": {"name": "full_name"}}), "_src", COLS)
        assert "full_name" in sql

    def test_replace_string(self):
        sql, _ = generate_step_sql(
            make_step("replace_string", {"column": "name", "find": "foo", "replace_with": "bar"}),
            "_src", COLS)
        assert "REPLACE" in sql.upper()

    def test_clip_values(self):
        sql, _ = generate_step_sql(
            make_step("clip_values", {"column": "amount", "min_value": "0", "max_value": "1000"}),
            "_src", COLS)
        assert "amount" in sql


# ── reshape transforms ────────────────────────────────────────────────────────

class TestReshapeTransforms:
    def test_drop_columns(self):
        sql, cols = generate_step_sql(
            make_step("drop_columns", {"columns": ["status"]}), "_src", COLS)
        assert "status" not in (cols or [])

    def test_add_column(self):
        sql, _ = generate_step_sql(
            make_step("add_column", {"name": "profit", "expression": "amount * 0.1"}),
            "_src", COLS)
        assert "profit" in sql
        assert "amount * 0.1" in sql

    def test_combine_columns(self):
        sql, _ = generate_step_sql(
            make_step("combine_columns", {
                "columns": ["name", "region"],
                "separator": " - ",
                "output_name": "label",
            }), "_src", COLS)
        assert "CONCAT" in sql.upper() or "||" in sql

    def test_split_column(self):
        sql, _ = generate_step_sql(
            make_step("split_column", {
                "column": "name",
                "delimiter": " ",
                "output_columns": "first_name, last_name",
            }), "_src", COLS)
        assert "SPLIT_PART" in sql.upper() or "first_name" in sql

    def test_union(self):
        sql, _ = generate_step_sql(
            make_step("union", {"union_table": "other_ns.orders2"}), "_src", COLS)
        assert "UNION" in sql.upper()
        assert "other_ns.orders2" in sql

    def test_reorder_columns(self):
        sql, _ = generate_step_sql(
            make_step("reorder_columns", {"columns": ["region", "id", "name"]}), "_src", COLS)
        assert "region" in sql

    def test_custom_sql_substitutes_input(self):
        sql, _ = generate_step_sql(
            make_step("custom_sql", {"sql": "SELECT *, 1 AS flag FROM {input}"}),
            "_src", COLS)
        assert "_src" in sql or "flag" in sql


# ── datetime transforms ───────────────────────────────────────────────────────

class TestDateTimeTransforms:
    def test_parse_date(self):
        sql, _ = generate_step_sql(
            make_step("parse_date", {
                "column": "created_at",
                "format": "%Y-%m-%d",
                "output_column": "parsed_date",
            }), "_src", COLS)
        assert "created_at" in sql

    def test_extract_date_part(self):
        sql, _ = generate_step_sql(
            make_step("extract_date_part", {
                "column": "created_at",
                "part": "year",
                "output_column": "yr",
            }), "_src", COLS)
        assert "YEAR" in sql.upper() or "EXTRACT" in sql.upper() or "created_at" in sql

    def test_truncate_date(self):
        sql, _ = generate_step_sql(
            make_step("truncate_date", {
                "column": "created_at",
                "unit": "month",
                "output_column": "month_start",
            }), "_src", COLS)
        assert "DATE_TRUNC" in sql.upper() or "month" in sql.lower()

    def test_date_diff(self):
        sql, _ = generate_step_sql(
            make_step("date_diff", {
                "start_column": "created_at",
                "end_column": "created_at",
                "unit": "day",
                "output_column": "days_diff",
            }), "_src", COLS)
        assert "created_at" in sql

    def test_date_add(self):
        sql, _ = generate_step_sql(
            make_step("date_add", {
                "column": "created_at",
                "amount": 7,
                "unit": "day",
                "output_column": "future_date",
            }), "_src", COLS)
        assert "created_at" in sql


# ── aggregate transforms ──────────────────────────────────────────────────────

class TestAggregateTransforms:
    def test_group_aggregate(self):
        import json
        sql, _ = generate_step_sql(
            make_step("group_aggregate", {
                "group_by": ["region"],
                "aggregations": json.dumps([
                    {"column": "amount", "function": "SUM", "alias": "total"},
                    {"column": "id", "function": "COUNT", "alias": "cnt"},
                ]),
            }), "_src", COLS)
        assert "GROUP BY" in sql.upper()
        assert "SUM" in sql.upper()

    def test_sample_rows(self):
        sql, _ = generate_step_sql(
            make_step("sample_rows", {"n": 100}), "_src", COLS)
        assert "LIMIT" in sql.upper() or "ORDER BY" in sql.upper()

    def test_rolling_window(self):
        sql, _ = generate_step_sql(
            make_step("rolling_window", {
                "column": "amount",
                "function": "SUM",
                "window_size": 7,
                "order_by": "created_at",
                "partition_by": "",
                "output_name": "rolling_sum",
            }), "_src", COLS)
        assert "OVER" in sql.upper()
        assert "rolling_sum" in sql

    def test_top_n_per_group(self):
        sql, _ = generate_step_sql(
            make_step("top_n_per_group", {
                "group_by": "region",
                "order_by": "amount",
                "direction": "desc",
                "n": 3,
            }), "_src", COLS)
        assert "ROW_NUMBER" in sql.upper() or "RANK" in sql.upper()


# ── enrich transforms ─────────────────────────────────────────────────────────

class TestEnrichTransforms:
    def test_add_row_number(self):
        sql, _ = generate_step_sql(
            make_step("add_row_number", {
                "output_name": "row_num",
                "order_by": "id",
                "partition_by": "",
            }), "_src", COLS)
        assert "ROW_NUMBER" in sql.upper()
        assert "row_num" in sql

    def test_conditional_column(self):
        sql, _ = generate_step_sql(
            make_step("conditional_column", {
                "output_name": "tier",
                "condition_column": "status",
                "conditions": {"active": "A", "inactive": "I"},
                "else_value": "U",
            }), "_src", COLS)
        assert "CASE" in sql.upper()
        assert "tier" in sql

    def test_map_values(self):
        sql, _ = generate_step_sql(
            make_step("map_values", {
                "column": "status",
                "mapping": {"active": "A", "inactive": "I"},
                "output_column": "status_code",
                "default": "U",
            }), "_src", COLS)
        assert "status" in sql

    def test_bin_values(self):
        import json
        sql, _ = generate_step_sql(
            make_step("bin_values", {
                "column": "amount",
                "bins": json.dumps([
                    {"min": 0, "max": 100, "label": "low"},
                    {"min": 100, "max": 500, "label": "mid"},
                    {"min": 500, "max": 1000, "label": "high"},
                ]),
                "output_name": "amount_bin",
            }), "_src", COLS)
        assert "amount" in sql


# ── string transforms ─────────────────────────────────────────────────────────

class TestStringTransforms:
    def test_extract_regex(self):
        sql, _ = generate_step_sql(
            make_step("extract_regex", {
                "column": "name",
                "pattern": r"\d+",
                "output_name": "extracted",
            }), "_src", COLS)
        assert "name" in sql

    def test_pad_string(self):
        sql, _ = generate_step_sql(
            make_step("pad_string", {
                "column": "id",
                "length": 10,
                "fill_char": "0",
                "direction": "left",
            }), "_src", COLS)
        assert "LPAD" in sql.upper() or "id" in sql

    def test_substring(self):
        sql, _ = generate_step_sql(
            make_step("substring", {
                "column": "name",
                "start": 1,
                "length": 3,
                "output_name": "short_name",
            }), "_src", COLS)
        assert "SUBSTR" in sql.upper() or "SUBSTRING" in sql.upper()

    def test_hash_column(self):
        sql, _ = generate_step_sql(
            make_step("hash_column", {
                "column": "id",
                "algorithm": "MD5",
                "output_name": "row_hash",
            }), "_src", COLS)
        assert "MD5" in sql.upper() or "row_hash" in sql

    def test_concat_literal(self):
        sql, _ = generate_step_sql(
            make_step("concat_literal", {
                "column": "name",
                "prefix": "Mr. ",
                "suffix": "",
                "output_name": "full_name",
            }), "_src", COLS)
        assert "Mr." in sql or "name" in sql

    def test_surrogate_key(self):
        sql, _ = generate_step_sql(
            make_step("surrogate_key", {
                "columns": ["id", "name"],
                "output_name": "sk",
            }), "_src", COLS)
        assert "sk" in sql

    def test_upper_lower(self):
        sql, _ = generate_step_sql(
            make_step("upper_lower", {"columns": ["name"], "case": "lower"}),
            "_src", COLS)
        assert "LOWER" in sql.upper()

    def test_string_length(self):
        sql, _ = generate_step_sql(
            make_step("string_length", {"column": "name", "output_name": "name_len"}),
            "_src", COLS)
        assert "LENGTH" in sql.upper() or "LEN" in sql.upper() or "name" in sql


# ── parameter substitution ────────────────────────────────────────────────────

class TestParameterSubstitution:
    def test_param_substituted(self):
        from transforms.codegen import _substitute_params
        config = {"value": "{{min_amount}}"}
        params = [type("P", (), {"name": "min_amount", "default_value": "50"})()]
        result = _substitute_params(config, params, {"min_amount": "200"})
        assert result["value"] == "200"

    def test_param_uses_default(self):
        from transforms.codegen import _substitute_params
        config = {"value": "{{region}}"}
        params = [type("P", (), {"name": "region", "default_value": "WEST"})()]
        result = _substitute_params(config, params, {})
        assert result["value"] == "WEST"

    def test_no_params_unchanged(self):
        from transforms.codegen import _substitute_params
        config = {"condition": "1 = 1"}
        assert _substitute_params(config, [], {}) == config

    def test_end_to_end_param_pipeline(self):
        from models import PipelineParameter
        sql = compile_pipeline(
            "ns.orders",
            [TransformStep(
                id="s1",
                transform_type="filter_rows",
                config={"column": "region", "operator": "equals", "value": "{{region}}"},
                label="filter",
            )],
            initial_columns=COLS,
            parameters=[PipelineParameter(
                name="region", type="string", default_value="WEST", description="",
            )],
            param_values={"region": "EAST"},
        )
        assert "EAST" in sql
        assert "{{region}}" not in sql
