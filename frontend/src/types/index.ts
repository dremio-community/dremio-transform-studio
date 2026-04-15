export interface PipelineParameter {
  name: string
  type: 'string' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select'
  default_value: string
  description: string
  options?: string[]  // for select / multi_select
}

export interface TransformParam {
  name: string
  type: 'column' | 'columns' | 'text' | 'number' | 'select' | 'map' | 'condition' | 'boolean'
  label: string
  required?: boolean
  options?: string[]
  default?: unknown
  placeholder?: string
}

export interface TransformType {
  id: string
  name: string
  category: 'clean' | 'reshape' | 'datetime' | 'enrich' | 'aggregate' | 'string' | 'custom'
  description: string
  icon: string
  params: TransformParam[]
}

export type AlertType = 'sql' | 'pipeline_health' | 'data_quality' | 'source_freshness'
export type AlertStatus = 'ok' | 'triggered' | 'error'

export interface Alert {
  id: string
  name: string
  description: string
  alert_type: AlertType
  config_json: string
  schedule: string
  enabled: boolean
  notify_email: boolean
  notify_slack: boolean
  last_checked_at?: string
  last_status?: AlertStatus
  last_message?: string
  last_triggered_at?: string
  created_at: string
  updated_at: string
}

export interface AlertHistory {
  id: string
  alert_id: string
  alert_name: string
  status: AlertStatus
  message: string
  checked_at: string
}

// ── Alert configs (typed helpers for building config_json) ───────────────────

export interface SqlAlertConfig {
  sql: string
  condition: 'rows_returned > 0' | 'value > N' | 'value < N' | 'value changed'
  value_column?: string
  threshold?: number
  last_value?: number
}

export interface PipelineHealthConfig {
  pipeline_id: string
  pipeline_name: string
  check_failure: boolean
  check_duration: boolean
  duration_threshold_secs: number
  check_row_count_change: boolean
  row_count_change_pct: number
  check_not_run: boolean
  not_run_hours: number
}

export interface DataQualityCheck {
  type: 'row_count_min' | 'row_count_max' | 'null_rate_max' | 'custom_sql'
  value?: number
  column?: string
  pct?: number
  sql?: string
  condition?: string
}

export interface DataQualityConfig {
  table: string
  checks: DataQualityCheck[]
}

export interface SourceFreshnessConfig {
  table: string
  timestamp_column: string
  warn_after_hours: number
  error_after_hours: number
}

export interface CustomTransformTemplate {
  id: string
  name: string
  description: string
  sql_template: string
  tags: string
  created_at: string
  updated_at: string
  use_count: number
}

export interface TransformStep {
  id: string
  transform_type: string
  config: Record<string, unknown>
  label?: string
  notes?: string
}

// ── Exposures ─────────────────────────────────────────────────────────────────

export type ExposureToolType = 'tableau' | 'looker' | 'metabase' | 'powerbi' | 'mode' | 'superset' | 'redash' | 'custom'

export interface Exposure {
  id: string
  name: string
  url: string
  tool_type: ExposureToolType
  description?: string
}

// ── Pipeline Tests ────────────────────────────────────────────────────────────

export type TestType = 'not_null' | 'unique' | 'row_count_between' | 'accepted_values' | 'custom_sql' | 'relationships'
export type TestSeverity = 'error' | 'warn'
export type TestStatus = 'passed' | 'failed' | 'error'

export interface PipelineTest {
  id: string
  name: string
  test_type: TestType
  column?: string
  min_rows?: number
  max_rows?: number
  values?: string[]
  sql?: string
  severity: TestSeverity
  filter?: string           // optional WHERE predicate to scope the test
  reference_table?: string  // for relationships test
  reference_column?: string // for relationships test
  store_failures?: boolean  // CTAS failing rows to _failures_ table
}

export interface TestResult {
  test_id: string
  test_name: string
  test_type: string
  status: TestStatus
  message: string
  severity: TestSeverity
  failure_table?: string    // set when store_failures=true and test failed
}

// ── DAG ───────────────────────────────────────────────────────────────────────

export interface DagNode {
  id: string
  name: string
  output_mode: string
  output_table?: string
  source_table?: string
  dependencies: string[]
}

export interface DagEdge {
  source: string
  target: string
}

export interface LineageNode {
  id: string
  type: 'source' | 'intermediate' | 'output' | 'pipeline'
  label: string
  pipeline_id?: string
  output_mode?: string
}

export interface PipelineDag {
  nodes: DagNode[]
  edges: DagEdge[]
  lineage_nodes: LineageNode[]
  lineage_edges: DagEdge[]
  cycles: string[][]
  execution_order: string[]
  parallel_levels: string[][]
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export interface Pipeline {
  id: string
  name: string
  description?: string
  source_table: string
  steps: TransformStep[]
  output_table?: string
  output_mode: 'preview' | 'ctas' | 'insert' | 'view' | 'incremental' | 'scd2'
  version: number
  created_at?: string
  updated_at?: string
  parameters?: PipelineParameter[]
  webhook_token?: string
  // dbt-style features
  dependencies?: string[]
  incremental_strategy?: 'merge' | 'append'
  incremental_key?: string
  tests?: PipelineTest[]
  // SCD Type 2
  scd2_key?: string
  scd2_tracked_columns?: string[]
  scd2_effective_from?: string
  scd2_effective_to?: string
  scd2_is_current?: string
  // Execution hooks
  pre_hook_sql?: string
  post_hook_sql?: string
  exposures?: Exposure[]
  microbatch_window?: string
  // Approval workflow
  approval_required?: boolean
  pending_approval_id?: string
  // Ownership & sharing
  user_id?: string
  shared_access?: 'viewer' | 'editor' | null
  owner_username?: string | null
}

export interface PipelineCreate {
  name: string
  description?: string
  source_table: string
  steps?: TransformStep[]
  output_table?: string
  output_mode?: string
  parameters?: PipelineParameter[]
  dependencies?: string[]
  incremental_strategy?: string
  incremental_key?: string
  tests?: PipelineTest[]
  scd2_key?: string
  scd2_tracked_columns?: string[]
  scd2_effective_from?: string
  scd2_effective_to?: string
  scd2_is_current?: string
  pre_hook_sql?: string
  post_hook_sql?: string
  exposures?: Exposure[]
  microbatch_window?: string
}

export interface PipelineSave {
  name?: string
  description?: string
  steps: TransformStep[]
  output_table?: string
  output_mode?: string
  message?: string
  parameters?: PipelineParameter[]
  dependencies?: string[]
  incremental_strategy?: string
  incremental_key?: string
  tests?: PipelineTest[]
  scd2_key?: string
  scd2_tracked_columns?: string[]
  scd2_effective_from?: string
  scd2_effective_to?: string
  scd2_is_current?: string
  pre_hook_sql?: string
  post_hook_sql?: string
  exposures?: Exposure[]
  microbatch_window?: string
}

export interface PreviewResult {
  columns: string[]
  rows: Record<string, unknown>[]
  row_count: number
  sql: string
  truncated: boolean
}

export interface ExecuteResult {
  success: boolean
  rows_written?: number
  output_table?: string
  sql: string
  error?: string
  duration_ms?: number
  test_results?: TestResult[]
  tests_passed?: number
  tests_failed?: number
  blocked_by_tests?: boolean
  metadata_push?: string  // 'sql' | 'rest_catalog:{name}' | 'skipped' | 'failed' | 'timeout'
  // Step-level failure attribution
  failed_step_index?: number   // 0-based index of the failing transform step
  failed_step_name?: string    // human-readable step label or transform type name
  failed_step_error?: string   // Dremio error scoped to that step
}

export interface ColumnSchema {
  name: string
  type: string
}

export interface CatalogTable {
  namespace: string
  name: string
  fullName: string
}

export interface CatalogEntry {
  name: string
  type: 'DATASET' | 'CONTAINER'
  datasetType?: string
}

export interface IcebergCatalog {
  id: string
  name: string
  url: string
  warehouse?: string
  auth_type: 'none' | 'bearer' | 'oauth2' | 'dremio_pat' | 'sigv4'
  token?: string
  client_id?: string
  client_secret?: string
  oauth_scope?: string
  prefix?: string
  aws_access_key_id?: string
  aws_secret_access_key?: string
  aws_region?: string
  aws_session_token?: string
  created_at?: string
  updated_at?: string
}

export interface VersionEntry {
  id: string
  pipeline_id: string
  version: number
  message: string
  created_at: string
}

export interface PipelineSchedule {
  id: string
  pipeline_id: string
  cron_expression: string
  enabled: boolean
  last_run_at?: string
  last_run_status?: 'success' | 'failed'
  last_run_error?: string
  created_at: string
  updated_at: string
}

// ── DAG Orchestration ─────────────────────────────────────────────────────────

export interface DagPipelineResult {
  pipeline_id: string
  pipeline_name: string
  success: boolean
  rows_written?: number
  duration_ms?: number
  error?: string
  skipped: boolean
}

export interface DagExecuteResult {
  pipeline_results: DagPipelineResult[]
  total_pipelines: number
  succeeded: number
  failed: number
  skipped: number
  stopped_early: boolean
}

// ── Environments ──────────────────────────────────────────────────────────────

export interface Environment {
  id: string
  name: string
  host: string
  port: number
  ssl: boolean
  auth_type: 'password' | 'pat'
  user: string
  password: string
  pat: string
  project_id: string
  is_active: boolean
  created_at?: string
}

// ── Data Seeding ──────────────────────────────────────────────────────────────

export interface SeedResult {
  success: boolean
  table_name: string
  rows_inserted: number
  sql: string
  error?: string
}

// ── Pipeline Approvals ────────────────────────────────────────────────────────

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface PipelineApproval {
  id: string
  pipeline_id: string
  pipeline_name: string
  proposed_steps: TransformStep[]
  current_steps: TransformStep[]
  submitted_by: string
  submitted_at: string
  reviewed_by?: string
  reviewed_at?: string
  status: ApprovalStatus
  comments?: string
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export type PipelineHealth = 'healthy' | 'degraded' | 'failing' | 'never_run'

export interface DashboardLastRun {
  status: 'success' | 'failed'
  started_at: string
  completed_at?: string
  row_count?: number
  error_message?: string
  run_type?: string
}

export interface DashboardNextRun {
  next_run_at?: string
  cron_expression?: string
  enabled: boolean
}

export interface DashboardPipeline {
  id: string
  name: string
  description?: string
  source_table: string
  output_table?: string
  output_mode: string
  updated_at?: string
  created_at?: string
  approval_required: boolean
  pending_approval_id?: string
  last_run?: DashboardLastRun
  next_run?: DashboardNextRun
  success_rate?: number   // 0–1; undefined if never run
  total_runs: number
  health: PipelineHealth
}
