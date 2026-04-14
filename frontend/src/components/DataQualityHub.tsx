import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Plus, ShieldCheck, ShieldAlert, ShieldX,
  Play, Trash2, Pencil, CheckCircle2, AlertTriangle, XCircle,
  Loader2, ChevronRight, ChevronDown, RefreshCw, X, Clock,
  BarChart2, Database, CheckSquare, Settings2,
} from 'lucide-react'
import clsx from 'clsx'
import type {
  DQMonitor, DQRule, DQScanResult, DQRuleResult,
} from '../api/client'
import {
  fetchDQRules, fetchDQMonitors, createDQMonitor, updateDQMonitor,
  deleteDQMonitor, runDQScan, fetchDQScanResults, fetchDQDashboard,
} from '../api/client'

interface Props {
  onClose: () => void
}

// ── Score ring / badge helpers ────────────────────────────────────────────────

function scoreColor(score?: number | null): string {
  if (score == null) return '#6b7280'
  if (score >= 90) return '#10b981'
  if (score >= 70) return '#f59e0b'
  return '#ef4444'
}

function ScoreBadge({ score }: { score?: number | null }) {
  const color = scoreColor(score)
  if (score == null) return (
    <span className="text-xs text-gray-400 font-mono">—</span>
  )
  return (
    <span className="text-sm font-bold font-mono" style={{ color }}>
      {score.toFixed(1)}%
    </span>
  )
}

function ScoreRing({ score, size = 48 }: { score?: number | null; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const pct = score != null ? Math.min(100, Math.max(0, score)) : 0
  const dash = (pct / 100) * circ
  const color = scoreColor(score)
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e293b" strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.4s ease' }}
      />
      <text
        x={size / 2} y={size / 2 + 5}
        textAnchor="middle" fill={score == null ? '#6b7280' : color}
        fontSize={score == null ? 11 : 10} fontWeight="bold"
        style={{ transform: 'rotate(90deg)', transformOrigin: `${size / 2}px ${size / 2}px`, fontFamily: 'monospace' }}
      >
        {score == null ? '—' : `${score.toFixed(0)}%`}
      </text>
    </svg>
  )
}

function RuleStatusIcon({ status }: { status: DQRuleResult['status'] }) {
  if (status === 'passed') return <CheckCircle2 size={13} className="text-emerald-500" />
  if (status === 'warned') return <AlertTriangle size={13} className="text-amber-500" />
  if (status === 'failed') return <XCircle size={13} className="text-red-500" />
  return <AlertTriangle size={13} className="text-gray-400" />
}

// ── Rule results table ────────────────────────────────────────────────────────

function RuleResultsTable({ results }: { results: DQRuleResult[] }) {
  if (!results.length) return (
    <div className="text-xs text-gray-400 italic p-3">No rule results</div>
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-navy-800/60 text-surface-400">
            <th className="text-left px-3 py-2 font-medium">Rule</th>
            <th className="text-left px-3 py-2 font-medium">Status</th>
            <th className="text-right px-3 py-2 font-medium">Score</th>
            <th className="text-left px-3 py-2 font-medium">Detail</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={i} className="border-t border-navy-800/40 hover:bg-navy-800/20">
              <td className="px-3 py-2 text-white font-medium">{r.rule_name}</td>
              <td className="px-3 py-2">
                <span className={clsx(
                  'flex items-center gap-1 w-fit px-1.5 py-0.5 rounded-full font-medium',
                  r.status === 'passed' && 'bg-emerald-950/60 text-emerald-400',
                  r.status === 'warned' && 'bg-amber-950/60 text-amber-400',
                  r.status === 'failed' && 'bg-red-950/60 text-red-400',
                  r.status === 'error' && 'bg-gray-800 text-gray-400',
                )}>
                  <RuleStatusIcon status={r.status} />
                  {r.status}
                </span>
              </td>
              <td className="px-3 py-2 text-right font-mono">
                <span style={{ color: scoreColor(r.pass_rate) }}>
                  {r.pass_rate.toFixed(1)}%
                </span>
              </td>
              <td className="px-3 py-2 text-surface-400 max-w-xs truncate">{r.detail || r.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Scan history row ──────────────────────────────────────────────────────────

function ScanHistoryRow({ scan }: { scan: DQScanResult }) {
  const [expanded, setExpanded] = useState(false)
  let ruleResults: DQRuleResult[] = []
  try {
    ruleResults = JSON.parse(scan.rule_results_json ?? '[]')
  } catch {}

  return (
    <div className="border border-navy-800/40 rounded-lg overflow-hidden mb-2">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-navy-800/30 text-left transition-colors"
      >
        {expanded ? <ChevronDown size={12} className="text-surface-400 shrink-0" /> : <ChevronRight size={12} className="text-surface-400 shrink-0" />}
        <span className="text-xs text-surface-400 font-mono shrink-0">
          {new Date(scan.scanned_at).toLocaleString()}
        </span>
        <span className={clsx(
          'text-xs font-semibold px-2 py-0.5 rounded-full',
          scan.status === 'passed' && 'bg-emerald-950/60 text-emerald-400',
          scan.status === 'warned' && 'bg-amber-950/60 text-amber-400',
          (scan.status === 'failed' || scan.status === 'error') && 'bg-red-950/60 text-red-400',
          !['passed', 'warned', 'failed', 'error'].includes(scan.status) && 'bg-gray-800 text-gray-400',
        )}>
          {scan.status}
        </span>
        <ScoreBadge score={scan.overall_score} />
        {scan.duration_ms != null && (
          <span className="text-xs text-surface-500 ml-auto shrink-0">{scan.duration_ms}ms</span>
        )}
      </button>
      {expanded && (
        <div className="border-t border-navy-800/40">
          {scan.error_message ? (
            <div className="px-4 py-3 text-xs text-red-400 bg-red-950/20">{scan.error_message}</div>
          ) : (
            <RuleResultsTable results={ruleResults} />
          )}
        </div>
      )}
    </div>
  )
}

// ── Create / Edit Monitor Modal ───────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  completeness: 'bg-blue-950/60 text-blue-400',
  validity: 'bg-purple-950/60 text-purple-400',
  uniqueness: 'bg-indigo-950/60 text-indigo-400',
  accuracy: 'bg-teal-950/60 text-teal-400',
  timeliness: 'bg-amber-950/60 text-amber-400',
  consistency: 'bg-pink-950/60 text-pink-400',
  custom: 'bg-gray-800 text-gray-400',
}

interface RuleEntry {
  rule_id: string
  config: Record<string, unknown>
  weight: number
}

interface CreateMonitorModalProps {
  monitor?: DQMonitor | null
  rules: DQRule[]
  onSave: (data: { table_name: string; display_name: string; rules_json: string; enabled: boolean }) => void
  onClose: () => void
  saving: boolean
}

function CreateMonitorModal({ monitor, rules, onSave, onClose, saving }: CreateMonitorModalProps) {
  const [tableName, setTableName] = useState(monitor?.table_name ?? '')
  const [displayName, setDisplayName] = useState(monitor?.display_name ?? '')
  const [enabled, setEnabled] = useState(monitor?.enabled ?? true)
  const [selectedRules, setSelectedRules] = useState<RuleEntry[]>(() => {
    try {
      return JSON.parse(monitor?.rules_json ?? '[]')
    } catch { return [] }
  })
  const [addingRule, setAddingRule] = useState<DQRule | null>(null)
  const [ruleConfig, setRuleConfig] = useState<Record<string, string>>({})
  const [ruleWeight, setRuleWeight] = useState('1.0')
  const [search, setSearch] = useState('')

  const filteredRules = rules.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.description.toLowerCase().includes(search.toLowerCase()) ||
    r.category.toLowerCase().includes(search.toLowerCase())
  )

  const addRule = (rule: DQRule) => {
    setAddingRule(rule)
    setRuleConfig({})
    setRuleWeight('1.0')
  }

  const confirmAddRule = () => {
    if (!addingRule) return
    const configToAdd: Record<string, unknown> = {}
    ;(addingRule.config_schema ?? []).forEach((field) => {
      if (field.type === 'readonly') return
      const val = ruleConfig[field.key] ?? ''
      if (field.type === 'number') {
        configToAdd[field.key] = val !== '' ? parseFloat(val) : (field.default ?? 0)
      } else {
        configToAdd[field.key] = val !== '' ? val : (field.default ?? '')
      }
    })
    setSelectedRules(prev => [...prev, { rule_id: addingRule.id, config: configToAdd, weight: parseFloat(ruleWeight) || 1.0 }])
    setAddingRule(null)
  }

  const removeRule = (idx: number) => {
    setSelectedRules(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSave = () => {
    onSave({
      table_name: tableName.trim(),
      display_name: displayName.trim() || tableName.trim(),
      rules_json: JSON.stringify(selectedRules),
      enabled,
    })
  }

  const ruleMap = Object.fromEntries(rules.map(r => [r.id, r]))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl mx-4 bg-navy-900 border border-navy-700 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-800 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-white">{monitor ? 'Edit Monitor' : 'New DQ Monitor'}</h2>
            <p className="text-xs text-surface-400 mt-0.5">Configure data quality checks for a Dremio table</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded text-surface-400 hover:text-white hover:bg-navy-700 transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Table + display name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1.5">Dremio Table <span className="text-red-400">*</span></label>
              <input
                value={tableName}
                onChange={e => setTableName(e.target.value)}
                placeholder="my_space.my_table"
                className="w-full px-3 py-2 text-sm bg-navy-800 border border-navy-700 rounded-lg text-white placeholder-surface-600 focus:outline-none focus:ring-2 focus:ring-dblue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1.5">Display Name</label>
              <input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Optional friendly name"
                className="w-full px-3 py-2 text-sm bg-navy-800 border border-navy-700 rounded-lg text-white placeholder-surface-600 focus:outline-none focus:ring-2 focus:ring-dblue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Selected rules */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-surface-300">Active Rules ({selectedRules.length})</label>
            </div>
            {selectedRules.length === 0 ? (
              <div className="border border-dashed border-navy-700 rounded-lg p-4 text-center text-xs text-surface-500">
                No rules added yet — pick rules from the catalog below
              </div>
            ) : (
              <div className="space-y-1.5">
                {selectedRules.map((sr, i) => {
                  const ruleDef = ruleMap[sr.rule_id]
                  return (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-navy-800/60 border border-navy-700/60 rounded-lg">
                      <CheckSquare size={12} className="text-dblue-400 shrink-0" />
                      <span className="text-xs text-white font-medium flex-1">{ruleDef?.name ?? sr.rule_id}</span>
                      {sr.config && Object.keys(sr.config).length > 0 && (
                        <span className="text-xs text-surface-500 max-w-[200px] truncate font-mono">
                          {Object.entries(sr.config).map(([k, v]) => `${k}=${v}`).join(', ')}
                        </span>
                      )}
                      <span className="text-xs text-surface-500">w={sr.weight}</span>
                      <button onClick={() => removeRule(i)} className="p-0.5 rounded text-surface-500 hover:text-red-400 transition-colors ml-1">
                        <X size={11} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Rule catalog */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs font-medium text-surface-300">Rule Catalog</label>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search rules…"
                className="ml-auto px-2 py-1 text-xs bg-navy-800 border border-navy-700 rounded text-white placeholder-surface-600 focus:outline-none focus:ring-1 focus:ring-dblue-500 w-40"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
              {filteredRules.map(rule => {
                const already = selectedRules.some(sr => sr.rule_id === rule.id)
                return (
                  <button
                    key={rule.id}
                    onClick={() => !already && addRule(rule)}
                    disabled={already}
                    className={clsx(
                      'text-left px-3 py-2 rounded-lg border transition-colors',
                      already
                        ? 'border-dblue-500/40 bg-dblue-950/30 cursor-default opacity-60'
                        : 'border-navy-700 bg-navy-800/40 hover:border-dblue-500 hover:bg-navy-800 cursor-pointer',
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={clsx('text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded', CATEGORY_COLORS[rule.category] ?? 'bg-gray-800 text-gray-400')}>
                        {rule.category}
                      </span>
                      {already && <CheckCircle2 size={10} className="text-dblue-400 ml-auto" />}
                    </div>
                    <div className="text-xs text-white font-medium leading-tight">{rule.name}</div>
                    <div className="text-[10px] text-surface-500 mt-0.5 leading-tight line-clamp-2">{rule.description}</div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-navy-800 shrink-0">
          <label className="flex items-center gap-2 text-xs text-surface-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => setEnabled(e.target.checked)}
              className="accent-dblue-500"
            />
            Enabled
          </label>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-xs text-surface-400 hover:text-white transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !tableName.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-dblue-500 hover:bg-dblue-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              {monitor ? 'Save Changes' : 'Create Monitor'}
            </button>
          </div>
        </div>
      </div>

      {/* Rule config sub-modal */}
      {addingRule && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm mx-4 bg-navy-900 border border-navy-700 rounded-xl shadow-2xl">
            <div className="px-5 py-4 border-b border-navy-800">
              <h3 className="text-sm font-semibold text-white">{addingRule.name}</h3>
              <p className="text-xs text-surface-400 mt-0.5">{addingRule.description}</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              {(addingRule.config_schema ?? []).filter(f => f.type !== 'readonly').map((field) => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-surface-300 mb-1">
                    {field.label} {field.required && <span className="text-red-400">*</span>}
                  </label>
                  {field.type === 'sql' ? (
                    <textarea
                      rows={4}
                      value={ruleConfig[field.key] ?? ''}
                      onChange={e => setRuleConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.default != null ? String(field.default) : 'SELECT ... AS pass_rate'}
                      className="w-full px-3 py-2 text-sm bg-navy-800 border border-navy-700 rounded-lg text-white placeholder-surface-600 focus:outline-none focus:ring-1 focus:ring-dblue-500 font-mono resize-y"
                    />
                  ) : (
                    <input
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={ruleConfig[field.key] ?? ''}
                      onChange={e => setRuleConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.default != null ? String(field.default) : ''}
                      className="w-full px-3 py-2 text-sm bg-navy-800 border border-navy-700 rounded-lg text-white placeholder-surface-600 focus:outline-none focus:ring-1 focus:ring-dblue-500"
                    />
                  )}
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-surface-300 mb-1">Weight (1 = equal)</label>
                <input
                  type="number" min="0.1" max="10" step="0.5"
                  value={ruleWeight}
                  onChange={e => setRuleWeight(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-navy-800 border border-navy-700 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-dblue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-navy-800">
              <button onClick={() => setAddingRule(null)} className="px-3 py-1.5 text-xs text-surface-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={confirmAddRule}
                className="px-3 py-1.5 bg-dblue-500 hover:bg-dblue-600 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Add Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Monitor detail view ───────────────────────────────────────────────────────

function MonitorDetail({
  monitor,
  rules,
  onBack,
  onEdit,
  onDelete,
}: {
  monitor: DQMonitor
  rules: DQRule[]
  onBack: () => void
  onEdit: (m: DQMonitor) => void
  onDelete: (id: string) => void
}) {
  const qc = useQueryClient()
  const { data: scanHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ['dq-scan-results', monitor.id],
    queryFn: () => fetchDQScanResults(monitor.id, 20),
    staleTime: 30_000,
  })

  const scanMut = useMutation({
    mutationFn: () => runDQScan(monitor.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dq-scan-results', monitor.id] })
      qc.invalidateQueries({ queryKey: ['dq-monitors'] })
      qc.invalidateQueries({ queryKey: ['dq-dashboard'] })
    },
  })

  const configuredRules = (() => {
    try { return JSON.parse(monitor.rules_json ?? '[]') as { rule_id: string; config: Record<string, unknown>; weight: number }[] }
    catch { return [] }
  })()
  const ruleMap = Object.fromEntries(rules.map(r => [r.id, r]))

  const latest = scanHistory[0]
  let latestRuleResults: DQRuleResult[] = []
  try { latestRuleResults = JSON.parse(latest?.rule_results_json ?? '[]') }
  catch {}

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-navy-800 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-surface-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={13} /> Back
        </button>
        <div className="h-4 w-px bg-navy-700" />
        <Database size={14} className="text-dblue-400" />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-white truncate">{monitor.display_name}</h2>
          <p className="text-xs text-surface-400 font-mono">{monitor.table_name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onEdit(monitor)}
            className="p-1.5 rounded text-surface-400 hover:text-white hover:bg-navy-700 transition-colors"
            title="Edit monitor"
          >
            <Settings2 size={14} />
          </button>
          <button
            onClick={() => scanMut.mutate()}
            disabled={scanMut.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-dblue-500 hover:bg-dblue-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {scanMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            Scan Now
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: summary */}
        <div className="w-64 shrink-0 border-r border-navy-800 p-5 flex flex-col gap-5 overflow-y-auto">
          {/* Score ring */}
          <div className="flex flex-col items-center gap-2 py-4">
            <ScoreRing score={monitor.last_score} size={80} />
            <div className="text-center">
              <div className="text-xs font-semibold text-white">DQ Score</div>
              {monitor.last_scan_at && (
                <div className="text-xs text-surface-500 mt-0.5">
                  {new Date(monitor.last_scan_at).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>

          {/* Configured rules */}
          <div>
            <div className="text-xs font-semibold text-surface-300 mb-2">Active Rules ({configuredRules.length})</div>
            {configuredRules.length === 0 ? (
              <div className="text-xs text-surface-500 italic">No rules configured</div>
            ) : (
              <div className="space-y-1.5">
                {configuredRules.map((cr, i) => {
                  const ruleDef = ruleMap[cr.rule_id]
                  const latestResult = latestRuleResults.find(r => r.rule_id === cr.rule_id)
                  return (
                    <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-navy-800/40 rounded">
                      {latestResult
                        ? <RuleStatusIcon status={latestResult.status} />
                        : <CheckSquare size={11} className="text-surface-500" />
                      }
                      <span className="text-xs text-white flex-1 truncate">{ruleDef?.name ?? cr.rule_id}</span>
                      {latestResult && (
                        <span className="text-xs font-mono" style={{ color: scoreColor(latestResult.pass_rate) }}>
                          {latestResult.pass_rate.toFixed(0)}%
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Delete */}
          <div className="mt-auto">
            <button
              onClick={() => onDelete(monitor.id)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-red-800/50 text-red-400 hover:bg-red-950/40 rounded-lg text-xs transition-colors"
            >
              <Trash2 size={11} />
              Delete Monitor
            </button>
          </div>
        </div>

        {/* Right: latest results + history */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Latest scan results */}
          {latest && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-surface-300 mb-3 flex items-center gap-1.5">
                <BarChart2 size={12} className="text-dblue-400" />
                Latest Scan Results
                <span className="text-surface-500 font-normal ml-1">
                  {new Date(latest.scanned_at).toLocaleString()}
                </span>
              </h3>
              {latest.error_message ? (
                <div className="bg-red-950/30 border border-red-800/40 rounded-lg p-3 text-xs text-red-400">
                  {latest.error_message}
                </div>
              ) : (
                <div className="bg-navy-800/30 border border-navy-700/40 rounded-lg overflow-hidden">
                  <RuleResultsTable results={latestRuleResults} />
                </div>
              )}
            </div>
          )}

          {/* Scan history */}
          <div>
            <h3 className="text-xs font-semibold text-surface-300 mb-3 flex items-center gap-1.5">
              <Clock size={12} className="text-surface-400" />
              Scan History ({scanHistory.length})
            </h3>
            {historyLoading ? (
              <div className="flex items-center gap-2 text-xs text-surface-400">
                <Loader2 size={12} className="animate-spin" /> Loading…
              </div>
            ) : scanHistory.length === 0 ? (
              <div className="text-xs text-surface-500 italic">No scans yet — click Scan Now to run the first one</div>
            ) : (
              scanHistory.map(scan => <ScanHistoryRow key={scan.id} scan={scan} />)
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main DataQualityHub page ──────────────────────────────────────────────────

export default function DataQualityHub({ onClose }: Props) {
  const qc = useQueryClient()

  const [selectedMonitorId, setSelectedMonitorId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingMonitor, setEditingMonitor] = useState<DQMonitor | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const { data: monitors = [], isLoading: monitorsLoading } = useQuery({
    queryKey: ['dq-monitors'],
    queryFn: fetchDQMonitors,
    staleTime: 30_000,
  })

  const { data: rules = [] } = useQuery({
    queryKey: ['dq-rules'],
    queryFn: fetchDQRules,
    staleTime: Infinity,
  })

  const createMut = useMutation({
    mutationFn: createDQMonitor,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dq-monitors'] })
      setShowCreateModal(false)
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<DQMonitor> }) =>
      updateDQMonitor(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dq-monitors'] })
      setEditingMonitor(null)
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteDQMonitor,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dq-monitors'] })
      if (selectedMonitorId === deleteConfirm) setSelectedMonitorId(null)
      setDeleteConfirm(null)
    },
  })

  const scanMut = useMutation({
    mutationFn: runDQScan,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dq-monitors'] })
    },
  })

  const selectedMonitor = monitors.find(m => m.id === selectedMonitorId) ?? null

  const handleSaveMonitor = (data: { table_name: string; display_name: string; rules_json: string; enabled: boolean }) => {
    if (editingMonitor) {
      updateMut.mutate({ id: editingMonitor.id, data })
    } else {
      createMut.mutate(data)
    }
  }

  // Summary stats
  const totalMonitors = monitors.length
  const avgScore = monitors.filter(m => m.last_score != null).length
    ? monitors.filter(m => m.last_score != null).reduce((s, m) => s + (m.last_score ?? 0), 0) /
      monitors.filter(m => m.last_score != null).length
    : null
  const passing = monitors.filter(m => m.last_score != null && m.last_score >= 90).length
  const failing = monitors.filter(m => m.last_score != null && m.last_score < 70).length

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-navy-950">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-6 py-3 bg-navy-900 border-b border-navy-800 shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-xs text-surface-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={13} /> Back
        </button>
        <div className="h-4 w-px bg-navy-700" />
        <ShieldCheck size={16} className="text-emerald-400" />
        <h1 className="text-sm font-semibold text-white">Data Quality Hub</h1>
        <div className="flex-1" />
        <button
          onClick={() => { setEditingMonitor(null); setShowCreateModal(true) }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-dblue-500 hover:bg-dblue-600 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          <Plus size={12} /> New Monitor
        </button>
      </header>

      {selectedMonitor ? (
        <MonitorDetail
          monitor={selectedMonitor}
          rules={rules}
          onBack={() => setSelectedMonitorId(null)}
          onEdit={(m) => { setEditingMonitor(m); setShowCreateModal(true) }}
          onDelete={(id) => setDeleteConfirm(id)}
        />
      ) : (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4 px-6 py-5 border-b border-navy-800 shrink-0">
            <div className="bg-navy-900 border border-navy-700 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{totalMonitors}</div>
              <div className="text-xs text-surface-400 mt-1">Monitors</div>
            </div>
            <div className="bg-navy-900 border border-navy-700 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold" style={{ color: scoreColor(avgScore) }}>
                {avgScore != null ? `${avgScore.toFixed(1)}%` : '—'}
              </div>
              <div className="text-xs text-surface-400 mt-1">Avg Score</div>
            </div>
            <div className="bg-navy-900 border border-emerald-800/50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-emerald-400">{passing}</div>
              <div className="text-xs text-surface-400 mt-1">Passing ≥ 90%</div>
            </div>
            <div className="bg-navy-900 border border-red-800/50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-red-400">{failing}</div>
              <div className="text-xs text-surface-400 mt-1">Failing &lt; 70%</div>
            </div>
          </div>

          {/* Monitors grid */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {monitorsLoading ? (
              <div className="flex items-center gap-2 text-sm text-surface-400 justify-center mt-12">
                <Loader2 size={16} className="animate-spin" /> Loading monitors…
              </div>
            ) : monitors.length === 0 ? (
              <div className="flex flex-col items-center justify-center mt-20 text-center">
                <ShieldCheck size={40} className="text-navy-700 mb-4" />
                <h3 className="text-base font-semibold text-white mb-2">No DQ Monitors Yet</h3>
                <p className="text-sm text-surface-400 max-w-sm mb-6">
                  Create a monitor for any Dremio table to start tracking data quality with 14 configurable rules.
                </p>
                <button
                  onClick={() => { setEditingMonitor(null); setShowCreateModal(true) }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-dblue-500 hover:bg-dblue-600 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  <Plus size={14} /> Create First Monitor
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {monitors.map(m => {
                  const configuredRules = (() => {
                    try { return JSON.parse(m.rules_json ?? '[]').length }
                    catch { return 0 }
                  })()
                  return (
                    <div
                      key={m.id}
                      className="bg-navy-900 border border-navy-700 rounded-xl p-5 hover:border-navy-600 transition-colors cursor-pointer group"
                      onClick={() => setSelectedMonitorId(m.id)}
                    >
                      {/* Card header */}
                      <div className="flex items-start gap-3 mb-4">
                        <ScoreRing score={m.last_score} size={52} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-sm font-semibold text-white truncate">{m.display_name}</h3>
                            {!m.enabled && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-medium shrink-0">OFF</span>
                            )}
                          </div>
                          <p className="text-xs text-surface-400 font-mono mt-0.5 truncate">{m.table_name}</p>
                        </div>
                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => { setEditingMonitor(m); setShowCreateModal(true) }}
                            className="p-1 rounded text-surface-400 hover:text-white hover:bg-navy-700 transition-colors"
                            title="Edit"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={() => scanMut.mutate(m.id)}
                            disabled={scanMut.isPending && scanMut.variables === m.id}
                            className="p-1 rounded text-surface-400 hover:text-dblue-400 hover:bg-navy-700 transition-colors"
                            title="Scan now"
                          >
                            {scanMut.isPending && scanMut.variables === m.id
                              ? <Loader2 size={11} className="animate-spin" />
                              : <Play size={11} />
                            }
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(m.id)}
                            className="p-1 rounded text-surface-400 hover:text-red-400 hover:bg-navy-700 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>

                      {/* Stats row */}
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-surface-400">
                          <span className="text-white font-medium">{configuredRules}</span> rules
                        </span>
                        {m.last_scan_at ? (
                          <span className="text-surface-400 truncate">
                            Last: {new Date(m.last_scan_at).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-surface-500 italic">Never scanned</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      {showCreateModal && (
        <CreateMonitorModal
          monitor={editingMonitor}
          rules={rules}
          onSave={handleSaveMonitor}
          onClose={() => { setShowCreateModal(false); setEditingMonitor(null) }}
          saving={createMut.isPending || updateMut.isPending}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm mx-4 bg-navy-900 border border-navy-700 rounded-xl p-6 shadow-2xl">
            <h3 className="text-sm font-semibold text-white mb-2">Delete Monitor?</h3>
            <p className="text-xs text-surface-400 mb-5">This will permanently delete the monitor and all its scan history.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-xs text-surface-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={() => deleteMut.mutate(deleteConfirm)}
                disabled={deleteMut.isPending}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {deleteMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
