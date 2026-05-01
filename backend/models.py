from __future__ import annotations
from typing import Any, List, Optional
from pydantic import BaseModel


class PipelineParameter(BaseModel):
    name: str          # e.g. "start_date"
    type: str          # "string", "number", "date", "boolean", "select", "multi_select"
    default_value: str = ""
    description: str = ""
    options: Optional[List[str]] = None  # for select / multi_select types


class TransformParam(BaseModel):
    name: str
    type: str  # "column", "columns", "text", "number", "select", "map", "condition", "boolean"
    label: str
    required: bool = True
    options: Optional[List[str]] = None  # for select type
    default: Any = None
    placeholder: Optional[str] = None


class TransformType(BaseModel):
    id: str
    name: str
    category: str  # "clean", "reshape", "datetime", "enrich", "aggregate"
    description: str
    icon: str  # emoji
    params: List[TransformParam]


class TransformStep(BaseModel):
    id: str  # uuid
    transform_type: str  # references TransformType.id
    config: dict  # user-configured values
    label: Optional[str] = None  # optional user label
    notes: Optional[str] = None  # inline step comment / documentation


# ── Pipeline Tests ────────────────────────────────────────────────────────────

# ── Exposures ─────────────────────────────────────────────────────────────────

class Exposure(BaseModel):
    id: str
    name: str
    url: str
    tool_type: str  # "tableau" | "looker" | "metabase" | "powerbi" | "mode" | "superset" | "redash" | "custom"
    description: Optional[str] = None


# ── Pipeline Tests ────────────────────────────────────────────────────────────

class PipelineTest(BaseModel):
    id: str
    name: str
    test_type: str  # "not_null" | "unique" | "row_count_between" | "accepted_values" | "custom_sql" | "relationships"
    column: Optional[str] = None        # for not_null, unique, accepted_values, relationships
    min_rows: Optional[int] = None      # for row_count_between
    max_rows: Optional[int] = None      # for row_count_between
    values: Optional[List[str]] = None  # for accepted_values
    sql: Optional[str] = None           # for custom_sql (uses {table} placeholder)
    severity: str = "error"             # "error" (blocking) | "warn" (non-blocking)
    filter: Optional[str] = None        # optional WHERE clause to scope any test (e.g. "status = 'active'")
    reference_table: Optional[str] = None   # for relationships: the table to join to
    reference_column: Optional[str] = None  # for relationships: the column in reference_table
    store_failures: bool = False        # if True, CTAS failing rows to a _failures_ table


class TestResult(BaseModel):
    test_id: str
    test_name: str
    test_type: str
    status: str  # "passed" | "failed" | "error"
    message: str
    severity: str = "error"
    failure_table: Optional[str] = None  # set when store_failures=True and test failed


# ── Pipeline ──────────────────────────────────────────────────────────────────

class Pipeline(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    source_table: str  # fully qualified: "namespace.table" or "ns1.ns2.table"
    steps: List[TransformStep]
    output_table: Optional[str] = None
    output_mode: str = "preview"  # "preview", "ctas", "insert", "view", "incremental"
    version: int = 1
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    parameters: List[PipelineParameter] = []
    webhook_token: Optional[str] = None
    # dbt-style features
    dependencies: List[str] = []         # list of upstream pipeline IDs
    incremental_strategy: Optional[str] = None  # "merge" | "append" | "microbatch"
    incremental_key: Optional[str] = None       # key column for merge / timestamp for append/microbatch
    microbatch_window: Optional[str] = None     # "1hour" | "6hour" | "1day" | "1week" (microbatch only)
    tests: List[PipelineTest] = []
    # SCD Type 2
    scd2_key: Optional[str] = None                     # business/natural key column
    scd2_tracked_columns: List[str] = []               # columns to watch for changes (empty = all)
    scd2_effective_from: str = "effective_from"        # column name override
    scd2_effective_to: str = "effective_to"            # column name override
    scd2_is_current: str = "is_current"                # column name override
    # Execution hooks
    pre_hook_sql: Optional[str] = None   # SQL to run before the pipeline executes
    post_hook_sql: Optional[str] = None  # SQL to run after a successful pipeline execute
    # Dremio Load integration — trigger a load job before executing this pipeline
    load_trigger_url: Optional[str] = None    # e.g. http://localhost:7071
    load_trigger_job_id: Optional[str] = None # job id in dremio-load
    # Dremio CDC integration — verify/start CDC engine before executing this pipeline
    cdc_trigger_url: Optional[str] = None     # e.g. http://localhost:8080
    # Exposures — downstream BI consumers
    exposures: List[Exposure] = []
    # Approval workflow
    approval_required: bool = False
    pending_approval_id: Optional[str] = None
    # Ownership & sharing (populated by store)
    user_id: str = "default"
    shared_access: Optional[str] = None   # 'viewer' | 'editor' — set if this pipeline is shared with you
    owner_username: Optional[str] = None  # display name of the pipeline owner
    # Organisation
    folder: Optional[str] = None
    tags: Optional[List[str]] = None
    # GitHub sync status (populated by store)
    github_synced_at: Optional[str] = None
    github_sync_error: Optional[str] = None


class PipelineCreate(BaseModel):
    name: str
    description: Optional[str] = None
    source_table: str
    steps: List[TransformStep] = []
    output_table: Optional[str] = None
    output_mode: str = "preview"
    parameters: List[PipelineParameter] = []
    dependencies: List[str] = []
    incremental_strategy: Optional[str] = None
    incremental_key: Optional[str] = None
    microbatch_window: Optional[str] = None
    tests: List[PipelineTest] = []
    scd2_key: Optional[str] = None
    scd2_tracked_columns: List[str] = []
    scd2_effective_from: str = "effective_from"
    scd2_effective_to: str = "effective_to"
    scd2_is_current: str = "is_current"
    pre_hook_sql: Optional[str] = None
    post_hook_sql: Optional[str] = None
    exposures: List[Exposure] = []
    folder: Optional[str] = None
    tags: Optional[List[str]] = None
    load_trigger_url: Optional[str] = None
    load_trigger_job_id: Optional[str] = None
    cdc_trigger_url: Optional[str] = None


class PipelineSave(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    steps: List[TransformStep]
    output_table: Optional[str] = None
    output_mode: Optional[str] = None
    message: Optional[str] = None  # version commit message
    parameters: Optional[List[PipelineParameter]] = None
    dependencies: Optional[List[str]] = None
    incremental_strategy: Optional[str] = None
    incremental_key: Optional[str] = None
    microbatch_window: Optional[str] = None
    tests: Optional[List[PipelineTest]] = None
    scd2_key: Optional[str] = None
    scd2_tracked_columns: Optional[List[str]] = None
    scd2_effective_from: Optional[str] = None
    scd2_effective_to: Optional[str] = None
    scd2_is_current: Optional[str] = None
    pre_hook_sql: Optional[str] = None
    post_hook_sql: Optional[str] = None
    exposures: Optional[List[Exposure]] = None
    folder: Optional[str] = None
    tags: Optional[List[str]] = None
    load_trigger_url: Optional[str] = None
    load_trigger_job_id: Optional[str] = None
    cdc_trigger_url: Optional[str] = None


class AuditLogEntry(BaseModel):
    id: str
    event_time: str
    user_id: Optional[str] = None
    username: Optional[str] = None
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    resource_name: Optional[str] = None
    details: Optional[str] = None
    ip_address: Optional[str] = None


class PreviewResult(BaseModel):
    columns: List[str]
    rows: List[dict]
    row_count: int
    sql: str  # the generated SQL (for transparency)
    truncated: bool


class ExecuteResult(BaseModel):
    success: bool
    rows_written: Optional[int] = None
    output_table: Optional[str] = None
    sql: str
    error: Optional[str] = None
    duration_ms: Optional[int] = None
    test_results: Optional[List[TestResult]] = None  # populated when tests are defined
    tests_passed: Optional[int] = None
    tests_failed: Optional[int] = None
    blocked_by_tests: bool = False  # True when error-severity tests failed
    metadata_push: Optional[str] = None  # 'sql' | 'rest_catalog:{name}' | 'skipped' | 'failed'
    # Step-level failure attribution (populated via bisection when execute fails)
    failed_step_index: Optional[int] = None   # 0-based index of the step that caused the failure
    failed_step_name: Optional[str] = None    # human-readable label or transform type name
    failed_step_error: Optional[str] = None   # Dremio error specific to that step


# ── DAG Orchestration ─────────────────────────────────────────────────────────

class DagPipelineResult(BaseModel):
    pipeline_id: str
    pipeline_name: str
    success: bool
    rows_written: Optional[int] = None
    duration_ms: Optional[int] = None
    error: Optional[str] = None
    skipped: bool = False  # True if an upstream failure caused this to be skipped


class DagExecuteResult(BaseModel):
    pipeline_results: List[DagPipelineResult]
    total_pipelines: int
    succeeded: int
    failed: int
    skipped: int
    stopped_early: bool


# ── Environments ──────────────────────────────────────────────────────────────

class Environment(BaseModel):
    id: str
    name: str
    host: str
    port: int = 9047
    ssl: bool = False
    auth_type: str = "password"   # "password" | "pat"
    user: str = ""
    password: str = ""
    pat: str = ""
    project_id: str = ""
    is_active: bool = False
    created_at: Optional[str] = None


class EnvironmentCreate(BaseModel):
    name: str
    host: str
    port: int = 9047
    ssl: bool = False
    auth_type: str = "password"
    user: str = ""
    password: str = ""
    pat: str = ""
    project_id: str = ""


# ── Data Seeding ──────────────────────────────────────────────────────────────

class SeedResult(BaseModel):
    success: bool
    table_name: str
    rows_inserted: int
    sql: str
    error: Optional[str] = None


# ── Pipeline Approval Workflow ────────────────────────────────────────────────

class PipelineApproval(BaseModel):
    id: str
    pipeline_id: str
    pipeline_name: str
    proposed_steps: List[Any]
    current_steps: List[Any]
    submitted_by: str
    submitted_at: str
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    status: str = "pending"   # "pending" | "approved" | "rejected"
    comments: Optional[str] = None


class ApprovalReview(BaseModel):
    comments: Optional[str] = None


class SubmitReview(BaseModel):
    steps: List[TransformStep]
    message: Optional[str] = None


# ── Dashboard ─────────────────────────────────────────────────────────────────

class DashboardLastRun(BaseModel):
    status: str
    started_at: str
    completed_at: Optional[str] = None
    row_count: Optional[int] = None
    error_message: Optional[str] = None
    run_type: Optional[str] = None


class DashboardNextRun(BaseModel):
    next_run_at: Optional[str] = None
    cron_expression: Optional[str] = None
    enabled: bool = True


class DashboardPipeline(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    source_table: str
    output_table: Optional[str] = None
    output_mode: str
    updated_at: Optional[str] = None
    created_at: Optional[str] = None
    approval_required: bool = False
    pending_approval_id: Optional[str] = None
    last_run: Optional[DashboardLastRun] = None
    next_run: Optional[DashboardNextRun] = None
    success_rate: Optional[float] = None   # 0.0–1.0; None if never run
    total_runs: int = 0
    health: str = "never_run"              # "healthy" | "degraded" | "failing" | "never_run"
