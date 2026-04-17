import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Bell, BellOff, Clock, Loader2 } from 'lucide-react'
import { IconAdd, IconCaretDown, IconCaretUp, IconCheckCircle, IconDatasetRun, IconDelete, IconEdit, IconErrorCircle, IconWarning } from './icons'
import clsx from 'clsx'
import type { Alert, AlertHistory, AlertStatus } from '../types'
import {
  fetchAlerts, deleteAlert, updateAlert, runAlertNow, fetchAlertHistory,
} from '../api/client'
import CreateAlertModal from './CreateAlertModal'

interface Props {
  onClose: () => void
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: AlertStatus }) {
  if (!status) return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">
      <Clock size={10} /> Never run
    </span>
  )
  if (status === 'ok') return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 font-medium">
      <IconCheckCircle size={10} /> OK
    </span>
  )
  if (status === 'triggered') return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700 font-medium">
      <IconWarning size={10} /> Triggered
    </span>
  )
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 font-medium">
      <IconErrorCircle size={10} /> Error
    </span>
  )
}

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    sql: 'bg-indigo-50 text-indigo-700',
    pipeline_health: 'bg-blue-50 text-blue-700',
    data_quality: 'bg-emerald-50 text-emerald-700',
    source_freshness: 'bg-amber-50 text-amber-700',
  }
  const labels: Record<string, string> = {
    sql: 'Custom SQL',
    pipeline_health: 'Pipeline Health',
    data_quality: 'Data Quality',
    source_freshness: 'Source Freshness',
  }
  return (
    <span className={clsx('px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider', styles[type] ?? 'bg-gray-100 text-gray-600')}>
      {labels[type] ?? type}
    </span>
  )
}

// ── Alert history drawer ──────────────────────────────────────────────────────

function AlertHistoryDrawer({ alertId }: { alertId: string }) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['alert-history', alertId],
    queryFn: () => fetchAlertHistory(alertId),
    staleTime: 30_000,
  })

  if (isLoading) return (
    <div className="flex items-center gap-2 p-3 text-xs text-gray-400">
      <Loader2 size={12} className="animate-spin" /> Loading history…
    </div>
  )

  if (!history.length) return (
    <div className="p-3 text-xs text-gray-400 italic">No evaluations yet</div>
  )

  return (
    <div className="border-t border-gray-100 bg-gray-50">
      {history.slice(0, 10).map((h: AlertHistory) => (
        <div key={h.id} className="flex items-start gap-3 px-4 py-2 border-b border-gray-100 last:border-0">
          <StatusBadge status={h.status as AlertStatus} />
          <span className="flex-1 text-xs text-gray-600 leading-relaxed">{h.message}</span>
          <span className="text-[10px] text-gray-400 shrink-0">
            {new Date(h.checked_at).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Alert row ─────────────────────────────────────────────────────────────────

function AlertRow({
  alert,
  onEdit,
  onDelete,
  onToggle,
  onRunNow,
}: {
  alert: Alert
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
  onRunNow: () => void
}) {
  const [showHistory, setShowHistory] = useState(false)
  const [running, setRunning] = useState(false)

  const handleRunNow = async () => {
    setRunning(true)
    try { await onRunNow() } finally { setRunning(false) }
  }

  return (
    <div className={clsx(
      'border rounded-lg overflow-hidden transition-all',
      alert.last_status === 'triggered' ? 'border-red-200' : 'border-gray-200',
      !alert.enabled && 'opacity-60'
    )}>
      <div className="flex items-start gap-4 p-4 bg-white">
        {/* Status indicator */}
        <div className={clsx(
          'w-2 h-2 rounded-full mt-1.5 shrink-0',
          !alert.enabled ? 'bg-gray-300' :
          alert.last_status === 'ok' ? 'bg-emerald-400' :
          alert.last_status === 'triggered' ? 'bg-red-400 animate-pulse' :
          alert.last_status === 'error' ? 'bg-amber-400' : 'bg-gray-300'
        )} />

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-semibold text-sm text-gray-800">{alert.name}</span>
            <TypeBadge type={alert.alert_type} />
            <StatusBadge status={alert.last_status} />
            {!alert.enabled && (
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Disabled</span>
            )}
          </div>
          {alert.description && (
            <p className="text-xs text-gray-500 mb-1">{alert.description}</p>
          )}
          <div className="flex items-center gap-3 text-[11px] text-gray-400 flex-wrap">
            <span>Schedule: <code className="font-mono bg-gray-100 px-1 rounded">{alert.schedule}</code></span>
            {alert.last_checked_at && (
              <span>Last checked: {new Date(alert.last_checked_at).toLocaleString()}</span>
            )}
            {alert.last_message && (
              <span className={clsx(
                'italic',
                alert.last_status === 'triggered' ? 'text-red-500' :
                alert.last_status === 'error' ? 'text-amber-600' : 'text-gray-400'
              )}>
                {alert.last_message.length > 80 ? alert.last_message.slice(0, 80) + '…' : alert.last_message}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleRunNow}
            disabled={running}
            title="Run now"
            className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-40"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <IconDatasetRun size={14} />}
          </button>
          <button
            onClick={onToggle}
            title={alert.enabled ? 'Disable' : 'Enable'}
            className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            {alert.enabled ? <Bell size={14} /> : <BellOff size={14} />}
          </button>
          <button
            onClick={onEdit}
            title="Edit"
            className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <IconEdit size={14} />
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <IconDelete size={14} />
          </button>
          <button
            onClick={() => setShowHistory((v) => !v)}
            title="Toggle history"
            className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            {showHistory ? <IconCaretUp size={14} /> : <IconCaretDown size={14} />}
          </button>
        </div>
      </div>

      {showHistory && <AlertHistoryDrawer alertId={alert.id} />}
    </div>
  )
}

// ── Main AlertsPage ───────────────────────────────────────────────────────────

export default function AlertsPage({ onClose }: Props) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editingAlert, setEditingAlert] = useState<Alert | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [runResults, setRunResults] = useState<Record<string, { status: string; message: string }>>({})

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: fetchAlerts,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  const deleteMut = useMutation({
    mutationFn: deleteAlert,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alerts'] }); setDeleteConfirmId(null) },
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateAlert(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const handleRunNow = async (alert: Alert) => {
    const result = await runAlertNow(alert.id)
    setRunResults((prev) => ({ ...prev, [alert.id]: result }))
    qc.invalidateQueries({ queryKey: ['alerts'] })
    qc.invalidateQueries({ queryKey: ['alert-history', alert.id] })
    setTimeout(() => setRunResults((prev) => { const n = { ...prev }; delete n[alert.id]; return n }), 5000)
  }

  const triggered = alerts.filter((a) => a.last_status === 'triggered' && a.enabled)
  const errors = alerts.filter((a) => a.last_status === 'error' && a.enabled)

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-gray-200 bg-white shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div className="h-5 w-px bg-gray-200" />
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-gray-700" />
          <span className="font-semibold text-gray-800">Alerts</span>
          <span className="text-xs text-gray-400">{alerts.length} configured</span>
        </div>

        {/* Summary badges */}
        {triggered.length > 0 && (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-medium">
            <IconWarning size={11} /> {triggered.length} triggered
          </span>
        )}
        {errors.length > 0 && (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
            <IconErrorCircle size={11} /> {errors.length} error{errors.length > 1 ? 's' : ''}
          </span>
        )}

        <div className="flex-1" />

        <button
          onClick={() => { setEditingAlert(null); setShowCreate(true) }}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <IconAdd size={14} /> New Alert
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-3">
          {isLoading && (
            <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
              <Loader2 size={18} className="animate-spin" /> Loading alerts…
            </div>
          )}

          {!isLoading && alerts.length === 0 && (
            <div className="text-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Bell size={28} className="text-gray-400" />
              </div>
              <p className="font-semibold text-gray-600 mb-1">No alerts configured</p>
              <p className="text-sm text-gray-400 mb-6">Create alerts to monitor your data and pipelines automatically</p>
              <button
                onClick={() => { setEditingAlert(null); setShowCreate(true) }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <IconAdd size={14} /> Create your first alert
              </button>
            </div>
          )}

          {/* Triggered alerts first */}
          {triggered.length > 0 && (
            <div className="mb-2">
              <h3 className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <IconWarning size={12} /> Triggered
              </h3>
              <div className="space-y-2">
                {triggered.map((alert) => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    onEdit={() => { setEditingAlert(alert); setShowCreate(true) }}
                    onDelete={() => setDeleteConfirmId(alert.id)}
                    onToggle={() => toggleMut.mutate({ id: alert.id, enabled: !alert.enabled })}
                    onRunNow={() => handleRunNow(alert)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* All other alerts */}
          {alerts.filter((a) => a.last_status !== 'triggered' || !a.enabled).length > 0 && (
            <div>
              {triggered.length > 0 && (
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4">All Alerts</h3>
              )}
              <div className="space-y-2">
                {alerts
                  .filter((a) => a.last_status !== 'triggered' || !a.enabled)
                  .map((alert) => (
                    <AlertRow
                      key={alert.id}
                      alert={alert}
                      onEdit={() => { setEditingAlert(alert); setShowCreate(true) }}
                      onDelete={() => setDeleteConfirmId(alert.id)}
                      onToggle={() => toggleMut.mutate({ id: alert.id, enabled: !alert.enabled })}
                      onRunNow={() => handleRunNow(alert)}
                    />
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Run result toasts */}
      {Object.entries(runResults).map(([id, result]) => {
        const alert = alerts.find((a) => a.id === id)
        return (
          <div
            key={id}
            className={clsx(
              'fixed bottom-4 right-4 z-50 flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg border max-w-sm text-sm',
              result.status === 'triggered' ? 'bg-red-50 border-red-200 text-red-800' :
              result.status === 'error' ? 'bg-amber-50 border-amber-200 text-amber-800' :
              'bg-emerald-50 border-emerald-200 text-emerald-800'
            )}
          >
            {result.status === 'ok' ? <IconCheckCircle size={16} className="shrink-0 mt-0.5" /> :
             result.status === 'triggered' ? <IconWarning size={16} className="shrink-0 mt-0.5" /> :
             <IconErrorCircle size={16} className="shrink-0 mt-0.5" />}
            <div>
              <p className="font-medium">{alert?.name ?? 'Alert'}: {result.status}</p>
              <p className="text-xs opacity-75 mt-0.5">{result.message}</p>
            </div>
          </div>
        )
      })}

      {/* Delete confirm */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-gray-800 mb-2">Delete Alert</h3>
            <p className="text-sm text-gray-500 mb-4">
              This will delete the alert and all its history. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button
                onClick={() => deleteMut.mutate(deleteConfirmId!)}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      {showCreate && (
        <CreateAlertModal
          existing={editingAlert}
          onClose={() => { setShowCreate(false); setEditingAlert(null) }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['alerts'] })
            setShowCreate(false)
            setEditingAlert(null)
          }}
        />
      )}
    </div>
  )
}
