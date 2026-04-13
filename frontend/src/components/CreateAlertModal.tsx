import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { X, Plus, Trash2, Save } from 'lucide-react'
import clsx from 'clsx'
import type {
  Alert, AlertType,
  SqlAlertConfig, PipelineHealthConfig, DataQualityConfig, DataQualityCheck, SourceFreshnessConfig,
} from '../types'
import { createAlert, updateAlert, fetchPipelines } from '../api/client'

interface Props {
  existing: Alert | null
  onClose: () => void
  onSaved: () => void
}

const CRON_PRESETS = [
  { label: 'Every 15 min', value: '*/15 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily at 8am', value: '0 8 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Weekly (Mon 8am)', value: '0 8 * * 1' },
]

// ── SQL Alert Config ──────────────────────────────────────────────────────────

function SqlConfigForm({ config, onChange }: { config: SqlAlertConfig; onChange: (c: SqlAlertConfig) => void }) {
  const needsThreshold = config.condition === 'value > N' || config.condition === 'value < N'

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">SQL Query</label>
        <p className="text-xs text-gray-400 mb-1.5">Write any SQL. The result will be checked against the condition below.</p>
        <textarea
          value={config.sql}
          onChange={(e) => onChange({ ...config, sql: e.target.value })}
          placeholder={'SELECT COUNT(*) AS failed_count\nFROM my_space.orders\nWHERE status = \'failed\''}
          rows={5}
          spellCheck={false}
          className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Trigger Condition</label>
        <select
          value={config.condition}
          onChange={(e) => onChange({ ...config, condition: e.target.value as SqlAlertConfig['condition'] })}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="rows_returned > 0">Query returns any rows</option>
          <option value="value > N">Value is greater than threshold</option>
          <option value="value < N">Value is less than threshold</option>
          <option value="value changed">Value changes from last check</option>
        </select>
      </div>

      {needsThreshold && (
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Threshold</label>
            <input
              type="number"
              value={config.threshold ?? ''}
              onChange={(e) => onChange({ ...config, threshold: Number(e.target.value) })}
              placeholder="e.g. 100"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Value column (optional)</label>
            <input
              type="text"
              value={config.value_column ?? ''}
              onChange={(e) => onChange({ ...config, value_column: e.target.value })}
              placeholder="e.g. failed_count (first col if blank)"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>
      )}

      {config.condition === 'value changed' && (
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Value column (optional)</label>
          <input
            type="text"
            value={config.value_column ?? ''}
            onChange={(e) => onChange({ ...config, value_column: e.target.value })}
            placeholder="e.g. row_count (first col if blank)"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      )}
    </div>
  )
}

// ── Pipeline Health Config ────────────────────────────────────────────────────

function PipelineHealthForm({
  config, onChange,
}: { config: PipelineHealthConfig; onChange: (c: PipelineHealthConfig) => void }) {
  const { data: pipelines = [] } = useQuery({
    queryKey: ['pipelines'],
    queryFn: fetchPipelines,
    staleTime: 60_000,
  })

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Pipeline *</label>
        <select
          value={config.pipeline_id}
          onChange={(e) => {
            const p = pipelines.find((pl) => pl.id === e.target.value)
            onChange({ ...config, pipeline_id: e.target.value, pipeline_name: p?.name ?? '' })
          }}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">Select a pipeline…</option>
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        <label className="block text-xs font-semibold text-gray-600">Checks</label>

        {/* Failure check */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.check_failure}
            onChange={(e) => onChange({ ...config, check_failure: e.target.checked })}
            className="rounded border-gray-300 text-blue-600"
          />
          <span className="text-sm text-gray-700">Alert if last run failed</span>
        </label>

        {/* Duration check */}
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.check_duration}
            onChange={(e) => onChange({ ...config, check_duration: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 mt-0.5"
          />
          <div className="flex-1">
            <span className="text-sm text-gray-700">Alert if run duration exceeds</span>
            {config.check_duration && (
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="number"
                  value={config.duration_threshold_secs}
                  onChange={(e) => onChange({ ...config, duration_threshold_secs: Number(e.target.value) })}
                  className="w-24 px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  min={1}
                />
                <span className="text-xs text-gray-500">seconds</span>
              </div>
            )}
          </div>
        </label>

        {/* Row count change check */}
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.check_row_count_change}
            onChange={(e) => onChange({ ...config, check_row_count_change: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 mt-0.5"
          />
          <div className="flex-1">
            <span className="text-sm text-gray-700">Alert if row count changes by more than</span>
            {config.check_row_count_change && (
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="number"
                  value={config.row_count_change_pct}
                  onChange={(e) => onChange({ ...config, row_count_change_pct: Number(e.target.value) })}
                  className="w-24 px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  min={1} max={100}
                />
                <span className="text-xs text-gray-500">% vs previous run</span>
              </div>
            )}
          </div>
        </label>

        {/* Not run check */}
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.check_not_run}
            onChange={(e) => onChange({ ...config, check_not_run: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 mt-0.5"
          />
          <div className="flex-1">
            <span className="text-sm text-gray-700">Alert if pipeline hasn't run in</span>
            {config.check_not_run && (
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="number"
                  value={config.not_run_hours}
                  onChange={(e) => onChange({ ...config, not_run_hours: Number(e.target.value) })}
                  className="w-24 px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  min={1}
                />
                <span className="text-xs text-gray-500">hours</span>
              </div>
            )}
          </div>
        </label>
      </div>
    </div>
  )
}

// ── Data Quality Config ───────────────────────────────────────────────────────

function DataQualityForm({
  config, onChange,
}: { config: DataQualityConfig; onChange: (c: DataQualityConfig) => void }) {
  const addCheck = (type: DataQualityCheck['type']) => {
    const defaults: Record<string, DataQualityCheck> = {
      row_count_min: { type: 'row_count_min', value: 1 },
      row_count_max: { type: 'row_count_max', value: 1000000 },
      null_rate_max: { type: 'null_rate_max', column: '', pct: 5 },
      custom_sql: { type: 'custom_sql', sql: 'SELECT COUNT(*) AS cnt FROM {table} WHERE 1=0', condition: 'rows_returned > 0' },
    }
    onChange({ ...config, checks: [...config.checks, defaults[type]] })
  }

  const updateCheck = (i: number, updated: DataQualityCheck) => {
    const checks = [...config.checks]
    checks[i] = updated
    onChange({ ...config, checks })
  }

  const removeCheck = (i: number) => {
    onChange({ ...config, checks: config.checks.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Table *</label>
        <input
          type="text"
          value={config.table}
          onChange={(e) => onChange({ ...config, table: e.target.value })}
          placeholder="e.g. My Space.orders"
          className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-gray-600">Checks</label>
          <div className="flex gap-1">
            {(['row_count_min', 'row_count_max', 'null_rate_max', 'custom_sql'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => addCheck(type)}
                className="text-[10px] px-2 py-0.5 border border-gray-200 rounded text-gray-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
              >
                + {type === 'row_count_min' ? 'Min rows' :
                   type === 'row_count_max' ? 'Max rows' :
                   type === 'null_rate_max' ? 'Null rate' : 'Custom SQL'}
              </button>
            ))}
          </div>
        </div>

        {config.checks.length === 0 && (
          <p className="text-xs text-gray-400 italic py-2">Add at least one check above</p>
        )}

        <div className="space-y-2">
          {config.checks.map((check, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-3 bg-gray-50 relative">
              <button
                type="button"
                onClick={() => removeCheck(i)}
                className="absolute top-2 right-2 text-gray-300 hover:text-red-400 transition-colors"
              >
                <Trash2 size={12} />
              </button>

              {check.type === 'row_count_min' && (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-gray-600 shrink-0">Min row count ≥</span>
                  <input
                    type="number"
                    value={check.value ?? 1}
                    onChange={(e) => updateCheck(i, { ...check, value: Number(e.target.value) })}
                    className="w-28 px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                    min={0}
                  />
                </div>
              )}

              {check.type === 'row_count_max' && (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-gray-600 shrink-0">Max row count ≤</span>
                  <input
                    type="number"
                    value={check.value ?? 1000000}
                    onChange={(e) => updateCheck(i, { ...check, value: Number(e.target.value) })}
                    className="w-28 px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                    min={0}
                  />
                </div>
              )}

              {check.type === 'null_rate_max' && (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-medium text-gray-600 shrink-0">Column</span>
                  <input
                    type="text"
                    value={check.column ?? ''}
                    onChange={(e) => updateCheck(i, { ...check, column: e.target.value })}
                    placeholder="column_name"
                    className="w-36 px-2.5 py-1.5 text-sm font-mono border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                  />
                  <span className="text-xs text-gray-600 shrink-0">null rate ≤</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={check.pct ?? 5}
                      onChange={(e) => updateCheck(i, { ...check, pct: Number(e.target.value) })}
                      className="w-20 px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                      min={0} max={100} step={0.1}
                    />
                    <span className="text-xs text-gray-500">%</span>
                  </div>
                </div>
              )}

              {check.type === 'custom_sql' && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-600">Custom SQL — use <code className="bg-gray-100 px-1 rounded">{'{table}'}</code> for the table name</p>
                  <textarea
                    value={check.sql ?? ''}
                    onChange={(e) => updateCheck(i, { ...check, sql: e.target.value })}
                    placeholder="SELECT COUNT(*) AS cnt FROM {table} WHERE col IS NULL"
                    rows={2}
                    spellCheck={false}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white resize-y"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 shrink-0">Trigger when</span>
                    <select
                      value={check.condition ?? 'rows_returned > 0'}
                      onChange={(e) => updateCheck(i, { ...check, condition: e.target.value })}
                      className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                      <option value="rows_returned > 0">query returns any rows</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Source Freshness Config ───────────────────────────────────────────────────

function SourceFreshnessForm({
  config, onChange,
}: { config: SourceFreshnessConfig; onChange: (c: SourceFreshnessConfig) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Table *</label>
        <input
          type="text"
          value={config.table}
          onChange={(e) => onChange({ ...config, table: e.target.value })}
          placeholder="e.g. My Space.orders"
          className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Timestamp Column *</label>
        <input
          type="text"
          value={config.timestamp_column}
          onChange={(e) => onChange({ ...config, timestamp_column: e.target.value })}
          placeholder="e.g. updated_at or loaded_at"
          className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <p className="text-xs text-gray-400 mt-1">
          Must be a TIMESTAMP or DATETIME column. Transform Studio will run <code className="bg-gray-100 px-1 rounded">MAX(column)</code> to find the last load time.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Warn after (hours)</label>
          <input
            type="number"
            value={config.warn_after_hours}
            onChange={(e) => onChange({ ...config, warn_after_hours: Number(e.target.value) })}
            placeholder="e.g. 24"
            min={0.5}
            step={0.5}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Error after (hours)</label>
          <input
            type="number"
            value={config.error_after_hours}
            onChange={(e) => onChange({ ...config, error_after_hours: Number(e.target.value) })}
            placeholder="e.g. 48"
            min={0.5}
            step={0.5}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>
      <p className="text-xs text-gray-400">
        Alert triggers when the most recent record in the table is older than the warn threshold.
        The error threshold is shown in the alert message to indicate severity.
      </p>
    </div>
  )
}


// ── Main Modal ────────────────────────────────────────────────────────────────

const DEFAULT_SQL_CONFIG: SqlAlertConfig = {
  sql: '', condition: 'rows_returned > 0',
}
const DEFAULT_PIPELINE_CONFIG: PipelineHealthConfig = {
  pipeline_id: '', pipeline_name: '',
  check_failure: true, check_duration: false, duration_threshold_secs: 300,
  check_row_count_change: false, row_count_change_pct: 20,
  check_not_run: false, not_run_hours: 24,
}
const DEFAULT_DATA_QUALITY_CONFIG: DataQualityConfig = {
  table: '', checks: [],
}
const DEFAULT_FRESHNESS_CONFIG: SourceFreshnessConfig = {
  table: '', timestamp_column: '', warn_after_hours: 24, error_after_hours: 48,
}

export default function CreateAlertModal({ existing, onClose, onSaved }: Props) {
  const [name, setName] = useState(existing?.name ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [alertType, setAlertType] = useState<AlertType>(existing?.alert_type ?? 'sql')
  const [schedule, setSchedule] = useState(existing?.schedule ?? '0 * * * *')
  const [notifyEmail, setNotifyEmail] = useState(existing?.notify_email ?? true)
  const [notifySlack, setNotifySlack] = useState(existing?.notify_slack ?? true)

  // Type-specific configs
  const [sqlConfig, setSqlConfig] = useState<SqlAlertConfig>(() => {
    if (existing?.alert_type === 'sql') {
      try { return JSON.parse(existing.config_json) } catch { /* */ }
    }
    return DEFAULT_SQL_CONFIG
  })
  const [pipelineConfig, setPipelineConfig] = useState<PipelineHealthConfig>(() => {
    if (existing?.alert_type === 'pipeline_health') {
      try { return JSON.parse(existing.config_json) } catch { /* */ }
    }
    return DEFAULT_PIPELINE_CONFIG
  })
  const [dataQualityConfig, setDataQualityConfig] = useState<DataQualityConfig>(() => {
    if (existing?.alert_type === 'data_quality') {
      try { return JSON.parse(existing.config_json) } catch { /* */ }
    }
    return DEFAULT_DATA_QUALITY_CONFIG
  })
  const [freshnessConfig, setFreshnessConfig] = useState<SourceFreshnessConfig>(() => {
    if (existing?.alert_type === 'source_freshness') {
      try { return JSON.parse(existing.config_json) } catch { /* */ }
    }
    return DEFAULT_FRESHNESS_CONFIG
  })

  const [error, setError] = useState('')

  const createMut = useMutation({ mutationFn: createAlert, onSuccess: onSaved, onError: (e: Error) => setError(e.message) })
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Alert> }) => updateAlert(id, data),
    onSuccess: onSaved,
    onError: (e: Error) => setError(e.message),
  })

  const getConfigJson = () => {
    if (alertType === 'sql') {
      const cfg = { ...sqlConfig }
      if (cfg.condition === 'value > N') cfg.condition = `value > ${cfg.threshold ?? 0}` as any
      if (cfg.condition === 'value < N') cfg.condition = `value < ${cfg.threshold ?? 0}` as any
      return JSON.stringify(cfg)
    }
    if (alertType === 'pipeline_health') return JSON.stringify(pipelineConfig)
    if (alertType === 'source_freshness') return JSON.stringify(freshnessConfig)
    return JSON.stringify(dataQualityConfig)
  }

  const validate = (): string | null => {
    if (!name.trim()) return 'Name is required'
    if (!schedule.trim()) return 'Schedule is required'
    if (alertType === 'sql' && !sqlConfig.sql.trim()) return 'SQL query is required'
    if (alertType === 'pipeline_health' && !pipelineConfig.pipeline_id) return 'Select a pipeline'
    if (alertType === 'pipeline_health') {
      const checks = [pipelineConfig.check_failure, pipelineConfig.check_duration,
        pipelineConfig.check_row_count_change, pipelineConfig.check_not_run]
      if (!checks.some(Boolean)) return 'Enable at least one health check'
    }
    if (alertType === 'data_quality' && !dataQualityConfig.table.trim()) return 'Table name is required'
    if (alertType === 'data_quality' && dataQualityConfig.checks.length === 0) return 'Add at least one data quality check'
    if (alertType === 'source_freshness' && !freshnessConfig.table.trim()) return 'Table name is required'
    if (alertType === 'source_freshness' && !freshnessConfig.timestamp_column.trim()) return 'Timestamp column is required'
    return null
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }

    const payload = {
      name: name.trim(),
      description: description.trim(),
      alert_type: alertType,
      config_json: getConfigJson(),
      schedule: schedule.trim(),
      enabled: true,
      notify_email: notifyEmail,
      notify_slack: notifySlack,
    }

    if (existing) {
      updateMut.mutate({ id: existing.id, data: payload })
    } else {
      createMut.mutate(payload as any)
    }
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="font-semibold text-gray-800">{existing ? 'Edit Alert' : 'New Alert'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

            {/* Name + description */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Alert Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Failed orders spike"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this alert watch?"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>

            {/* Alert type tabs */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">Alert Type</label>
              <div className="flex gap-2">
                {([
                  { id: 'sql', label: '💻 Custom SQL', desc: 'Run any SQL and check the result' },
                  { id: 'pipeline_health', label: '⚙️ Pipeline Health', desc: 'Monitor pipeline run status' },
                  { id: 'data_quality', label: '🔍 Data Quality', desc: 'Check row counts, nulls & more' },
                  { id: 'source_freshness', label: '🕐 Source Freshness', desc: 'Alert when source data goes stale' },
                ] as const).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setAlertType(t.id)}
                    className={clsx(
                      'flex-1 p-3 rounded-lg border text-left transition-all',
                      alertType === t.id
                        ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-400'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    <p className="font-medium text-sm text-gray-800">{t.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Type-specific config */}
            <div className="border border-gray-200 rounded-lg p-4">
              {alertType === 'sql' && (
                <SqlConfigForm config={sqlConfig} onChange={setSqlConfig} />
              )}
              {alertType === 'pipeline_health' && (
                <PipelineHealthForm config={pipelineConfig} onChange={setPipelineConfig} />
              )}
              {alertType === 'data_quality' && (
                <DataQualityForm config={dataQualityConfig} onChange={setDataQualityConfig} />
              )}
              {alertType === 'source_freshness' && (
                <SourceFreshnessForm config={freshnessConfig} onChange={setFreshnessConfig} />
              )}
            </div>

            {/* Schedule */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Check Schedule (cron)</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {CRON_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setSchedule(p.value)}
                    className={clsx(
                      'text-xs px-2.5 py-1 rounded-full border transition-colors',
                      schedule === p.value
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <input
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="*/15 * * * *"
                className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {/* Notifications */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">Notifications (uses Connection Settings)</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyEmail}
                    onChange={(e) => setNotifyEmail(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">Email</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifySlack}
                    onChange={(e) => setNotifySlack(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">Slack</span>
                </label>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Save size={14} />
              {isPending ? 'Saving…' : existing ? 'Update Alert' : 'Create Alert'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
