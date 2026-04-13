from __future__ import annotations
import json
import logging
import smtplib
from datetime import datetime, timezone, timedelta
from email.mime.text import MIMEText
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


# ── Notification helpers ──────────────────────────────────────────────────────

async def send_alert_notification(alert_name: str, message: str, settings: dict) -> None:
    """Send alert notification via email and/or Slack."""
    subject = f"Transform Studio Alert: '{alert_name}' triggered"
    body = (
        f"Alert '{alert_name}' has been triggered:\n\n"
        f"{message}\n\n"
        f"Please check Transform Studio for details."
    )

    if settings.get("notify_email_enabled") and settings.get("notify_email_smtp_host"):
        try:
            smtp_host = settings["notify_email_smtp_host"]
            smtp_port = int(settings.get("notify_email_smtp_port") or 587)
            smtp_user = settings.get("notify_email_smtp_user", "")
            smtp_pass = settings.get("notify_email_smtp_pass", "")
            from_addr = settings.get("notify_email_from", smtp_user)
            to_addr = settings.get("notify_email_to", "")
            if to_addr:
                msg = MIMEText(body)
                msg["Subject"] = subject
                msg["From"] = from_addr
                msg["To"] = to_addr
                with smtplib.SMTP(smtp_host, smtp_port) as server:
                    server.starttls()
                    if smtp_user and smtp_pass:
                        server.login(smtp_user, smtp_pass)
                    server.sendmail(from_addr, [to_addr], msg.as_string())
        except Exception as e:
            logger.error(f"Alert email failed: {e}")

    if settings.get("notify_slack_enabled") and settings.get("notify_slack_webhook_url"):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    settings["notify_slack_webhook_url"],
                    json={"text": f":warning: *{subject}*\n{message}"},
                )
        except Exception as e:
            logger.error(f"Alert Slack notification failed: {e}")


# ── SQL alert ─────────────────────────────────────────────────────────────────

async def evaluate_sql_alert(config: dict, dremio_client) -> tuple[bool, str]:
    """
    Run SQL and check condition.
    config keys:
      sql: str
      condition: 'rows_returned > 0' | 'value > N' | 'value < N' | 'value changed'
      value_column: str  (for value conditions, which column holds the number)
      last_value: float | None  (stored for 'value changed' detection)
    """
    sql = config.get("sql", "").strip()
    condition = config.get("condition", "rows_returned > 0")
    value_column = config.get("value_column", "")

    if not sql:
        return False, "No SQL configured"

    try:
        rows = await dremio_client.run_query(sql)
    except Exception as e:
        return False, f"Query error: {e}"

    if condition == "rows_returned > 0":
        if rows:
            return True, f"{len(rows)} row(s) returned by alert query"
        return False, "No rows returned"

    # Value-based conditions: read first row, first numeric column
    if not rows:
        return False, "Query returned no rows — cannot evaluate value condition"

    first_row = rows[0]
    # Resolve value
    if value_column and value_column in first_row:
        raw_val = first_row[value_column]
    else:
        # Use first column
        raw_val = next(iter(first_row.values()), None)

    try:
        current_value = float(raw_val) if raw_val is not None else 0.0
    except (TypeError, ValueError):
        return False, f"Column value {raw_val!r} is not numeric"

    if condition.startswith("value > "):
        threshold = float(condition.split(">")[1].strip())
        triggered = current_value > threshold
        return triggered, f"Value {current_value} {'>' if triggered else '<='} {threshold}"

    if condition.startswith("value < "):
        threshold = float(condition.split("<")[1].strip())
        triggered = current_value < threshold
        return triggered, f"Value {current_value} {'<' if triggered else '>='} {threshold}"

    if condition == "value changed":
        last_value = config.get("last_value")
        if last_value is None:
            # First run — record but don't trigger
            return False, f"Baseline recorded: {current_value}"
        last_f = float(last_value)
        if current_value != last_f:
            return True, f"Value changed from {last_f} to {current_value}"
        return False, f"Value unchanged at {current_value}"

    return False, f"Unknown condition: {condition}"


# ── Pipeline health alert ─────────────────────────────────────────────────────

async def evaluate_pipeline_health_alert(config: dict, store) -> tuple[bool, str]:
    """
    Check recent pipeline runs for health conditions.
    config keys:
      pipeline_id: str
      pipeline_name: str
      check_failure: bool
      check_duration: bool
      duration_threshold_secs: int
      check_row_count_change: bool
      row_count_change_pct: float
      check_not_run: bool
      not_run_hours: int
    """
    pipeline_id = config.get("pipeline_id", "")
    if not pipeline_id:
        return False, "No pipeline configured"

    runs = await store.get_pipeline_runs(pipeline_id, limit=5)
    messages = []
    triggered = False

    if not runs:
        if config.get("check_not_run"):
            return True, "Pipeline has never run"
        return False, "No runs found"

    latest = runs[0]

    # Check failure
    if config.get("check_failure") and latest.get("status") == "failed":
        triggered = True
        messages.append(f"Last run failed: {latest.get('error_message', 'unknown error')}")

    # Check duration
    if config.get("check_duration"):
        threshold = int(config.get("duration_threshold_secs", 300))
        started = latest.get("started_at")
        completed = latest.get("completed_at")
        if started and completed:
            try:
                s = datetime.fromisoformat(started)
                c = datetime.fromisoformat(completed)
                duration_secs = (c - s).total_seconds()
                if duration_secs > threshold:
                    triggered = True
                    messages.append(f"Run duration {duration_secs:.0f}s exceeded threshold {threshold}s")
            except Exception:
                pass

    # Check row count change
    if config.get("check_row_count_change") and len(runs) >= 2:
        pct_threshold = float(config.get("row_count_change_pct", 20))
        r0 = latest.get("row_count")
        r1 = runs[1].get("row_count")
        if r0 is not None and r1 is not None and r1 > 0:
            change_pct = abs(r0 - r1) / r1 * 100
            if change_pct > pct_threshold:
                triggered = True
                messages.append(f"Row count changed by {change_pct:.1f}% ({r1} → {r0})")

    # Check not run recently
    if config.get("check_not_run"):
        not_run_hours = int(config.get("not_run_hours", 24))
        last_run_at = latest.get("started_at") or latest.get("completed_at")
        if last_run_at:
            try:
                last_dt = datetime.fromisoformat(last_run_at)
                if last_dt.tzinfo is None:
                    last_dt = last_dt.replace(tzinfo=timezone.utc)
                age_hours = (datetime.now(timezone.utc) - last_dt).total_seconds() / 3600
                if age_hours > not_run_hours:
                    triggered = True
                    messages.append(f"Pipeline hasn't run in {age_hours:.1f}h (threshold: {not_run_hours}h)")
            except Exception:
                pass

    if not messages:
        return False, "All health checks passed"
    return triggered, "; ".join(messages)


# ── Data quality alert ────────────────────────────────────────────────────────

async def evaluate_data_quality_alert(config: dict, dremio_client) -> tuple[bool, str]:
    """
    Run data quality checks against a table.
    config keys:
      table: str
      checks: list of check dicts
        { type: 'row_count_min', value: N }
        { type: 'row_count_max', value: N }
        { type: 'null_rate_max', column: str, pct: float }
        { type: 'custom_sql', sql: str, condition: str }
    """
    table = config.get("table", "").strip()
    checks = config.get("checks", [])

    if not table:
        return False, "No table configured"
    if not checks:
        return False, "No checks configured"

    failures = []
    passes = []

    for check in checks:
        check_type = check.get("type")
        try:
            if check_type == "row_count_min":
                rows = await dremio_client.run_query(f"SELECT COUNT(*) AS cnt FROM {table}")
                count = int(rows[0]["cnt"]) if rows else 0
                threshold = int(check.get("value", 0))
                if count < threshold:
                    failures.append(f"Row count {count} < min {threshold}")
                else:
                    passes.append(f"Row count {count} >= min {threshold}")

            elif check_type == "row_count_max":
                rows = await dremio_client.run_query(f"SELECT COUNT(*) AS cnt FROM {table}")
                count = int(rows[0]["cnt"]) if rows else 0
                threshold = int(check.get("value", 0))
                if count > threshold:
                    failures.append(f"Row count {count} > max {threshold}")
                else:
                    passes.append(f"Row count {count} <= max {threshold}")

            elif check_type == "null_rate_max":
                col = check.get("column", "")
                max_pct = float(check.get("pct", 5.0))
                rows = await dremio_client.run_query(
                    f"SELECT COUNT(*) AS total, SUM(CASE WHEN {col} IS NULL THEN 1 ELSE 0 END) AS nulls FROM {table}"
                )
                if rows:
                    total = int(rows[0].get("total") or 0)
                    nulls = int(rows[0].get("nulls") or 0)
                    null_pct = (nulls / total * 100) if total > 0 else 0
                    if null_pct > max_pct:
                        failures.append(f"Column '{col}' null rate {null_pct:.1f}% > max {max_pct}%")
                    else:
                        passes.append(f"Column '{col}' null rate {null_pct:.1f}% OK")

            elif check_type == "custom_sql":
                custom_sql = check.get("sql", "").replace("{table}", table)
                condition = check.get("condition", "rows_returned > 0")
                result_rows = await dremio_client.run_query(custom_sql)
                if condition == "rows_returned > 0" and result_rows:
                    failures.append(f"Custom check returned {len(result_rows)} row(s)")
                elif condition == "rows_returned > 0":
                    passes.append("Custom SQL check passed (no rows)")

        except Exception as e:
            failures.append(f"Check '{check_type}' error: {e}")

    if failures:
        return True, "; ".join(failures)
    return False, f"All {len(passes)} check(s) passed"


# ── Source freshness alert ────────────────────────────────────────────────────

async def evaluate_source_freshness_alert(config: dict, dremio_client) -> tuple[bool, str]:
    """
    Check whether a source table's data is fresh by comparing MAX(timestamp_column) to now.
    config keys:
      table: str                 — fully qualified table name
      timestamp_column: str      — column holding load/update timestamp
      warn_after_hours: float    — trigger if data is older than this many hours
      error_after_hours: float   — (informational) same threshold but labelled error-level
    """
    table = config.get("table", "").strip()
    ts_col = config.get("timestamp_column", "").strip()
    warn_hours = float(config.get("warn_after_hours") or 24)
    error_hours = float(config.get("error_after_hours") or warn_hours)

    if not table:
        return False, "No table configured"
    if not ts_col:
        return False, "No timestamp column configured"

    try:
        rows = await dremio_client.run_query(
            f"SELECT MAX({ts_col}) AS _last_loaded FROM {table}"
        )
    except Exception as e:
        return False, f"Query error: {e}"

    if not rows or rows[0].get("_last_loaded") is None:
        return True, f"Table {table} has no data (MAX({ts_col}) is NULL)"

    raw = rows[0]["_last_loaded"]
    try:
        if isinstance(raw, str):
            last_loaded = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        else:
            last_loaded = raw
        if getattr(last_loaded, "tzinfo", None) is None:
            last_loaded = last_loaded.replace(tzinfo=timezone.utc)
        age_hours = (datetime.now(timezone.utc) - last_loaded).total_seconds() / 3600
    except Exception as e:
        return False, f"Could not parse timestamp value {raw!r}: {e}"

    if age_hours >= error_hours:
        return True, (
            f"Data is {age_hours:.1f}h old — exceeds error threshold of {error_hours}h "
            f"(last loaded: {raw})"
        )
    if age_hours >= warn_hours:
        return True, (
            f"Data is {age_hours:.1f}h old — exceeds warning threshold of {warn_hours}h "
            f"(last loaded: {raw})"
        )
    return False, (
        f"Data is fresh — {age_hours:.1f}h old, threshold is {warn_hours}h "
        f"(last loaded: {raw})"
    )


# ── Main evaluator ────────────────────────────────────────────────────────────

async def run_alert(alert: dict, store, dremio_client) -> tuple[str, str]:
    """
    Evaluate one alert. Returns (status, message) where status is 'ok'|'triggered'|'error'.
    Also saves a baseline 'last_value' for SQL value-changed alerts.
    """
    alert_type = alert.get("alert_type")
    try:
        config = json.loads(alert.get("config_json", "{}"))
    except Exception:
        config = {}

    try:
        if alert_type == "sql":
            triggered, message = await evaluate_sql_alert(config, dremio_client)
            # Update last_value in config for 'value changed' tracking
            if config.get("condition") == "value changed" and not triggered:
                # Extract current value from message "Baseline recorded: X" or "Value unchanged at X"
                try:
                    val_str = message.split(":")[-1].strip()
                    config["last_value"] = float(val_str)
                    await store.update_alert(alert["id"], {"config_json": json.dumps(config)})
                except Exception:
                    pass

        elif alert_type == "pipeline_health":
            triggered, message = await evaluate_pipeline_health_alert(config, store)

        elif alert_type == "data_quality":
            triggered, message = await evaluate_data_quality_alert(config, dremio_client)

        elif alert_type == "source_freshness":
            triggered, message = await evaluate_source_freshness_alert(config, dremio_client)

        else:
            return "error", f"Unknown alert type: {alert_type}"

        status = "triggered" if triggered else "ok"
        return status, message

    except Exception as e:
        return "error", str(e)
