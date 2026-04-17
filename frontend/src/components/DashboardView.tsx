import { useQuery } from '@tanstack/react-query'
import { Clock, Activity, Calendar, TrendingUp, ArrowRight } from 'lucide-react'
import { IconCheckCircle, IconDatasetRun, IconEntityNamespace, IconErrorCircle, IconRefresh, IconWarning } from './icons'
import { fetchDashboard } from '../api/client'
import type { DashboardPipeline, PipelineHealth } from '../types'

interface Props {
  onOpenPipeline: (id: string) => void
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatNextRun(iso?: string): string {
  if (!iso) return '—'
  const diff = new Date(iso).getTime() - Date.now()
  if (diff < 0) return 'overdue'
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `in ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `in ${hrs}h`
  return `in ${Math.floor(hrs / 24)}d`
}

function HealthBadge({ health }: { health: PipelineHealth }) {
  const cfg = {
    healthy:   { label: 'Healthy',    bg: 'bg-emerald-500/15', text: 'text-emerald-400', Icon: IconCheckCircle },
    degraded:  { label: 'Degraded',   bg: 'bg-amber-500/15',   text: 'text-amber-400',   Icon: IconWarning },
    failing:   { label: 'Failing',    bg: 'bg-red-500/15',     text: 'text-red-400',     Icon: IconErrorCircle },
    never_run: { label: 'Never Run',  bg: 'bg-white/10',        text: 'text-white/50',   Icon: Clock },
  }[health]

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <cfg.Icon size={11} />
      {cfg.label}
    </span>
  )
}

function SuccessBar({ rate }: { rate?: number }) {
  if (rate === undefined || rate === null) return <span className="text-white/40 text-xs">No runs</span>
  const pct = Math.round(rate * 100)
  const color = rate >= 0.8 ? 'bg-emerald-500' : rate >= 0.5 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-white/60 w-8 text-right">{pct}%</span>
    </div>
  )
}

function PipelineCard({ p, onOpen }: { p: DashboardPipeline; onOpen: () => void }) {
  const borderColor = {
    healthy:   'border-emerald-500/30 hover:border-emerald-500/60',
    degraded:  'border-amber-500/30  hover:border-amber-500/60',
    failing:   'border-red-500/30    hover:border-red-500/60',
    never_run: 'border-white/10  hover:border-white/25',
  }[p.health]

  const modeLabel: Record<string, string> = {
    preview: 'Preview', ctas: 'CTAS', insert: 'Insert',
    view: 'View', incremental: 'Incremental', scd2: 'SCD2',
  }

  return (
    <div
      className={`bg-navy-800 border rounded-xl p-4 cursor-pointer transition-all duration-150 ${borderColor} group`}
      onClick={onOpen}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-white font-medium text-sm truncate">{p.name}</h3>
            {p.pending_approval_id && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-violet-500/20 text-violet-400 font-medium shrink-0">
                Pending Review
              </span>
            )}
          </div>
          {p.description && (
            <p className="text-white/50 text-xs truncate">{p.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2">
          <HealthBadge health={p.health} />
          <ArrowRight size={13} className="text-white/30 group-hover:text-white/60 transition-colors ml-1" />
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="inline-flex items-center gap-1 text-xs text-white/60">
          <IconEntityNamespace size={10} />
          {p.source_table.split('.').pop()}
        </span>
        <span className="text-white/30 text-xs">→</span>
        <span className="text-xs px-1.5 py-0.5 bg-primary/15 text-primary rounded font-medium">
          {modeLabel[p.output_mode] ?? p.output_mode}
        </span>
        {p.output_table && (
          <>
            <span className="text-white/30 text-xs">→</span>
            <span className="text-xs text-white/60 truncate max-w-28">{p.output_table.split('.').pop()}</span>
          </>
        )}
      </div>

      {/* Success bar */}
      <div className="mb-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-white/50">Success rate</span>
          <span className="text-xs text-white/50">{p.total_runs} run{p.total_runs !== 1 ? 's' : ''}</span>
        </div>
        <SuccessBar rate={p.success_rate} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-white/10">
        {/* Last run */}
        <div className="flex items-center gap-1.5">
          {p.last_run ? (
            <>
              {p.last_run.status === 'success'
                ? <IconCheckCircle size={11} className="text-emerald-400 shrink-0" />
                : <IconErrorCircle size={11} className="text-red-400 shrink-0" />
              }
              <span className="text-xs text-white/60">
                {relativeTime(p.last_run.started_at)}
              </span>
              {p.last_run.row_count !== undefined && p.last_run.row_count !== null && (
                <span className="text-xs text-white/40">
                  · {p.last_run.row_count.toLocaleString()} rows
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-white/40">Never run</span>
          )}
        </div>
        {/* Next scheduled run */}
        {p.next_run && (
          <div className="flex items-center gap-1 text-xs text-white/50">
            <Calendar size={10} />
            {formatNextRun(p.next_run.next_run_at)}
          </div>
        )}
      </div>
    </div>
  )
}

export default function DashboardView({ onOpenPipeline }: Props) {
  const { data: pipelines = [], isLoading, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    refetchInterval: 30000,  // auto-refresh every 30s
  })

  const healthy   = pipelines.filter(p => p.health === 'healthy').length
  const degraded  = pipelines.filter(p => p.health === 'degraded').length
  const failing   = pipelines.filter(p => p.health === 'failing').length
  const neverRun  = pipelines.filter(p => p.health === 'never_run').length
  const pending   = pipelines.filter(p => p.pending_approval_id).length

  return (
    <div className="flex flex-col h-full bg-navy-900 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Activity size={18} className="text-dblue-400" />
          <div>
            <h1 className="text-white font-semibold text-base">Pipeline Health Dashboard</h1>
            <p className="text-white/50 text-xs">{pipelines.length} pipeline{pipelines.length !== 1 ? 's' : ''} · refreshes every 30s</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/70 hover:text-white text-xs transition-colors"
        >
          <IconRefresh size={12} />
          Refresh
        </button>
      </div>

      {/* Summary stat strip */}
      <div className="px-6 py-3 border-b border-white/10 flex items-center gap-6 shrink-0">
        <StatPill icon={<IconCheckCircle size={13} className="text-emerald-400" />} label="Healthy"   value={healthy}  color="text-emerald-400" />
        <StatPill icon={<IconWarning size={13} className="text-amber-400" />} label="Degraded"  value={degraded} color="text-amber-400" />
        <StatPill icon={<IconErrorCircle size={13} className="text-red-400" />}     label="Failing"   value={failing}  color="text-red-400" />
        <StatPill icon={<Clock size={13} className="text-surface-400" />}       label="Never Run" value={neverRun} color="text-surface-400" />
        {pending > 0 && (
          <StatPill icon={<TrendingUp size={13} className="text-violet-400" />} label="Pending Review" value={pending} color="text-violet-400" />
        )}
      </div>

      {/* Pipeline grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-white/50 text-sm">
            <IconRefresh size={16} className="animate-spin mr-2" /> Loading…
          </div>
        ) : pipelines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-white/40">
            <IconDatasetRun size={28} className="mb-3 opacity-40" />
            <p className="text-sm">No pipelines yet.</p>
            <p className="text-xs mt-1">Create your first pipeline to see health stats here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {/* Failing first, then degraded, then healthy, then never_run */}
            {['failing', 'degraded', 'healthy', 'never_run'].flatMap(h =>
              pipelines
                .filter(p => p.health === h)
                .map(p => (
                  <PipelineCard
                    key={p.id}
                    p={p}
                    onOpen={() => onOpenPipeline(p.id)}
                  />
                ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StatPill({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number; color: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
      <span className="text-white/50 text-xs">{label}</span>
    </div>
  )
}
