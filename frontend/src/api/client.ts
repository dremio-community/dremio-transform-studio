import axios from 'axios'
import type {
  Pipeline,
  PipelineCreate,
  PipelineSave,
  PipelineTest,
  PipelineDag,
  PreviewResult,
  ExecuteResult,
  TestResult,
  TransformType,
  ColumnSchema,
  CatalogEntry,
  IcebergCatalog,
  VersionEntry,
  PipelineSchedule,
  TransformStep,
  CustomTransformTemplate,
  Alert,
  AlertHistory,
  DagExecuteResult,
  Environment,
  SeedResult,
  PipelineApproval,
  DashboardPipeline,
} from '../types'

// In dev: VITE_API_URL is set (or Vite proxy handles /api → backend).
// In desktop/Docker build: frontend is served BY the backend, so use relative URLs.
const BASE_URL = import.meta.env.VITE_API_URL ?? ''

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// ── Auth token helpers ────────────────────────────────────────────────────────

const TOKEN_KEY = 'ts_auth_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(t: string): void {
  localStorage.setItem(TOKEN_KEY, t)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

// Request interceptor: attach token if present
api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers = config.headers ?? {}
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

// Response interceptor: on 401, clear token and emit custom event
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearToken()
      window.dispatchEvent(new CustomEvent('ts:unauthorized'))
    }
    // Extract backend detail message so callers see a useful error string
    if (error.response?.data?.detail) {
      const detail = error.response.data.detail
      error.message = typeof detail === 'string' ? detail : JSON.stringify(detail)
    }
    return Promise.reject(error)
  }
)

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  user_id: string
  username: string
  is_admin: boolean
  role: 'admin' | 'editor' | 'viewer'
}

export interface PipelinePermission {
  id: string
  pipeline_id: string
  user_id: string
  username: string
  access_level: 'viewer' | 'editor'
  granted_by: string | null
  granted_at: string
}

export interface PipelinePermissionsResponse {
  pipeline_id: string
  owner_id: string
  owner_username: string | null
  permissions: PipelinePermission[]
}

export interface AuthStatus {
  auth_enabled: boolean
  version: string
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const res = await api.get('/api/auth/status')
  return res.data
}

export async function fetchAuthSettings(): Promise<{ auth_enabled: boolean }> {
  const res = await api.get('/api/settings/auth')
  return res.data
}

export async function updateAuthSettings(enabled: boolean): Promise<{ auth_enabled: boolean }> {
  const res = await api.put('/api/settings/auth', { enabled })
  return res.data
}

export async function login(username: string, password: string): Promise<{ token: string; user: { id: string; username: string; is_admin: boolean; role: string } }> {
  const res = await api.post('/api/auth/login', { username, password })
  return res.data
}

export async function logout(): Promise<void> {
  await api.post('/api/auth/logout')
  clearToken()
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const res = await api.get('/api/auth/me')
  return res.data
}

export async function fetchUsers(): Promise<{ id: string; username: string; is_admin: boolean; role: string; created_at: string }[]> {
  const res = await api.get('/api/auth/users')
  return res.data
}

export async function createUser(data: { username: string; password: string; is_admin: boolean; role?: string }): Promise<{ id: string; username: string; is_admin: boolean; role: string }> {
  const res = await api.post('/api/auth/users', data)
  return res.data
}

export async function updateUserRole(userId: string, role: string): Promise<{ id: string; username: string; role: string }> {
  const res = await api.put(`/api/auth/users/${userId}`, { role })
  return res.data
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/api/auth/users/${id}`)
}

export async function fetchMyCredentials(): Promise<{ has_pat: boolean; pat_preview: string | null }> {
  const res = await api.get('/api/auth/me/credentials')
  return res.data
}

export async function updateMyCredentials(pat: string): Promise<void> {
  await api.put('/api/auth/me/credentials', { dremio_pat: pat })
}

export async function fetchPipelinePermissions(pipelineId: string): Promise<PipelinePermissionsResponse> {
  const res = await api.get(`/api/pipelines/${pipelineId}/permissions`)
  return res.data
}

export async function addPipelinePermission(pipelineId: string, userId: string, accessLevel: 'viewer' | 'editor'): Promise<PipelinePermission> {
  const res = await api.post(`/api/pipelines/${pipelineId}/permissions`, { user_id: userId, access_level: accessLevel })
  return res.data
}

export async function removePipelinePermission(pipelineId: string, userId: string): Promise<void> {
  await api.delete(`/api/pipelines/${pipelineId}/permissions/${userId}`)
}

// ── Health & Desktop ──────────────────────────────────────────────────────────

export async function fetchHealth(): Promise<{ status: string; dremio: boolean }> {
  const res = await api.get('/api/health')
  return res.data
}

export async function fetchIsDesktop(): Promise<boolean> {
  const res = await api.get('/api/is-desktop')
  return res.data.desktop
}

export async function quitApp(): Promise<void> {
  await api.post('/api/quit')
}

export interface StorageSettings {
  db_path: string
  default_db_path: string
  is_custom: boolean
  is_desktop: boolean
}

export async function fetchStorageSettings(): Promise<StorageSettings> {
  const res = await api.get('/api/settings/storage')
  return res.data
}

export async function saveStorageSettings(db_path: string): Promise<{ saved: boolean; restart_required: boolean }> {
  const res = await api.put('/api/settings/storage', { db_path })
  return res.data
}

export async function downloadBackup(): Promise<void> {
  const resp = await api.get('/api/admin/backup', { responseType: 'blob' })
  const cd: string = resp.headers['content-disposition'] ?? ''
  const match = cd.match(/filename="([^"]+)"/)
  const filename = match
    ? match[1]
    : `transform-studio-backup-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.db`
  const url = URL.createObjectURL(new Blob([resp.data as BlobPart]))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function restoreBackup(file: File): Promise<{ restored: boolean; restart_required: boolean }> {
  const form = new FormData()
  form.append('file', file)
  const res = await api.post('/api/admin/restore', form)
  return res.data
}

// ── Transforms ────────────────────────────────────────────────────────────────

export async function fetchTransforms(): Promise<TransformType[]> {
  const res = await api.get('/api/transforms')
  return res.data
}

export async function fetchTransform(id: string): Promise<TransformType> {
  const res = await api.get(`/api/transforms/${id}`)
  return res.data
}

// ── Catalog ───────────────────────────────────────────────────────────────────

export async function fetchNamespaces(): Promise<string[]> {
  const res = await api.get('/api/catalog/namespaces')
  return res.data
}

export async function fetchTables(namespace: string): Promise<CatalogEntry[]> {
  const res = await api.get(`/api/catalog/namespaces/${namespace}`)
  return res.data
}

export async function fetchTableSchema(table: string): Promise<ColumnSchema[]> {
  const res = await api.get('/api/catalog/table-schema', { params: { table } })
  return res.data
}

// ── Pipelines ─────────────────────────────────────────────────────────────────

export async function createPipeline(data: PipelineCreate): Promise<Pipeline> {
  const res = await api.post('/api/pipelines', data)
  return res.data
}

export async function fetchPipelines(): Promise<Pipeline[]> {
  const res = await api.get('/api/pipelines')
  return res.data
}

export async function fetchPipeline(id: string): Promise<Pipeline> {
  const res = await api.get(`/api/pipelines/${id}`)
  return res.data
}

export async function savePipeline(id: string, data: PipelineSave): Promise<Pipeline> {
  const res = await api.put(`/api/pipelines/${id}`, data)
  return res.data
}

export async function deletePipeline(id: string): Promise<void> {
  await api.delete(`/api/pipelines/${id}`)
}

export async function fetchPipelineHistory(id: string): Promise<VersionEntry[]> {
  const res = await api.get(`/api/pipelines/${id}/history`)
  return res.data
}

export async function fetchPipelineVersion(id: string, version: number): Promise<Pipeline> {
  const res = await api.get(`/api/pipelines/${id}/versions/${version}`)
  return res.data
}

// ── Preview & Execute ─────────────────────────────────────────────────────────

export async function previewPipeline(id: string, param_values?: Record<string, string>): Promise<PreviewResult> {
  const res = await api.post(`/api/pipelines/${id}/preview`, param_values ? { param_values } : undefined)
  return res.data
}

export async function executePipeline(
  id: string,
  param_values?: Record<string, string>,
  output_table?: string,
  output_mode?: string,
  incremental_strategy?: string,
  incremental_key?: string,
  scd2_key?: string,
  scd2_tracked_columns?: string[],
  scd2_effective_from?: string,
  scd2_effective_to?: string,
  scd2_is_current?: string,
  microbatch_window?: string,
): Promise<ExecuteResult> {
  const body: Record<string, unknown> = {}
  if (param_values) body.param_values = param_values
  if (output_table) body.output_table = output_table
  if (output_mode) body.output_mode = output_mode
  if (incremental_strategy) body.incremental_strategy = incremental_strategy
  if (incremental_key) body.incremental_key = incremental_key
  if (scd2_key) body.scd2_key = scd2_key
  if (scd2_tracked_columns?.length) body.scd2_tracked_columns = scd2_tracked_columns
  if (scd2_effective_from) body.scd2_effective_from = scd2_effective_from
  if (scd2_effective_to) body.scd2_effective_to = scd2_effective_to
  if (scd2_is_current) body.scd2_is_current = scd2_is_current
  if (microbatch_window) body.microbatch_window = microbatch_window
  const res = await api.post(`/api/pipelines/${id}/execute`, Object.keys(body).length ? body : undefined)
  return res.data
}

// ── Webhook ───────────────────────────────────────────────────────────────────

export async function regenerateWebhookToken(pipelineId: string): Promise<{ webhook_token: string }> {
  const res = await api.post(`/api/pipelines/${pipelineId}/webhook/regenerate`)
  return res.data
}

// ── Ad-hoc SQL ────────────────────────────────────────────────────────────────

export async function adHocPreview(
  source_table: string,
  steps: TransformStep[]
): Promise<PreviewResult> {
  const res = await api.post('/api/sql/preview', { source_table, steps })
  return res.data
}

export async function generateSql(
  source_table: string,
  steps: TransformStep[]
): Promise<{ sql: string }> {
  const res = await api.post('/api/sql/generate', { source_table, steps })
  return res.data
}

// ── Iceberg Catalog Connections ───────────────────────────────────────────────

export async function fetchIcebergCatalogs(): Promise<IcebergCatalog[]> {
  const res = await api.get('/api/iceberg-catalogs')
  return res.data
}

export async function createIcebergCatalog(data: Omit<IcebergCatalog, 'id' | 'created_at' | 'updated_at'>): Promise<IcebergCatalog> {
  const res = await api.post('/api/iceberg-catalogs', data)
  return res.data
}

export async function updateIcebergCatalog(id: string, data: Partial<IcebergCatalog>): Promise<IcebergCatalog> {
  const res = await api.put(`/api/iceberg-catalogs/${id}`, data)
  return res.data
}

export async function deleteIcebergCatalog(id: string): Promise<void> {
  await api.delete(`/api/iceberg-catalogs/${id}`)
}

export async function testIcebergCatalog(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await api.post(`/api/iceberg-catalogs/${id}/test`)
  return res.data
}

export async function fetchIcebergNamespaces(connId: string, parent?: string): Promise<string[]> {
  const res = await api.get(`/api/iceberg-catalogs/${connId}/namespaces`, {
    params: parent ? { parent } : {},
  })
  return res.data
}

export async function fetchIcebergChildren(connId: string, ns: string): Promise<CatalogEntry[]> {
  const res = await api.get(`/api/iceberg-catalogs/${connId}/namespaces/${ns}`)
  return res.data
}

export async function fetchIcebergTableSchema(connId: string, table: string): Promise<ColumnSchema[]> {
  const res = await api.get(`/api/iceberg-catalogs/${connId}/table-schema`, { params: { table } })
  return res.data
}

// ── Connection Settings ───────────────────────────────────────────────────────

export interface ConnectionSettings {
  host: string
  port: number
  ssl: boolean
  auth_type: 'password' | 'pat'
  user: string
  password: string
  pat: string
  project_id: string
}

export async function fetchConnectionSettings(): Promise<ConnectionSettings> {
  const res = await api.get('/api/settings/connection')
  return res.data
}

export async function updateConnectionSettings(data: ConnectionSettings): Promise<ConnectionSettings> {
  const res = await api.put('/api/settings/connection', data)
  return res.data
}

export async function testConnectionSettings(): Promise<{ ok: boolean; message: string }> {
  const res = await api.post('/api/settings/connection/test')
  return res.data
}

// ── Pipeline Schedules ────────────────────────────────────────────────────────

export async function fetchPipelineSchedules(pipelineId: string): Promise<PipelineSchedule[]> {
  const res = await api.get(`/api/pipelines/${pipelineId}/schedules`)
  return res.data
}

export async function createPipelineSchedule(
  pipelineId: string,
  data: { cron_expression: string; enabled: boolean }
): Promise<PipelineSchedule> {
  const res = await api.post(`/api/pipelines/${pipelineId}/schedules`, data)
  return res.data
}

export async function updateSchedule(
  scheduleId: string,
  data: { cron_expression?: string; enabled?: boolean }
): Promise<PipelineSchedule> {
  const res = await api.put(`/api/schedules/${scheduleId}`, data)
  return res.data
}

export async function deleteSchedule(scheduleId: string): Promise<void> {
  await api.delete(`/api/schedules/${scheduleId}`)
}

// ── Pipeline Duplication ──────────────────────────────────────────────────────

export async function duplicatePipeline(id: string): Promise<Pipeline> {
  const res = await api.post(`/api/pipelines/${id}/duplicate`)
  return res.data
}

// ── Pipeline Export / Import ──────────────────────────────────────────────────

export async function exportPipeline(id: string): Promise<object> {
  const res = await api.get(`/api/pipelines/${id}/export`)
  return res.data
}

export async function importPipeline(data: object): Promise<Pipeline> {
  const res = await api.post('/api/pipelines/import', data)
  return res.data
}

// ── Data Profiling ────────────────────────────────────────────────────────────

export interface ColumnProfile {
  name: string
  type: string
  count: number
  null_pct: number
  distinct: number
  min: string
  max: string
}

export interface TableProfile {
  total_rows: number
  sampled: boolean
  columns: ColumnProfile[]
}

export async function fetchTableProfile(table: string, refresh = false): Promise<TableProfile & { from_cache?: boolean; cached_at?: string }> {
  const res = await api.get('/api/catalog/profile', { params: { table, ...(refresh ? { refresh: true } : {}) } })
  return res.data
}

// ── Pipeline Run History ──────────────────────────────────────────────────────

export interface PipelineRun {
  id: string
  pipeline_id: string
  pipeline_name: string
  run_type: 'manual' | 'scheduled'
  status: 'success' | 'failed'
  row_count?: number
  error_message?: string
  started_at: string
  completed_at: string
}

export async function fetchPipelineRuns(pipelineId: string): Promise<PipelineRun[]> {
  const res = await api.get(`/api/pipelines/${pipelineId}/runs`)
  return res.data
}

export async function fetchAllRuns(): Promise<PipelineRun[]> {
  const res = await api.get('/api/runs')
  return res.data
}

// ── Notification Settings ─────────────────────────────────────────────────────

export interface NotificationSettings {
  notify_email_enabled: boolean
  notify_email_smtp_host: string
  notify_email_smtp_port: string
  notify_email_smtp_user: string
  notify_email_smtp_pass: string
  notify_email_from: string
  notify_email_to: string
  notify_slack_enabled: boolean
  notify_slack_webhook_url: string
}

export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  const res = await api.get('/api/settings/notifications')
  return res.data
}

export async function updateNotificationSettings(data: NotificationSettings): Promise<NotificationSettings> {
  const res = await api.put('/api/settings/notifications', data)
  return res.data
}

export async function testNotificationSettings(): Promise<{ ok: boolean; message: string }> {
  const res = await api.post('/api/settings/notifications/test')
  return res.data
}

// ── Custom SQL Transform Templates ────────────────────────────────────────────

export async function fetchCustomTransforms(search?: string): Promise<CustomTransformTemplate[]> {
  const res = await api.get('/api/custom-transforms', { params: search ? { search } : {} })
  return res.data
}

export async function createCustomTransform(data: {
  name: string
  description: string
  sql_template: string
  tags: string
}): Promise<CustomTransformTemplate> {
  const res = await api.post('/api/custom-transforms', data)
  return res.data
}

export async function updateCustomTransform(
  id: string,
  data: Partial<CustomTransformTemplate>
): Promise<CustomTransformTemplate> {
  const res = await api.put(`/api/custom-transforms/${id}`, data)
  return res.data
}

export async function deleteCustomTransform(id: string): Promise<void> {
  await api.delete(`/api/custom-transforms/${id}`)
}

export async function recordCustomTransformUse(id: string): Promise<void> {
  await api.post(`/api/custom-transforms/${id}/use`)
}

// ── Alerts ────────────────────────────────────────────────────────────────────

export async function fetchAlerts(): Promise<Alert[]> {
  const res = await api.get('/api/alerts')
  return res.data
}

export async function createAlert(data: Omit<Alert, 'id' | 'created_at' | 'updated_at' | 'last_checked_at' | 'last_status' | 'last_message' | 'last_triggered_at'>): Promise<Alert> {
  const res = await api.post('/api/alerts', data)
  return res.data
}

export async function updateAlert(id: string, data: Partial<Alert>): Promise<Alert> {
  const res = await api.put(`/api/alerts/${id}`, data)
  return res.data
}

export async function deleteAlert(id: string): Promise<void> {
  await api.delete(`/api/alerts/${id}`)
}

export async function fetchAlertHistory(alertId: string): Promise<AlertHistory[]> {
  const res = await api.get(`/api/alerts/${alertId}/history`)
  return res.data
}

export async function runAlertNow(alertId: string): Promise<{ status: string; message: string }> {
  const res = await api.post(`/api/alerts/${alertId}/run`)
  return res.data
}

export async function fetchAllAlertHistory(): Promise<AlertHistory[]> {
  const res = await api.get('/api/alert-history')
  return res.data
}

// ── Pipeline Tests ────────────────────────────────────────────────────────────

export interface TestRunResult {
  results: TestResult[]
  passed: number
  failed: number
  errors: number
  blocking_failures: number
}

export async function runPipelineTests(pipelineId: string): Promise<TestRunResult> {
  const res = await api.post(`/api/pipelines/${pipelineId}/run-tests`)
  return res.data
}

export async function fetchColumnLineage(pipelineId: string): Promise<{
  pipeline_id: string
  source_columns: string[]
  steps: {
    step_index: number
    step_type: string
    step_label: string
    input_columns: string[]
    output_columns: string[]
    column_map: Record<string, string[]>
  }[]
}> {
  const res = await api.get(`/api/pipelines/${pipelineId}/column-lineage`)
  return res.data
}

// ── Cross-pipeline DAG ────────────────────────────────────────────────────────

export async function fetchDag(): Promise<PipelineDag> {
  const res = await api.get('/api/dag')
  return res.data
}

export async function updatePipelineDependencies(
  pipelineId: string,
  dependencies: string[]
): Promise<{ pipeline_id: string; dependencies: string[] }> {
  const res = await api.put(`/api/pipelines/${pipelineId}/dependencies`, { dependencies })
  return res.data
}

// ── DAG Orchestration ─────────────────────────────────────────────────────────

export async function executeWithDeps(
  pipelineId: string,
  output_table?: string,
  output_mode?: string,
): Promise<DagExecuteResult> {
  const body: Record<string, unknown> = {}
  if (output_table) body.output_table = output_table
  if (output_mode) body.output_mode = output_mode
  const res = await api.post(`/api/pipelines/${pipelineId}/execute-with-deps`, Object.keys(body).length ? body : undefined)
  return res.data
}

// ── Environments ──────────────────────────────────────────────────────────────

export async function fetchEnvironments(): Promise<Environment[]> {
  const res = await api.get('/api/environments')
  return res.data
}

export async function createEnvironment(data: Omit<Environment, 'id' | 'is_active' | 'created_at'>): Promise<Environment> {
  const res = await api.post('/api/environments', data)
  return res.data
}

export async function updateEnvironment(id: string, data: Omit<Environment, 'id' | 'is_active' | 'created_at'>): Promise<Environment> {
  const res = await api.put(`/api/environments/${id}`, data)
  return res.data
}

export async function deleteEnvironment(id: string): Promise<void> {
  await api.delete(`/api/environments/${id}`)
}

export async function activateEnvironment(id: string): Promise<{ activated: boolean; environment: Environment }> {
  const res = await api.post(`/api/environments/${id}/activate`)
  return res.data
}

// ── Data Seeding ──────────────────────────────────────────────────────────────

export async function seedTable(tableName: string, file: File): Promise<SeedResult> {
  const form = new FormData()
  form.append('table_name', tableName)
  form.append('file', file)
  const res = await api.post('/api/seeds', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  return res.data
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export async function fetchDashboard(): Promise<DashboardPipeline[]> {
  const res = await api.get('/api/dashboard')
  return res.data
}

// ── Approval Workflow ─────────────────────────────────────────────────────────

export async function fetchApprovals(status?: string): Promise<PipelineApproval[]> {
  const res = await api.get('/api/approvals', { params: status ? { status } : {} })
  return res.data
}

export async function fetchApproval(id: string): Promise<PipelineApproval> {
  const res = await api.get(`/api/approvals/${id}`)
  return res.data
}

export async function submitPipelineReview(
  pipelineId: string,
  steps: TransformStep[],
  message?: string,
): Promise<PipelineApproval> {
  const res = await api.post(`/api/pipelines/${pipelineId}/submit-review`, { steps, message })
  return res.data
}

export async function approveApproval(id: string, comments?: string): Promise<PipelineApproval> {
  const res = await api.post(`/api/approvals/${id}/approve`, { comments })
  return res.data
}

export async function rejectApproval(id: string, comments?: string): Promise<PipelineApproval> {
  const res = await api.post(`/api/approvals/${id}/reject`, { comments })
  return res.data
}

export async function setApprovalRequired(pipelineId: string, required: boolean): Promise<void> {
  await api.put(`/api/pipelines/${pipelineId}/approval-required`, { required })
}

// ── Data Quality Hub ─────────────────────────────────────────────────────────

export interface DQRuleConfig {
  rule_id: string
  config: Record<string, unknown>
  weight?: number
}

export interface DQRuleResult {
  rule_id: string
  rule_name: string
  pass_rate: number
  status: 'passed' | 'warned' | 'failed' | 'error'
  detail: Record<string, unknown>
  message: string
  weight: number
}

export interface DQScanResult {
  id: string
  monitor_id: string
  scanned_at: string
  overall_score: number
  rule_results_json?: string
  rule_results?: DQRuleResult[]
  status: string
  error_message?: string
  duration_ms?: number
}

export interface DQMonitor {
  id: string
  table_name: string
  display_name: string
  rules_json: string
  schedule_cron?: string
  enabled: boolean
  alert_threshold?: number
  alert_enabled?: boolean
  created_at: string
  updated_at: string
  last_scan_at?: string
  last_score?: number
  latest_scan?: DQScanResult
}

export interface DQRuleSchemaField {
  key: string
  label: string
  type: 'column' | 'number' | 'string' | 'sql' | 'readonly'
  required?: boolean
  default?: unknown
}

export interface DQRule {
  id: string
  name: string
  description: string
  category: string
  config_schema: DQRuleSchemaField[]
}

export async function fetchDQRules(): Promise<DQRule[]> {
  const res = await api.get('/api/dq/rules')
  return res.data
}

export async function fetchDQMonitors(): Promise<DQMonitor[]> {
  const res = await api.get('/api/dq/monitors')
  return res.data
}

export async function createDQMonitor(data: {
  table_name: string
  display_name?: string
  rules_json?: string
  schedule_cron?: string
  enabled?: boolean
  alert_threshold?: number | null
  alert_enabled?: boolean
}): Promise<DQMonitor> {
  const res = await api.post('/api/dq/monitors', data)
  return res.data
}

export async function updateDQMonitor(id: string, data: Partial<DQMonitor>): Promise<DQMonitor> {
  const res = await api.put(`/api/dq/monitors/${id}`, data)
  return res.data
}

export async function deleteDQMonitor(id: string): Promise<void> {
  await api.delete(`/api/dq/monitors/${id}`)
}

export async function runDQScan(monitorId: string): Promise<DQScanResult> {
  const res = await api.post(`/api/dq/monitors/${monitorId}/scan`)
  return res.data
}

export async function fetchDQScanResults(monitorId: string, limit = 20): Promise<DQScanResult[]> {
  const res = await api.get(`/api/dq/monitors/${monitorId}/results`, { params: { limit } })
  return res.data
}

export async function fetchDQDashboard(): Promise<DQMonitor[]> {
  const res = await api.get('/api/dq/dashboard')
  return res.data
}

export async function fetchDQScanHistory(limit = 100): Promise<(DQScanResult & { display_name: string; table_name: string })[]> {
  const res = await api.get('/api/dq/scan-history', { params: { limit } })
  return res.data
}

// ── Documentation Export ──────────────────────────────────────────────────────

export async function exportDocs(): Promise<void> {
  const res = await api.get('/api/docs/export', { responseType: 'blob' })
  const url = URL.createObjectURL(new Blob([res.data], { type: 'text/html' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'transform-studio-docs.html'
  a.click()
  URL.revokeObjectURL(url)
}
