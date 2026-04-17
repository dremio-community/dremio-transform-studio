import { useState, useCallback, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ShieldCheck, LayoutDashboard, Monitor, History, BookOpen, Loader2, Clock, BarChart2, CheckSquare, Bell, BellOff, ToggleLeft, ToggleRight } from 'lucide-react'
import { IconAdd, IconCaretDown, IconCaretLeft, IconCaretRight, IconCheckCircle, IconClose, IconDatasetRun, IconDelete, IconEdit, IconEntityNamespace, IconErrorCircle, IconSearch, IconWarning } from './icons'
import clsx from 'clsx'
import type { DQMonitor, DQRule, DQScanResult, DQRuleResult } from '../api/client'
import type { ColumnSchema, CatalogEntry } from '../types'
import {
  fetchDQRules, fetchDQMonitors, createDQMonitor, updateDQMonitor,
  deleteDQMonitor, runDQScan, fetchDQScanResults,
  fetchDQScanHistory, fetchNamespaces, fetchTables, fetchTableSchema,
} from '../api/client'

interface Props {
  onClose: () => void
}

// ── Types ─────────────────────────────────────────────────────────────────────

type NavSection = 'overview' | 'monitors' | 'history' | 'rules'
type MonitorWizardStep = 1 | 2 | 3

interface RuleEntry {
  rule_id: string
  config: Record<string, unknown>
  weight: number
}

interface HistoryScanResult extends DQScanResult {
  display_name: string
  table_name: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  completeness: 'bg-blue-950/60 text-blue-400',
  validity: 'bg-purple-950/60 text-purple-400',
  uniqueness: 'bg-indigo-950/60 text-indigo-400',
  accuracy: 'bg-teal-950/60 text-teal-400',
  timeliness: 'bg-amber-950/60 text-amber-400',
  consistency: 'bg-pink-950/60 text-pink-400',
  custom: 'bg-gray-800 text-gray-400',
}

const SCHEDULE_PRESETS = [
  { label: 'Never', value: '' },
  { label: 'Hourly', value: '0 * * * *' },
  { label: 'Daily at 8am', value: '0 8 * * *' },
  { label: 'Weekly (Mon 8am)', value: '0 8 * * 1' },
  { label: 'Custom cron…', value: '__custom__' },
]

// ── Helper components ─────────────────────────────────────────────────────────

function scoreColor(score?: number | null): string {
  if (score == null) return '#6b7280'
  if (score >= 90) return '#10b981'
  if (score >= 70) return '#f59e0b'
  return '#ef4444'
}

function ScoreBadge({ score }: { score?: number | null }) {
  const color = scoreColor(score)
  if (score == null) return <span className="text-xs text-gray-400 font-mono">—</span>
  return <span className="text-sm font-bold font-mono" style={{ color }}>{score.toFixed(1)}%</span>
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
  if (status === 'passed') return <IconCheckCircle size={13} className="text-emerald-500" />
  if (status === 'warned') return <IconWarning size={13} className="text-amber-500" />
  if (status === 'failed') return <IconErrorCircle size={13} className="text-red-500" />
  return <IconWarning size={13} className="text-gray-400" />
}

function RuleResultsTable({ results }: { results: DQRuleResult[] }) {
  if (!results.length) return <div className="text-xs text-gray-400 italic p-3">No rule results</div>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-navy-800/60 text-white/60">
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
                <span style={{ color: scoreColor(r.pass_rate) }}>{r.pass_rate.toFixed(1)}%</span>
              </td>
              <td className="px-3 py-2 text-white/60 max-w-xs truncate">{r.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={clsx(
      'text-xs font-semibold px-2 py-0.5 rounded-full',
      status === 'passed' && 'bg-emerald-950/60 text-emerald-400',
      status === 'warned' && 'bg-amber-950/60 text-amber-400',
      (status === 'failed' || status === 'error') && 'bg-red-950/60 text-red-400',
      !['passed', 'warned', 'failed', 'error'].includes(status) && 'bg-gray-800 text-gray-400',
    )}>
      {status}
    </span>
  )
}

// ── Catalog tree picker ───────────────────────────────────────────────────────

function CatalogTreePicker({ onSelect }: { onSelect: (table: string) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')

  const { data: namespaces = [], isLoading: nsLoading } = useQuery({
    queryKey: ['catalog-ns-dq'],
    queryFn: fetchNamespaces,
    staleTime: 60_000,
  })

  const toggleNs = (ns: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(ns)) next.delete(ns)
      else next.add(ns)
      return next
    })
  }

  const filteredNs = searchTerm
    ? namespaces.filter(ns => ns.toLowerCase().includes(searchTerm.toLowerCase()))
    : namespaces

  return (
    <div className="flex flex-col h-full">
      <div className="relative mb-2">
        <IconSearch size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search namespaces…"
          className="w-full pl-7 pr-3 py-1.5 text-xs bg-navy-800 border border-navy-700 rounded-lg text-white placeholder-surface-600 focus:outline-none focus:ring-1 focus:ring-dblue-500"
        />
      </div>
      <div className="flex-1 overflow-y-auto space-y-0.5">
        {nsLoading ? (
          <div className="flex items-center gap-2 text-xs text-white/60 p-2">
            <Loader2 size={12} className="animate-spin" /> Loading catalog…
          </div>
        ) : filteredNs.length === 0 ? (
          <div className="text-xs text-white/55 italic p-2">No namespaces found</div>
        ) : (
          filteredNs.map(ns => (
            <NamespaceRow key={ns} ns={ns} expanded={expanded.has(ns)} onToggle={() => toggleNs(ns)} onSelect={onSelect} />
          ))
        )}
      </div>
    </div>
  )
}

function NamespaceRow({
  ns, expanded, onToggle, onSelect,
}: { ns: string; expanded: boolean; onToggle: () => void; onSelect: (t: string) => void }) {
  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['catalog-tables-dq', ns],
    queryFn: () => fetchTables(ns),
    enabled: expanded,
    staleTime: 60_000,
  })

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-navy-800/60 text-left transition-colors"
      >
        {expanded ? <IconCaretDown size={11} className="text-white/60 shrink-0" /> : <IconCaretRight size={11} className="text-white/60 shrink-0" />}
        <IconEntityNamespace size={11} className="text-primary shrink-0" />
        <span className="text-xs text-white truncate">{ns}</span>
        {isLoading && <Loader2 size={10} className="animate-spin text-white/40 ml-auto" />}
      </button>
      {expanded && !isLoading && (
        <div className="ml-5 border-l border-navy-800/60 pl-1 space-y-0.5">
          {tables.length === 0 ? (
            <div className="text-xs text-white/55 italic px-2 py-1">No tables</div>
          ) : (
            tables.map((t: CatalogEntry) => (
              <button
                key={t.name}
                onClick={() => onSelect(`${ns}.${t.name}`)}
                className="w-full flex items-center gap-1.5 px-2 py-1 rounded hover:bg-dblue-500/20 hover:text-primary text-left transition-colors"
              >
                <CheckSquare size={10} className="text-white/40 shrink-0" />
                <span className="text-xs text-white/70 truncate">{t.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Monitor Wizard ─────────────────────────────────────────────────────────────

interface MonitorWizardProps {
  monitor?: DQMonitor | null
  rules: DQRule[]
  onSave: (data: {
    table_name: string
    display_name: string
    rules_json: string
    enabled: boolean
    schedule_cron: string
    alert_threshold: number | undefined
    alert_enabled: boolean
  }) => void
  onClose: () => void
  saving: boolean
}

function MonitorWizard({ monitor, rules, onSave, onClose, saving }: MonitorWizardProps) {
  const [step, setStep] = useState<MonitorWizardStep>(monitor ? 2 : 1)

  // Step 1 state
  const [tableName, setTableName] = useState(monitor?.table_name ?? '')
  const [displayName, setDisplayName] = useState(monitor?.display_name ?? '')
  const [tableColumns, setTableColumns] = useState<ColumnSchema[]>([])

  // Step 2 state
  const [selectedRules, setSelectedRules] = useState<RuleEntry[]>(() => {
    try { return JSON.parse(monitor?.rules_json ?? '[]') } catch { return [] }
  })
  const [addingRule, setAddingRule] = useState<DQRule | null>(null)
  const [ruleConfig, setRuleConfig] = useState<Record<string, string>>({})
  const [ruleWeight, setRuleWeight] = useState('1.0')
  const [ruleSearch, setRuleSearch] = useState('')

  // Step 3 state
  const [schedulePreset, setSchedulePreset] = useState<string>(() => {
    const cron = monitor?.schedule_cron ?? ''
    const preset = SCHEDULE_PRESETS.find(p => p.value === cron && p.value !== '__custom__')
    return preset ? preset.value : (cron ? '__custom__' : '')
  })
  const [customCron, setCustomCron] = useState(
    monitor?.schedule_cron && !SCHEDULE_PRESETS.find(p => p.value === monitor.schedule_cron)
      ? monitor.schedule_cron : ''
  )
  const [alertEnabled, setAlertEnabled] = useState(monitor?.alert_enabled ?? false)
  const [alertThreshold, setAlertThreshold] = useState<number>(monitor?.alert_threshold ?? 80)
  const [enabled, setEnabled] = useState(monitor?.enabled ?? true)

  const [schemaLoading, setSchemaLoading] = useState(false)

  const handleTableSelect = useCallback((table: string) => {
    setTableName(table)
    if (!displayName) setDisplayName(table.split('.').pop() ?? table)
  }, [displayName])

  const handleStep1Next = async () => {
    if (!tableName.trim()) return
    setSchemaLoading(true)
    try {
      const cols = await fetchTableSchema(tableName.trim())
      setTableColumns(cols)
    } catch {}
    setSchemaLoading(false)
    setStep(2)
  }

  const addRule = (rule: DQRule) => {
    setAddingRule(rule)
    const defaults: Record<string, string> = {}
    rule.config_schema?.forEach(f => {
      if (f.type !== 'readonly' && f.default != null) defaults[f.key] = String(f.default)
    })
    setRuleConfig(defaults)
    setRuleWeight('1.0')
  }

  const confirmAddRule = () => {
    if (!addingRule) return
    const configToAdd: Record<string, unknown> = {}
    ;(addingRule.config_schema ?? []).forEach(field => {
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

  const removeRule = (idx: number) => setSelectedRules(prev => prev.filter((_, i) => i !== idx))

  const handleSave = () => {
    const finalCron = schedulePreset === '__custom__' ? customCron.trim() : schedulePreset
    onSave({
      table_name: tableName.trim(),
      display_name: displayName.trim() || tableName.trim(),
      rules_json: JSON.stringify(selectedRules),
      enabled,
      schedule_cron: finalCron,
      alert_threshold: alertEnabled ? alertThreshold : undefined,
      alert_enabled: alertEnabled,
    })
  }

  const ruleMap = Object.fromEntries(rules.map(r => [r.id, r]))
  const filteredRules = rules.filter(r =>
    r.name.toLowerCase().includes(ruleSearch.toLowerCase()) ||
    r.description.toLowerCase().includes(ruleSearch.toLowerCase()) ||
    r.category.toLowerCase().includes(ruleSearch.toLowerCase())
  )

  const columnNames = tableColumns.map(c => c.name)

  const stepLabel = (n: number) => {
    if (n === 1) return 'Pick Table'
    if (n === 2) return 'Configure Rules'
    return 'Schedule & Alerts'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-3xl mx-4 bg-navy-900 border border-navy-700 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-800 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-white">{monitor ? 'Edit Monitor' : 'New DQ Monitor'}</h2>
            <p className="text-xs text-white/60 mt-0.5">Step {step} of 3 — {stepLabel(step)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded text-white/60 hover:text-white hover:bg-navy-700 transition-colors">
            <IconClose size={14} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 px-6 py-3 border-b border-navy-800 shrink-0">
          {([1, 2, 3] as MonitorWizardStep[]).map((s, i) => (
            <div key={s} className="flex items-center">
              <button
                onClick={() => { if (s < step || (s === 2 && tableName)) setStep(s) }}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors',
                  step === s
                    ? 'bg-dblue-500 text-white'
                    : s < step
                      ? 'bg-navy-700 text-white/70 hover:bg-white/15 cursor-pointer'
                      : 'bg-navy-800/40 text-white/40 cursor-default',
                )}
              >
                <span className="w-4 h-4 rounded-full flex items-center justify-center bg-white/10 text-[10px]">{s}</span>
                {stepLabel(s)}
              </button>
              {i < 2 && <IconCaretRight size={12} className="text-white/30 mx-1" />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Step 1: Pick Table */}
          {step === 1 && (
            <div className="flex-1 overflow-hidden flex flex-col p-5 gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1.5">Table Path <span className="text-red-400">*</span></label>
                  <input
                    value={tableName}
                    onChange={e => setTableName(e.target.value)}
                    placeholder="my_space.my_table"
                    className="w-full px-3 py-2 text-sm bg-navy-800 border border-navy-700 rounded-lg text-white placeholder-surface-600 focus:outline-none focus:ring-2 focus:ring-dblue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1.5">Display Name</label>
                  <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Optional friendly name"
                    className="w-full px-3 py-2 text-sm bg-navy-800 border border-navy-700 rounded-lg text-white placeholder-surface-600 focus:outline-none focus:ring-2 focus:ring-dblue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex-1 bg-white/6 border border-white/10 rounded-lg p-3 overflow-hidden flex flex-col">
                <div className="text-xs font-medium text-white/70 mb-2">Browse Catalog</div>
                <div className="flex-1 overflow-hidden">
                  <CatalogTreePicker onSelect={handleTableSelect} />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Configure Rules */}
          {step === 2 && (
            <div className="flex-1 overflow-hidden flex gap-0">
              {/* Left: selected rules */}
              <div className="w-72 shrink-0 border-r border-navy-800 flex flex-col p-4">
                <div className="text-xs font-semibold text-white/70 mb-2">
                  Active Rules ({selectedRules.length})
                </div>
                {selectedRules.length === 0 ? (
                  <div className="border border-dashed border-navy-700 rounded-lg p-4 text-center text-xs text-white/55">
                    Pick rules from the catalog →
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                    {selectedRules.map((sr, i) => {
                      const ruleDef = ruleMap[sr.rule_id]
                      return (
                        <div key={i} className="px-3 py-2 bg-white/8 border border-white/12 rounded-lg">
                          <div className="flex items-center gap-1.5 mb-1">
                            <CheckSquare size={11} className="text-primary shrink-0" />
                            <span className="text-xs text-white font-medium flex-1 truncate">{ruleDef?.name ?? sr.rule_id}</span>
                            <button onClick={() => removeRule(i)} className="p-0.5 text-white/40 hover:text-red-400 transition-colors">
                              <IconClose size={11} />
                            </button>
                          </div>
                          {sr.config && Object.keys(sr.config).length > 0 && (
                            <div className="text-[10px] text-white/60 font-mono truncate">
                              {Object.entries(sr.config).map(([k, v]) => `${k}=${v}`).join(', ')}
                            </div>
                          )}
                          <div className="text-[10px] text-white/60 mt-0.5">weight: {sr.weight}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Right: rule catalog */}
              <div className="flex-1 overflow-hidden flex flex-col p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-semibold text-white/70 flex-1">Rule Catalog</span>
                  <div className="relative">
                    <IconSearch size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/40" />
                    <input
                      value={ruleSearch}
                      onChange={e => setRuleSearch(e.target.value)}
                      placeholder="Search…"
                      className="pl-6 pr-3 py-1 text-xs bg-navy-800 border border-navy-700 rounded text-white placeholder-surface-600 focus:outline-none focus:ring-1 focus:ring-dblue-500 w-36"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2 content-start pr-1">
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
                          {already && <IconCheckCircle size={10} className="text-primary ml-auto" />}
                        </div>
                        <div className="text-xs text-white font-medium leading-tight">{rule.name}</div>
                        <div className="text-[10px] text-white/60 mt-0.5 leading-tight line-clamp-2">{rule.description}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Schedule & Alerts */}
          {step === 3 && (
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Schedule */}
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-2">Scan Schedule</label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {SCHEDULE_PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setSchedulePreset(p.value)}
                      className={clsx(
                        'px-3 py-2 rounded-lg border text-xs text-left transition-colors',
                        schedulePreset === p.value
                          ? 'border-dblue-500 bg-dblue-950/40 text-primary'
                          : 'border-navy-700 bg-navy-800/40 text-white/70 hover:border-white/15',
                      )}
                    >
                      {p.label}
                      {p.value && p.value !== '__custom__' && (
                        <span className="block text-[10px] text-white/60 font-mono mt-0.5">{p.value}</span>
                      )}
                    </button>
                  ))}
                </div>
                {schedulePreset === '__custom__' && (
                  <div>
                    <label className="block text-xs text-white/70 mb-1">Custom cron expression</label>
                    <input
                      value={customCron}
                      onChange={e => setCustomCron(e.target.value)}
                      placeholder="0 */6 * * *"
                      className="w-full px-3 py-2 text-sm bg-navy-800 border border-navy-700 rounded-lg text-white placeholder-surface-600 focus:outline-none focus:ring-1 focus:ring-dblue-500 font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Alert threshold */}
              <div className="bg-white/6 border border-white/10 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                      {alertEnabled ? <Bell size={12} className="text-amber-400" /> : <BellOff size={12} className="text-white/40" />}
                      Score Alert
                    </div>
                    <div className="text-[10px] text-white/60 mt-0.5">Notify when DQ score drops below threshold</div>
                  </div>
                  <button
                    onClick={() => setAlertEnabled(v => !v)}
                    className={clsx('transition-colors', alertEnabled ? 'text-primary' : 'text-white/40 hover:text-white/70')}
                  >
                    {alertEnabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                  </button>
                </div>
                {alertEnabled && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-white/70">Threshold</label>
                      <span className="text-xs font-bold font-mono" style={{ color: scoreColor(alertThreshold) }}>{alertThreshold}%</span>
                    </div>
                    <input
                      type="range" min={0} max={100} step={5}
                      value={alertThreshold}
                      onChange={e => setAlertThreshold(parseInt(e.target.value))}
                      className="w-full accent-dblue-500"
                    />
                    <div className="flex justify-between text-[10px] text-white/60 mt-0.5">
                      <span>0%</span><span>50%</span><span>100%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Enable / disable monitor */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="text-xs font-semibold text-white/70">Monitor Enabled</div>
                  <div className="text-[10px] text-white/60 mt-0.5">Disable to pause all scheduled scans</div>
                </div>
                <button onClick={() => setEnabled(v => !v)} className={clsx('transition-colors', enabled ? 'text-emerald-400' : 'text-white/40')}>
                  {enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-navy-800 shrink-0">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                onClick={() => setStep(s => (s - 1) as MonitorWizardStep)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white/60 hover:text-white border border-navy-700 rounded-lg transition-colors"
              >
                <IconCaretLeft size={12} /> Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-xs text-white/60 hover:text-white transition-colors">
              Cancel
            </button>
            {step < 3 ? (
              <button
                onClick={() => step === 1 ? handleStep1Next() : setStep(3)}
                disabled={step === 1 && !tableName.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-sidebar-primary text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {step === 1 && schemaLoading && <Loader2 size={12} className="animate-spin" />}
                Next <IconCaretRight size={12} />
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving || !tableName.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-sidebar-primary text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <IconCheckCircle size={12} />}
                {monitor ? 'Save Changes' : 'Create Monitor'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Rule config sub-modal */}
      {addingRule && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm mx-4 bg-navy-900 border border-navy-700 rounded-xl shadow-2xl">
            <div className="px-5 py-4 border-b border-navy-800">
              <h3 className="text-sm font-semibold text-white">{addingRule.name}</h3>
              <p className="text-xs text-white/60 mt-0.5">{addingRule.description}</p>
            </div>
            <div className="px-5 py-4 space-y-3 max-h-80 overflow-y-auto">
              {(addingRule.config_schema ?? []).filter(f => f.type !== 'readonly').map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-white/70 mb-1">
                    {field.label} {field.required && <span className="text-red-400">*</span>}
                  </label>
                  {field.type === 'column' && columnNames.length > 0 ? (
                    <select
                      value={ruleConfig[field.key] ?? ''}
                      onChange={e => setRuleConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                      className="w-full px-3 py-2 text-sm bg-navy-800 border border-navy-700 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-dblue-500"
                    >
                      <option value="">— select column —</option>
                      {columnNames.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : field.type === 'sql' ? (
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
                <label className="block text-xs font-medium text-white/70 mb-1">Weight (1 = equal)</label>
                <input
                  type="number" min="0.1" max="10" step="0.5"
                  value={ruleWeight}
                  onChange={e => setRuleWeight(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-navy-800 border border-navy-700 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-dblue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-navy-800">
              <button onClick={() => setAddingRule(null)} className="px-3 py-1.5 text-xs text-white/60 hover:text-white transition-colors">Cancel</button>
              <button onClick={confirmAddRule} className="px-3 py-1.5 bg-primary hover:bg-sidebar-primary text-white text-xs font-semibold rounded-lg transition-colors">Add Rule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Overview section ──────────────────────────────────────────────────────────

function OverviewSection({
  monitors,
  onSelectMonitor,
}: {
  monitors: DQMonitor[]
  onSelectMonitor: (id: string) => void
}) {
  const total = monitors.length
  const scores = monitors.filter(m => m.last_score != null).map(m => m.last_score as number)
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null
  const passing = scores.filter(s => s >= 90).length
  const failing = scores.filter(s => s < 70).length

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Summary stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Monitors', value: total, color: 'text-white' },
          { label: 'Avg Score', value: avgScore != null ? `${avgScore.toFixed(1)}%` : '—', color: avgScore != null ? scoreColor(avgScore) : '#6b7280', isColor: true },
          { label: 'Passing (≥ 90%)', value: passing, color: 'text-emerald-400' },
          { label: 'Failing (< 70%)', value: failing, color: 'text-red-400' },
        ].map(card => (
          <div key={card.label} className="bg-white/8 border border-white/12 rounded-xl p-4">
            <div className="text-xs text-white/60 uppercase tracking-wide font-medium mb-1">{card.label}</div>
            <div
              className={clsx('text-2xl font-bold font-mono', !card.isColor && card.color)}
              style={card.isColor ? { color: card.color as string } : undefined}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Monitor health grid */}
      <div>
        <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-3">Monitor Health</h3>
        {monitors.length === 0 ? (
          <div className="border border-dashed border-navy-700 rounded-xl p-8 text-center">
            <ShieldCheck size={32} className="text-white/30 mx-auto mb-3" />
            <div className="text-sm text-white/60">No monitors yet</div>
            <div className="text-xs text-white/55 mt-1">Create a monitor to start tracking data quality</div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {monitors.map(m => {
              const trend = null // could be computed from history if available
              return (
                <button
                  key={m.id}
                  onClick={() => onSelectMonitor(m.id)}
                  className="text-left bg-white/6 border border-white/10 rounded-xl p-4 hover:border-primary/50 hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-white truncate">{m.display_name}</div>
                      <div className="text-[10px] text-white/50 font-mono truncate mt-0.5">{m.table_name}</div>
                    </div>
                    <ScoreRing score={m.last_score} size={44} />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={clsx(
                      'text-[9px] px-1.5 py-0.5 rounded-full font-semibold',
                      m.enabled ? 'bg-emerald-950/60 text-emerald-400' : 'bg-gray-800 text-gray-400',
                    )}>
                      {m.enabled ? 'active' : 'paused'}
                    </span>
                    {m.last_scan_at && (
                      <span className="text-[10px] text-white/50">
                        {new Date(m.last_scan_at).toLocaleDateString()}
                      </span>
                    )}
                    {m.schedule_cron && (
                      <Clock size={9} className="text-white/40 ml-auto" />
                    )}
                  </div>
                  {trend}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Monitors list section ─────────────────────────────────────────────────────

function MonitorsSection({
  monitors,
  monitorsLoading,
  onSelectMonitor,
  onCreateMonitor,
}: {
  monitors: DQMonitor[]
  monitorsLoading: boolean
  onSelectMonitor: (id: string) => void
  onCreateMonitor: () => void
}) {
  if (monitorsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-white/60" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {monitors.length === 0 ? (
        <div className="border border-dashed border-navy-700 rounded-xl p-10 text-center">
          <Monitor size={32} className="text-white/30 mx-auto mb-3" />
          <div className="text-sm text-white/60 mb-1">No monitors yet</div>
          <div className="text-xs text-white/55 mb-4">Set up your first data quality monitor</div>
          <button
            onClick={onCreateMonitor}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-sidebar-primary text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <IconAdd size={13} /> New Monitor
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {monitors.map(m => (
            <button
              key={m.id}
              onClick={() => onSelectMonitor(m.id)}
              className="w-full text-left bg-white/6 border border-white/10 rounded-xl p-4 hover:border-primary/50 hover:bg-white/10 transition-colors flex items-center gap-4"
            >
              <ScoreRing score={m.last_score} size={48} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white">{m.display_name}</div>
                <div className="text-xs text-white/60 font-mono mt-0.5">{m.table_name}</div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className={clsx(
                    'text-[9px] px-1.5 py-0.5 rounded-full font-semibold',
                    m.enabled ? 'bg-emerald-950/60 text-emerald-400' : 'bg-gray-800 text-gray-400',
                  )}>
                    {m.enabled ? 'active' : 'paused'}
                  </span>
                  {(() => { try { return JSON.parse(m.rules_json ?? '[]').length } catch { return 0 } })() > 0 && (
                    <span className="text-[10px] text-white/60">
                      {(() => { try { return JSON.parse(m.rules_json ?? '[]').length } catch { return 0 } })()} rules
                    </span>
                  )}
                  {m.schedule_cron && (
                    <span className="text-[10px] text-white/60 flex items-center gap-0.5">
                      <Clock size={9} /> {m.schedule_cron}
                    </span>
                  )}
                  {m.alert_enabled && m.alert_threshold != null && (
                    <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
                      <Bell size={9} /> alert &lt; {m.alert_threshold}%
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right">
                {m.last_scan_at && (
                  <div className="text-[10px] text-white/60">
                    Last scan<br />{new Date(m.last_scan_at).toLocaleDateString()}
                  </div>
                )}
              </div>
              <IconCaretRight size={14} className="text-white/40 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── History section ───────────────────────────────────────────────────────────

function HistorySection() {
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['dq-scan-history'],
    queryFn: () => fetchDQScanHistory(100),
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-white/60" />
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <History size={32} className="text-white/30 mx-auto mb-3" />
          <div className="text-sm text-white/60">No scan history yet</div>
          <div className="text-xs text-white/55 mt-1">Run a scan to see results here</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col p-6">
      <div className="bg-white/6 border border-white/10 rounded-xl overflow-hidden flex flex-col flex-1">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_1fr_80px_80px_90px_90px_80px] gap-2 px-4 py-2.5 bg-navy-800/60 text-[10px] font-semibold text-white/60 uppercase tracking-wide shrink-0">
          <div>Monitor</div>
          <div>Table</div>
          <div>Score</div>
          <div>Status</div>
          <div>Rules</div>
          <div>Timestamp</div>
          <div>Duration</div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-navy-800/40">
          {(history as HistoryScanResult[]).map(scan => {
            let ruleResults: DQRuleResult[] = []
            try { ruleResults = JSON.parse(scan.rule_results_json ?? '[]') } catch {}
            const passed = ruleResults.filter(r => r.status === 'passed').length
            const failed = ruleResults.filter(r => r.status === 'failed' || r.status === 'error').length
            const isExpanded = expandedRow === scan.id

            return (
              <div key={scan.id}>
                <button
                  onClick={() => setExpandedRow(isExpanded ? null : scan.id)}
                  className="w-full grid grid-cols-[1fr_1fr_80px_80px_90px_90px_80px] gap-2 px-4 py-2.5 hover:bg-navy-800/30 text-left transition-colors items-center"
                >
                  <div className="text-xs text-white font-medium truncate">{scan.display_name}</div>
                  <div className="text-[10px] text-white/60 font-mono truncate">{scan.table_name}</div>
                  <div><ScoreBadge score={scan.overall_score} /></div>
                  <div><StatusBadge status={scan.status} /></div>
                  <div className="text-[10px] text-white/60">
                    {ruleResults.length > 0 ? (
                      <span>
                        <span className="text-emerald-400">{passed}✓</span>
                        {failed > 0 && <span className="text-red-400 ml-1">{failed}✗</span>}
                      </span>
                    ) : '—'}
                  </div>
                  <div className="text-[10px] text-white/60">{new Date(scan.scanned_at).toLocaleString()}</div>
                  <div className="text-[10px] text-white/60">{scan.duration_ms != null ? `${scan.duration_ms}ms` : '—'}</div>
                </button>
                {isExpanded && (
                  <div className="border-t border-navy-800/40 bg-navy-900/60">
                    {scan.error_message ? (
                      <div className="px-4 py-3 text-xs text-red-400">{scan.error_message}</div>
                    ) : (
                      <RuleResultsTable results={ruleResults} />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Rules catalog section ─────────────────────────────────────────────────────

function RulesSection({ rules, monitors, onAddRuleToMonitor }: {
  rules: DQRule[]
  monitors: DQMonitor[]
  onAddRuleToMonitor: (ruleId: string, monitorId: string) => void
}) {
  const [search, setSearch] = useState('')
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const qc = useQueryClient()

  const addRuleMut = useMutation({
    mutationFn: ({ monitorId, ruleId }: { monitorId: string; ruleId: string }) => {
      const monitor = monitors.find(m => m.id === monitorId)
      if (!monitor) throw new Error('Monitor not found')
      let existing: RuleEntry[] = []
      try { existing = JSON.parse(monitor.rules_json ?? '[]') } catch {}
      if (existing.some(r => r.rule_id === ruleId)) throw new Error('Rule already added')
      existing.push({ rule_id: ruleId, config: {}, weight: 1.0 })
      return updateDQMonitor(monitorId, { rules_json: JSON.stringify(existing) })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dq-monitors'] })
      setAddingTo(null)
    },
  })

  const categories = [...new Set(rules.map(r => r.category))]
  const filtered = rules.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.description.toLowerCase().includes(search.toLowerCase()) ||
    r.category.toLowerCase().includes(search.toLowerCase())
  )
  const byCategory = categories.reduce<Record<string, DQRule[]>>((acc, cat) => {
    acc[cat] = filtered.filter(r => r.category === cat)
    return acc
  }, {})

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <IconSearch size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search rules…"
            className="w-full pl-8 pr-3 py-2 text-xs bg-navy-800 border border-navy-700 rounded-lg text-white placeholder-surface-600 focus:outline-none focus:ring-1 focus:ring-dblue-500"
          />
        </div>
        <span className="text-xs text-white/55">{filtered.length} rules</span>
      </div>

      <div className="space-y-6">
        {categories.filter(cat => (byCategory[cat] ?? []).length > 0).map(cat => (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-2">
              <span className={clsx('text-[10px] font-bold uppercase px-2 py-0.5 rounded', CATEGORY_COLORS[cat] ?? 'bg-gray-800 text-gray-400')}>
                {cat}
              </span>
              <span className="text-xs text-white/55">{byCategory[cat]?.length ?? 0} rules</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(byCategory[cat] ?? []).map(rule => (
                <div key={rule.id} className="bg-white/6 border border-white/10 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="text-xs font-semibold text-white">{rule.name}</div>
                    <div className="relative shrink-0">
                      <button
                        onClick={() => setAddingTo(addingTo === rule.id ? null : rule.id)}
                        disabled={monitors.length === 0}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] bg-dblue-500/20 hover:bg-dblue-500/40 text-primary rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <IconAdd size={9} /> Add to…
                      </button>
                      {addingTo === rule.id && (
                        <div className="absolute right-0 top-full mt-1 z-10 w-48 bg-navy-800 border border-navy-700 rounded-lg shadow-xl overflow-hidden">
                          {monitors.map(m => (
                            <button
                              key={m.id}
                              onClick={() => addRuleMut.mutate({ monitorId: m.id, ruleId: rule.id })}
                              disabled={addRuleMut.isPending}
                              className="w-full text-left px-3 py-2 text-xs text-white hover:bg-navy-700 transition-colors truncate"
                            >
                              {m.display_name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-white/60 leading-relaxed">{rule.description}</div>
                  {rule.config_schema && rule.config_schema.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {rule.config_schema.map(f => (
                        <span key={f.key} className="text-[9px] px-1.5 py-0.5 bg-navy-700/60 text-white/60 rounded font-mono">
                          {f.key}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Monitor detail ────────────────────────────────────────────────────────────

function MonitorDetailSection({
  monitor,
  rules,
  onEdit,
  onDelete,
}: {
  monitor: DQMonitor
  rules: DQRule[]
  onEdit: (m: DQMonitor) => void
  onDelete: (id: string) => void
}) {
  const qc = useQueryClient()

  const { data: scanHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ['dq-scan-results', monitor.id],
    queryFn: () => fetchDQScanResults(monitor.id, 10),
    staleTime: 30_000,
  })

  const scanMut = useMutation({
    mutationFn: () => runDQScan(monitor.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dq-scan-results', monitor.id] })
      qc.invalidateQueries({ queryKey: ['dq-monitors'] })
      qc.invalidateQueries({ queryKey: ['dq-dashboard'] })
      qc.invalidateQueries({ queryKey: ['dq-scan-history'] })
    },
  })

  const toggleEnabledMut = useMutation({
    mutationFn: () => updateDQMonitor(monitor.id, { enabled: !monitor.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dq-monitors'] }),
  })

  const configuredRules = (() => {
    try { return JSON.parse(monitor.rules_json ?? '[]') as RuleEntry[] } catch { return [] as RuleEntry[] }
  })()
  const ruleMap = Object.fromEntries(rules.map(r => [r.id, r]))

  const latest = scanHistory[0]
  let latestRuleResults: DQRuleResult[] = []
  try { latestRuleResults = JSON.parse(latest?.rule_results_json ?? '[]') } catch {}

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Sub-header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-navy-800 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <IconEntityNamespace size={14} className="text-primary shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white truncate">{monitor.display_name}</h3>
            <p className="text-xs text-white/60 font-mono truncate">{monitor.table_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => toggleEnabledMut.mutate()}
            disabled={toggleEnabledMut.isPending}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors',
              monitor.enabled
                ? 'bg-emerald-950/40 text-emerald-400 hover:bg-emerald-950/60 border border-emerald-800/40'
                : 'bg-gray-800/60 text-gray-400 hover:bg-gray-800 border border-gray-700/40',
            )}
          >
            {monitor.enabled ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
            {monitor.enabled ? 'Enabled' : 'Paused'}
          </button>
          <button
            onClick={() => onEdit(monitor)}
            className="p-1.5 rounded text-white/60 hover:text-white hover:bg-navy-700 transition-colors"
            title="Edit monitor"
          >
            <IconEdit size={13} />
          </button>
          <button
            onClick={() => scanMut.mutate()}
            disabled={scanMut.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-sidebar-primary text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {scanMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <IconDatasetRun size={12} />}
            Scan Now
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="w-60 shrink-0 border-r border-navy-800 p-5 flex flex-col gap-4 overflow-y-auto">
          {/* Score ring */}
          <div className="flex flex-col items-center gap-2 py-3">
            <ScoreRing score={monitor.last_score} size={80} />
            <div className="text-center">
              <div className="text-xs font-semibold text-white">DQ Score</div>
              {monitor.last_scan_at && (
                <div className="text-[10px] text-white/60 mt-0.5">
                  {new Date(monitor.last_scan_at).toLocaleString()}
                </div>
              )}
            </div>
          </div>

          {/* Schedule info */}
          {monitor.schedule_cron && (
            <div className="bg-navy-800/40 rounded-lg px-3 py-2.5">
              <div className="text-[10px] text-white/60 mb-0.5">Schedule</div>
              <div className="text-xs text-white font-mono">{monitor.schedule_cron}</div>
            </div>
          )}

          {/* Alert info */}
          {monitor.alert_enabled && monitor.alert_threshold != null && (
            <div className="bg-amber-950/20 border border-amber-800/30 rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] text-amber-400 mb-0.5">
                <Bell size={9} /> Alert threshold
              </div>
              <div className="text-xs text-amber-300 font-mono">&lt; {monitor.alert_threshold}%</div>
            </div>
          )}

          {/* Active rules */}
          <div>
            <div className="text-xs font-semibold text-white/70 mb-2">Rules ({configuredRules.length})</div>
            {configuredRules.length === 0 ? (
              <div className="text-xs text-white/55 italic">No rules configured</div>
            ) : (
              <div className="space-y-1.5">
                {configuredRules.map((cr, i) => {
                  const ruleDef = ruleMap[cr.rule_id]
                  const latestResult = latestRuleResults.find(r => r.rule_id === cr.rule_id)
                  return (
                    <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-navy-800/40 rounded">
                      {latestResult
                        ? <RuleStatusIcon status={latestResult.status} />
                        : <CheckSquare size={11} className="text-white/40" />
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

          {/* Delete button */}
          <div className="mt-auto pt-2">
            <button
              onClick={() => onDelete(monitor.id)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-red-800/50 text-red-400 hover:bg-red-950/40 rounded-lg text-xs transition-colors"
            >
              <IconDelete size={11} /> Delete Monitor
            </button>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Latest scan results */}
          {latest && (
            <div className="mb-6">
              <h4 className="text-xs font-semibold text-white/70 mb-3 flex items-center gap-1.5">
                <BarChart2 size={12} className="text-primary" />
                Latest Scan Results
                <span className="text-white/40 font-normal ml-1">
                  {new Date(latest.scanned_at).toLocaleString()}
                </span>
              </h4>
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
            <h4 className="text-xs font-semibold text-white/70 mb-3 flex items-center gap-1.5">
              <Clock size={12} className="text-white/60" />
              Scan History ({scanHistory.length})
            </h4>
            {historyLoading ? (
              <div className="flex items-center gap-2 text-xs text-white/60">
                <Loader2 size={12} className="animate-spin" /> Loading…
              </div>
            ) : scanHistory.length === 0 ? (
              <div className="text-xs text-white/55 italic">No scans yet — click Scan Now to run the first one</div>
            ) : (
              <div className="space-y-2">
                {scanHistory.map(scan => <ScanHistoryRow key={scan.id} scan={scan} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ScanHistoryRow({ scan }: { scan: DQScanResult }) {
  const [expanded, setExpanded] = useState(false)
  let ruleResults: DQRuleResult[] = []
  try { ruleResults = JSON.parse(scan.rule_results_json ?? '[]') } catch {}

  return (
    <div className="border border-navy-800/40 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-navy-800/30 text-left transition-colors"
      >
        {expanded ? <IconCaretDown size={12} className="text-white/60 shrink-0" /> : <IconCaretRight size={12} className="text-white/60 shrink-0" />}
        <span className="text-xs text-white/60 font-mono shrink-0">{new Date(scan.scanned_at).toLocaleString()}</span>
        <StatusBadge status={scan.status} />
        <ScoreBadge score={scan.overall_score} />
        {scan.duration_ms != null && (
          <span className="text-xs text-white/40 ml-auto shrink-0">{scan.duration_ms}ms</span>
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

// ── Main DataQualityHub ───────────────────────────────────────────────────────

export default function DataQualityHub({ onClose }: Props) {
  const qc = useQueryClient()

  const [activeSection, setActiveSection] = useState<NavSection>('overview')
  const [selectedMonitorId, setSelectedMonitorId] = useState<string | null>(null)
  const [showWizard, setShowWizard] = useState(false)
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
    staleTime: 300_000,
  })

  const saveMut = useMutation({
    mutationFn: (data: {
      table_name: string
      display_name: string
      rules_json: string
      enabled: boolean
      schedule_cron: string
      alert_threshold: number | undefined
      alert_enabled: boolean
    }) => {
      if (editingMonitor) return updateDQMonitor(editingMonitor.id, data)
      return createDQMonitor(data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dq-monitors'] })
      qc.invalidateQueries({ queryKey: ['dq-dashboard'] })
      setShowWizard(false)
      setEditingMonitor(null)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteDQMonitor(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dq-monitors'] })
      qc.invalidateQueries({ queryKey: ['dq-dashboard'] })
      qc.invalidateQueries({ queryKey: ['dq-scan-history'] })
      setDeleteConfirm(null)
      if (selectedMonitorId === deleteMut.variables) setSelectedMonitorId(null)
    },
  })

  const handleSelectMonitor = (id: string) => {
    setSelectedMonitorId(id)
    setActiveSection('monitors')
  }

  const handleEdit = (m: DQMonitor) => {
    setEditingMonitor(m)
    setShowWizard(true)
  }

  const handleDelete = (id: string) => setDeleteConfirm(id)

  const selectedMonitor = monitors.find(m => m.id === selectedMonitorId) ?? null

  const navItems: { id: NavSection; label: string; icon: ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={14} /> },
    { id: 'monitors', label: 'Monitors', icon: <Monitor size={14} /> },
    { id: 'history', label: 'History', icon: <History size={14} /> },
    { id: 'rules', label: 'Rule Catalog', icon: <BookOpen size={14} /> },
  ]

  return (
    <div className="fixed inset-0 z-40 bg-navy-950 flex flex-col">
      {/* Top header bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-navy-800 bg-navy-950 shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white transition-colors px-2 py-1.5 rounded-lg hover:bg-navy-800"
        >
          <ArrowLeft size={13} /> Back
        </button>
        <div className="h-4 w-px bg-navy-700" />
        <ShieldCheck size={16} className="text-primary" />
        <span className="text-sm font-semibold text-white">Data Quality Hub</span>
        <div className="flex-1" />
        <button
          onClick={() => { setEditingMonitor(null); setShowWizard(true) }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-sidebar-primary text-white text-xs font-semibold rounded-lg transition-colors"
        >
          <IconAdd size={13} /> New Monitor
        </button>
      </div>

      {/* Main body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Nav sidebar */}
        <div className="w-52 shrink-0 border-r border-navy-800 bg-navy-950 flex flex-col py-3">
          {/* Nav links */}
          <nav className="space-y-0.5 px-2 mb-4">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => { setActiveSection(item.id); setSelectedMonitorId(null) }}
                className={clsx(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left',
                  activeSection === item.id && !selectedMonitorId
                    ? 'bg-dblue-500/20 text-primary'
                    : 'text-white/60 hover:text-white hover:bg-navy-800/60',
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>

          {/* Divider + monitor mini-list */}
          <div className="px-3 mb-2">
            <div className="h-px bg-navy-800" />
            <div className="text-[10px] font-semibold text-white/60 uppercase tracking-wider mt-3 mb-1.5 px-1">Monitors</div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
            {monitorsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={14} className="animate-spin text-white/40" />
              </div>
            ) : monitors.length === 0 ? (
              <div className="text-[10px] text-white/60 italic px-3 py-2">No monitors yet</div>
            ) : (
              monitors.map(m => (
                <button
                  key={m.id}
                  onClick={() => handleSelectMonitor(m.id)}
                  className={clsx(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors group',
                    selectedMonitorId === m.id
                      ? 'bg-dblue-500/20 text-primary'
                      : 'text-white/60 hover:text-white hover:bg-navy-800/60',
                  )}
                >
                  <div className="shrink-0">
                    <ScoreRing score={m.last_score} size={28} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium truncate">{m.display_name}</div>
                    {!m.enabled && <div className="text-[9px] text-white/30">paused</div>}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 overflow-hidden flex flex-col bg-navy-950">
          {selectedMonitor ? (
            <MonitorDetailSection
              monitor={selectedMonitor}
              rules={rules}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ) : activeSection === 'overview' ? (
            <OverviewSection monitors={monitors} onSelectMonitor={handleSelectMonitor} />
          ) : activeSection === 'monitors' ? (
            <MonitorsSection
              monitors={monitors}
              monitorsLoading={monitorsLoading}
              onSelectMonitor={handleSelectMonitor}
              onCreateMonitor={() => { setEditingMonitor(null); setShowWizard(true) }}
            />
          ) : activeSection === 'history' ? (
            <HistorySection />
          ) : (
            <RulesSection
              rules={rules}
              monitors={monitors}
              onAddRuleToMonitor={(ruleId, monitorId) => {
                const monitor = monitors.find(m => m.id === monitorId)
                if (!monitor) return
                let existing: RuleEntry[] = []
                try { existing = JSON.parse(monitor.rules_json ?? '[]') } catch {}
                existing.push({ rule_id: ruleId, config: {}, weight: 1.0 })
                updateDQMonitor(monitorId, { rules_json: JSON.stringify(existing) }).then(() => {
                  qc.invalidateQueries({ queryKey: ['dq-monitors'] })
                })
              }}
            />
          )}
        </div>
      </div>

      {/* Wizard modal */}
      {showWizard && (
        <MonitorWizard
          monitor={editingMonitor}
          rules={rules}
          onSave={data => saveMut.mutate(data)}
          onClose={() => { setShowWizard(false); setEditingMonitor(null) }}
          saving={saveMut.isPending}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm mx-4 bg-navy-900 border border-navy-700 rounded-xl shadow-2xl p-6">
            <h3 className="text-sm font-semibold text-white mb-2">Delete Monitor</h3>
            <p className="text-xs text-white/60 mb-5">
              This will permanently delete the monitor and all its scan history. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-xs text-white/60 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={() => deleteMut.mutate(deleteConfirm)}
                disabled={deleteMut.isPending}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {deleteMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <IconDelete size={12} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
