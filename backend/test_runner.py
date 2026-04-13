"""
test_runner.py — Pipeline test execution

Runs data quality tests against a Dremio output table after a pipeline executes.

Test types:
  not_null         — column has no NULL values
  unique           — column values are all distinct
  row_count_between — table row count is within [min_rows, max_rows]
  accepted_values  — column only contains values in the provided list
  custom_sql       — arbitrary SQL returning 0 rows = pass, >0 rows = fail
                     use {table} placeholder in SQL for the output table name
  relationships    — column values all exist in a reference table (FK integrity)
                     checks: SELECT a.col FROM table a LEFT JOIN ref b ON a.col = b.ref_col WHERE b.ref_col IS NULL

All tests support an optional `filter` field: a SQL predicate (no WHERE keyword) that
scopes the test to a subset of rows, e.g. filter="status = 'active'".

store_failures: when True and a test fails, the failing rows are CTAS'd to a
  _failures_{sanitized_test_name} table in the same namespace as the output table.
  The table name is returned in TestResult.failure_table.
"""
from __future__ import annotations
import re
from typing import List, Optional

from models import PipelineTest, TestResult


async def run_pipeline_tests(
    tests: List[PipelineTest],
    output_table: str,
    dremio_client,
) -> List[TestResult]:
    """
    Run all tests against `output_table` using `dremio_client.run_query()`.
    Returns a list of TestResult objects.
    Each test is independent — one failure does not stop subsequent tests.
    """
    results: List[TestResult] = []
    for test in tests:
        result = await _run_single_test(test, output_table, dremio_client)
        results.append(result)
    return results


async def _run_single_test(
    test: PipelineTest,
    output_table: str,
    dremio_client,
) -> TestResult:
    try:
        if test.test_type == "not_null":
            result = await _test_not_null(test, output_table, dremio_client)
        elif test.test_type == "unique":
            result = await _test_unique(test, output_table, dremio_client)
        elif test.test_type == "row_count_between":
            result = await _test_row_count_between(test, output_table, dremio_client)
        elif test.test_type == "accepted_values":
            result = await _test_accepted_values(test, output_table, dremio_client)
        elif test.test_type == "custom_sql":
            result = await _test_custom_sql(test, output_table, dremio_client)
        elif test.test_type == "relationships":
            result = await _test_relationships(test, output_table, dremio_client)
        else:
            result = ("error", f"Unknown test type: {test.test_type!r}", None)
    except Exception as e:
        result = ("error", f"Test execution error: {str(e)}", None)

    status, message, failure_sql = result

    # Store failing rows if requested
    failure_table: Optional[str] = None
    if test.store_failures and status == "failed" and failure_sql:
        try:
            failure_table = _failure_table_name(output_table, test.name)
            # Drop existing failure table first (ignore errors if it doesn't exist)
            try:
                await dremio_client.run_ddl(f"DROP TABLE IF EXISTS {failure_table}")
            except Exception:
                pass
            ctas_sql = f"CREATE TABLE {failure_table} AS\n{failure_sql}"
            await dremio_client.run_ddl(ctas_sql)
        except Exception:
            # Don't let failure storage errors affect the test result
            failure_table = None

    return TestResult(
        test_id=test.id,
        test_name=test.name,
        test_type=test.test_type,
        status=status,
        message=message,
        severity=test.severity,
        failure_table=failure_table,
    )


# ── Naming helpers ────────────────────────────────────────────────────────────

def _failure_table_name(output_table: str, test_name: str) -> str:
    """
    Derive a failure table name from the output table's namespace and test name.
    e.g. output_table="marks_work.customers", test_name="FK: order_id check"
         → "marks_work._failures_fk_order_id_check"
    """
    parts = output_table.split(".")
    namespace = ".".join(parts[:-1]) if len(parts) > 1 else ""
    safe = re.sub(r"[^a-z0-9]+", "_", test_name.lower().strip())
    safe = safe.strip("_")[:50] or "test"
    table_part = f"_failures_{safe}"
    return f"{namespace}.{table_part}" if namespace else table_part


# ── WHERE clause helpers ──────────────────────────────────────────────────────

def _where_clause(base_condition: str, filter_expr: Optional[str]) -> str:
    """
    Build a WHERE clause combining a mandatory condition and an optional user filter.
    base_condition should NOT include the WHERE keyword.
    Returns the full WHERE clause including the keyword.
    """
    if filter_expr and filter_expr.strip():
        return f"WHERE ({filter_expr.strip()}) AND ({base_condition})"
    return f"WHERE {base_condition}"


def _filter_only(filter_expr: Optional[str]) -> str:
    """Return a WHERE clause for just the user filter, or empty string."""
    if filter_expr and filter_expr.strip():
        return f"WHERE ({filter_expr.strip()})"
    return ""


# ── Test implementations ──────────────────────────────────────────────────────
# Each returns (status, message, failure_rows_sql | None)
# failure_rows_sql is the SELECT that returns only the failing rows (for CTAS)

async def _test_not_null(test: PipelineTest, table: str, client) -> tuple:
    col = test.column
    if not col:
        return ("error", "Test misconfigured: column is required for not_null test", None)
    where = _where_clause(f"{col} IS NULL", test.filter)
    sql = f"SELECT COUNT(*) AS _cnt FROM {table} {where}"
    rows = await client.run_query(sql)
    null_count = int(rows[0]["_cnt"]) if rows else 0
    scope = f" (filter: {test.filter})" if test.filter else ""
    if null_count == 0:
        return ("passed", f"Column '{col}' has no NULL values{scope}", None)
    failure_sql = f"SELECT * FROM {table} {where}"
    return ("failed", f"Column '{col}' has {null_count} NULL value(s){scope}", failure_sql)


async def _test_unique(test: PipelineTest, table: str, client) -> tuple:
    col = test.column
    if not col:
        return ("error", "Test misconfigured: column is required for unique test", None)
    filter_clause = _filter_only(test.filter)
    sql = (
        f"SELECT COUNT(*) AS _total, COUNT(DISTINCT {col}) AS _distinct "
        f"FROM {table} {filter_clause}"
    )
    rows = await client.run_query(sql)
    scope = f" (filter: {test.filter})" if test.filter else ""
    if not rows:
        return ("passed", f"Column '{col}' is unique (empty table){scope}", None)
    total = int(rows[0]["_total"])
    distinct = int(rows[0]["_distinct"])
    if total == distinct:
        return ("passed", f"Column '{col}' has {total} unique values{scope}", None)
    dupes = total - distinct
    # Failure rows = records with duplicate values
    failure_sql = (
        f"SELECT * FROM {table} {filter_clause} "
        f"WHERE {col} IN ("
        f"SELECT {col} FROM {table} {filter_clause} "
        f"GROUP BY {col} HAVING COUNT(*) > 1)"
    )
    return ("failed", f"Column '{col}' has {dupes} duplicate value(s) ({total} rows, {distinct} distinct){scope}", failure_sql)


async def _test_row_count_between(test: PipelineTest, table: str, client) -> tuple:
    filter_clause = _filter_only(test.filter)
    sql = f"SELECT COUNT(*) AS _cnt FROM {table} {filter_clause}"
    rows = await client.run_query(sql)
    count = int(rows[0]["_cnt"]) if rows else 0
    min_r = test.min_rows
    max_r = test.max_rows
    scope = f" (filter: {test.filter})" if test.filter else ""
    if min_r is not None and count < min_r:
        # No individual "failing rows" for row count tests — store_failures not applicable
        return ("failed", f"Row count {count} is below minimum {min_r}{scope}", None)
    if max_r is not None and count > max_r:
        return ("failed", f"Row count {count} exceeds maximum {max_r}{scope}", None)
    return ("passed", f"Row count {count} is within expected range [{min_r}, {max_r}]{scope}", None)


async def _test_accepted_values(test: PipelineTest, table: str, client) -> tuple:
    col = test.column
    if not col:
        return ("error", "Test misconfigured: column is required for accepted_values test", None)
    accepted = test.values or []
    if not accepted:
        return ("error", "Test misconfigured: values list is empty for accepted_values test", None)
    quoted = ", ".join(f"'{v}'" for v in accepted)
    base_condition = f"CAST({col} AS VARCHAR) NOT IN ({quoted})"
    where = _where_clause(base_condition, test.filter)
    sql = f"SELECT COUNT(*) AS _cnt FROM {table} {where}"
    rows = await client.run_query(sql)
    bad_count = int(rows[0]["_cnt"]) if rows else 0
    scope = f" (filter: {test.filter})" if test.filter else ""
    if bad_count == 0:
        return ("passed", f"Column '{col}' only contains accepted values{scope}", None)
    failure_sql = f"SELECT * FROM {table} {where}"
    return ("failed", f"Column '{col}' has {bad_count} row(s) with unaccepted values{scope}", failure_sql)


async def _test_custom_sql(test: PipelineTest, table: str, client) -> tuple:
    sql = (test.sql or "").strip()
    if not sql:
        return ("error", "Test misconfigured: sql is required for custom_sql test", None)
    sql = sql.replace("{table}", table)
    rows = await client.run_query(sql)
    row_count = len(rows)
    if row_count == 0:
        return ("passed", "Custom SQL test returned 0 rows (pass)", None)
    # The custom SQL itself IS the failure rows query
    return ("failed", f"Custom SQL test returned {row_count} row(s) (fail — expected 0)", sql)


async def _test_relationships(test: PipelineTest, table: str, client) -> tuple:
    """
    Referential integrity check: every value in table.column must exist in
    reference_table.reference_column.

    SQL: SELECT COUNT(*) AS _cnt
         FROM {table} a
         LEFT JOIN {reference_table} b ON a.{column} = b.{reference_column}
         WHERE b.{reference_column} IS NULL [AND ({filter})]
    """
    col = test.column
    ref_table = test.reference_table
    ref_col = test.reference_column

    if not col:
        return ("error", "Test misconfigured: column is required for relationships test", None)
    if not ref_table:
        return ("error", "Test misconfigured: reference_table is required for relationships test", None)
    if not ref_col:
        return ("error", "Test misconfigured: reference_column is required for relationships test", None)

    base_condition = f"b.{ref_col} IS NULL"
    filter_part = f" AND ({test.filter.strip()})" if test.filter and test.filter.strip() else ""

    sql = (
        f"SELECT COUNT(*) AS _cnt "
        f"FROM {table} a "
        f"LEFT JOIN {ref_table} b ON a.{col} = b.{ref_col} "
        f"WHERE {base_condition}{filter_part}"
    )
    rows = await client.run_query(sql)
    orphan_count = int(rows[0]["_cnt"]) if rows else 0
    scope = f" (filter: {test.filter})" if test.filter else ""

    if orphan_count == 0:
        return ("passed", f"All values in '{col}' exist in {ref_table}.{ref_col}{scope}", None)

    failure_sql = (
        f"SELECT a.* "
        f"FROM {table} a "
        f"LEFT JOIN {ref_table} b ON a.{col} = b.{ref_col} "
        f"WHERE {base_condition}{filter_part}"
    )
    return (
        "failed",
        f"{orphan_count} value(s) in '{col}' not found in {ref_table}.{ref_col}{scope}",
        failure_sql,
    )


def summarize_results(results: List[TestResult]) -> dict:
    """Returns { passed, failed, errors, blocking_failures }"""
    passed = sum(1 for r in results if r.status == "passed")
    failed = sum(1 for r in results if r.status == "failed")
    errors = sum(1 for r in results if r.status == "error")
    blocking = sum(1 for r in results if r.status in ("failed", "error") and r.severity == "error")
    return {
        "passed": passed,
        "failed": failed,
        "errors": errors,
        "blocking_failures": blocking,
    }
