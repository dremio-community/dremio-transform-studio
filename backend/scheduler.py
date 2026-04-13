from __future__ import annotations
import asyncio
import logging
import smtplib
from datetime import datetime, timezone
from email.mime.text import MIMEText
from typing import Optional

import httpx
from croniter import croniter

from store import store
from dremio_client import dremio_client
from catalog_client import catalog_client
from transforms.codegen import compile_pipeline, compile_execute
from alert_runner import run_alert, send_alert_notification
from dag_utils import compute_parallel_levels

logger = logging.getLogger(__name__)


async def send_failure_notification(pipeline_name: str, error_message: str) -> None:
    """Send failure notification via email and/or Slack based on stored settings."""
    try:
        settings = await store.get_notification_settings()
    except Exception as e:
        logger.error(f"Could not load notification settings: {e}")
        return

    subject = f"Transform Studio: Pipeline '{pipeline_name}' failed"
    body = (
        f"Pipeline '{pipeline_name}' failed with the following error:\n\n"
        f"{error_message}\n\n"
        f"Please check Transform Studio for details."
    )

    # Email notification
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
                logger.info(f"Failure notification email sent to {to_addr}")
        except Exception as e:
            logger.error(f"Failed to send email notification: {e}")

    # Slack notification
    if settings.get("notify_slack_enabled") and settings.get("notify_slack_webhook_url"):
        try:
            webhook_url = settings["notify_slack_webhook_url"]
            slack_payload = {
                "text": f":x: *{subject}*\n```{error_message}```"
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(webhook_url, json=slack_payload)
                resp.raise_for_status()
            logger.info("Failure notification sent to Slack")
        except Exception as e:
            logger.error(f"Failed to send Slack notification: {e}")


class PipelineScheduler:
    def __init__(self):
        self._task: Optional[asyncio.Task] = None

    async def start(self):
        self._task = asyncio.create_task(self._run_loop())
        logger.info("Pipeline scheduler started")

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Pipeline scheduler stopped")

    async def _run_loop(self):
        while True:
            try:
                await self._check_and_run()
            except Exception as e:
                logger.error(f"Scheduler error: {e}")
            await asyncio.sleep(60)  # check every minute

    async def _check_and_run(self):
        now = datetime.now(timezone.utc)

        # ── Check alerts ───────────────────────────────────────────────────
        alerts = await store.list_alerts()
        for alert in alerts:
            if not alert.get("enabled"):
                continue
            cron = alert.get("schedule", "")
            last_checked = alert.get("last_checked_at")
            try:
                base = last_checked if last_checked else now
                if isinstance(base, str):
                    from datetime import datetime as _dt
                    base = _dt.fromisoformat(base)
                ct = croniter(cron, base)
                next_run = ct.get_next(datetime)
                if next_run <= now:
                    asyncio.create_task(self._run_alert(alert))
            except Exception as e:
                logger.warning(f"Bad alert cron {cron!r}: {e}")

        # ── Check pipeline schedules (parallel execution) ──────────────────
        schedules = await store.list_schedules()
        due_scheds: list[dict] = []
        for sched in schedules:
            if not sched.get("enabled"):
                continue
            cron = sched.get("cron_expression", "")
            last_run = sched.get("last_run_at")
            try:
                base = last_run if last_run else now
                if isinstance(base, str):
                    from datetime import datetime as _dt
                    base = _dt.fromisoformat(base)
                ct = croniter(cron, base)
                next_run = ct.get_next(datetime)
                if next_run <= now:
                    due_scheds.append(sched)
            except Exception as e:
                logger.warning(f"Bad cron expression {cron!r}: {e}")

        if due_scheds:
            asyncio.create_task(self._run_due_pipelines_parallel(due_scheds))

    async def _run_alert(self, alert: dict):
        alert_id = alert["id"]
        alert_name = alert.get("name", alert_id)
        logger.info(f"Evaluating alert '{alert_name}'")
        try:
            status, message = await run_alert(alert, store, dremio_client)
            await store.record_alert_check(alert_id, alert_name, status, message)
            if status == "triggered":
                logger.warning(f"Alert '{alert_name}' triggered: {message}")
                if alert.get("notify_email") or alert.get("notify_slack"):
                    try:
                        notif_settings = await store.get_notification_settings()
                        # Override with alert-level flags
                        if not alert.get("notify_email"):
                            notif_settings["notify_email_enabled"] = False
                        if not alert.get("notify_slack"):
                            notif_settings["notify_slack_enabled"] = False
                        await send_alert_notification(alert_name, message, notif_settings)
                    except Exception as e:
                        logger.error(f"Alert notification failed: {e}")
            else:
                logger.info(f"Alert '{alert_name}' status={status}: {message}")
        except Exception as e:
            logger.error(f"Alert '{alert_name}' evaluation error: {e}")
            await store.record_alert_check(alert_id, alert_name, "error", str(e))

    async def _run_due_pipelines_parallel(self, due_scheds: list[dict]):
        """
        Execute a batch of due schedules respecting DAG dependencies.

        Algorithm:
          1. Fetch all pipeline records to build the dependency map.
          2. Filter to only the pipelines that are due this tick.
          3. Compute parallel execution levels using the DAG (topological sort
             grouped into levels that can run concurrently).
          4. For each level: run all pipelines in that level in parallel with
             asyncio.gather(), then wait for all to finish before the next level.

        Pipelines NOT scheduled this tick are ignored — their deps don't block
        the currently-due pipelines.
        """
        if not due_scheds:
            return

        # Map schedule → pipeline_id
        sched_by_pipeline = {s["pipeline_id"]: s for s in due_scheds}
        due_pipeline_ids = set(sched_by_pipeline.keys())

        # Fetch pipeline objects for due pipelines only, to build dep subgraph
        all_pipelines = await store.list_pipelines()
        due_pipelines = [
            {"id": p.id, "name": p.name, "dependencies": p.dependencies or []}
            for p in all_pipelines
            if p.id in due_pipeline_ids
        ]

        # Restrict dependencies to only the due set (don't block on non-due pipelines)
        for p in due_pipelines:
            p["dependencies"] = [d for d in p["dependencies"] if d in due_pipeline_ids]

        levels = compute_parallel_levels(due_pipelines)
        total = len(due_pipeline_ids)
        n_levels = len(levels)
        logger.info(
            f"Parallel scheduler: {total} pipeline(s) in {n_levels} level(s): "
            + " | ".join(f"L{i}=[{','.join(ids[:3])}{'...' if len(ids)>3 else ''}]" for i, ids in enumerate(levels))
        )

        for level_idx, level_ids in enumerate(levels):
            logger.info(f"Executing level {level_idx}: {level_ids}")
            tasks = [
                self._run_pipeline(sched_by_pipeline[pid])
                for pid in level_ids
                if pid in sched_by_pipeline
            ]
            if tasks:
                # Run all pipelines in this level concurrently, collect results
                results = await asyncio.gather(*tasks, return_exceptions=True)
                for pid, res in zip(level_ids, results):
                    if isinstance(res, Exception):
                        logger.error(f"Pipeline {pid} raised an unexpected exception: {res}")

    async def _run_pipeline(self, sched: dict):
        """Execute a single scheduled pipeline and record results."""
        schedule_id = sched["id"]
        pipeline_id = sched["pipeline_id"]
        logger.info(f"Running scheduled pipeline {pipeline_id}")
        pipeline_name = pipeline_id
        started_at = datetime.now(timezone.utc).isoformat()
        try:
            pipeline = await store.get_pipeline(pipeline_id)
            if pipeline is None:
                error_msg = "Pipeline not found"
                completed_at = datetime.now(timezone.utc).isoformat()
                await store.record_schedule_run(schedule_id, "failed", error_msg)
                await store.log_run(
                    pipeline_id=pipeline_id, pipeline_name=pipeline_name,
                    run_type="scheduled", status="failed",
                    row_count=None, error_message=error_msg,
                    started_at=started_at, completed_at=completed_at,
                )
                await send_failure_notification(pipeline_name, error_msg)
                return

            pipeline_name = pipeline.name
            mode = pipeline.output_mode or "preview"
            output_table = pipeline.output_table or ""

            # Fetch schema for codegen
            parts = pipeline.source_table.rsplit(".", 1)
            initial_columns: list[str] = []
            if len(parts) == 2:
                try:
                    fields = await catalog_client.get_table_schema(parts[0], parts[1])
                    initial_columns = [f["name"] for f in fields]
                except Exception:
                    pass

            # Compile the right SQL based on mode
            if mode in ("ctas", "insert", "view") and output_table:
                sql = compile_execute(
                    pipeline.source_table, pipeline.steps, output_table, mode,
                    initial_columns=initial_columns or None,
                    parameters=pipeline.parameters,
                )
            else:
                # preview / no output table → just validate by running the SELECT
                sql = compile_pipeline(
                    pipeline.source_table, pipeline.steps,
                    initial_columns=initial_columns or None,
                    parameters=pipeline.parameters,
                )

            await dremio_client.run_query(sql)
            completed_at = datetime.now(timezone.utc).isoformat()
            await store.record_schedule_run(schedule_id, "success")
            await store.log_run(
                pipeline_id=pipeline_id, pipeline_name=pipeline_name,
                run_type="scheduled", status="success",
                row_count=None, error_message=None,
                started_at=started_at, completed_at=completed_at,
            )
            logger.info(f"Scheduled pipeline {pipeline_id} ({pipeline_name}) completed OK")

        except Exception as e:
            error_msg = str(e)
            completed_at = datetime.now(timezone.utc).isoformat()
            await store.record_schedule_run(schedule_id, "failed", error_msg)
            await store.log_run(
                pipeline_id=pipeline_id, pipeline_name=pipeline_name,
                run_type="scheduled", status="failed",
                row_count=None, error_message=error_msg,
                started_at=started_at, completed_at=completed_at,
            )
            logger.error(f"Scheduled pipeline {pipeline_id} failed: {e}")
            await send_failure_notification(pipeline_name, error_msg)


scheduler = PipelineScheduler()
