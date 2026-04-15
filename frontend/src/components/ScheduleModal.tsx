import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Clock, Loader2, Trash2, CheckCircle, XCircle, Play } from 'lucide-react'
import clsx from 'clsx'
import {
  fetchPipelineSchedules,
  createPipelineSchedule,
  updateSchedule,
  deleteSchedule,
} from '../api/client'
import type { PipelineSchedule } from '../types'

interface Props {
  pipelineId: string
  pipelineName: string
  onClose: () => void
}

const PRESETS = [
  { label: 'Every hour',    cron: '0 * * * *' },
  { label: 'Every 6 hours', cron: '0 */6 * * *' },
  { label: 'Daily at midnight', cron: '0 0 * * *' },
  { label: 'Daily at 6 AM', cron: '0 6 * * *' },
  { label: 'Weekly (Mon 8 AM)', cron: '0 8 * * 1' },
  { label: 'Monthly (1st, midnight)', cron: '0 0 1 * *' },
]

function describeCron(cron: string): string {
  const matched = PRESETS.find((p) => p.cron === cron)
  if (matched) return matched.label
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return cron
  const [min, hour, dom, mon, dow] = parts
  if (min === '0' && hour !== '*' && dom === '*' && mon === '*' && dow === '*')
    return `Daily at ${hour.padStart(2, '0')}:00 UTC`
  if (min === '0' && hour !== '*' && dom === '*' && mon === '*' && dow !== '*')
    return `Weekly — day ${dow} at ${hour.padStart(2, '0')}:00 UTC`
  return cron
}

function relativeTime(iso?: string): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function ScheduleModal({ pipelineId, pipelineName, onClose }: Props) {
  const qc = useQueryClient()

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['schedules', pipelineId],
    queryFn: () => fetchPipelineSchedules(pipelineId),
  })

  const [cronInput, setCronInput] = useState('0 0 * * *')
  const [enabledInput, setEnabledInput] = useState(true)
  const [maxRetriesInput, setMaxRetriesInput] = useState(0)
  const [cronError, setCronError] = useState<string | null>(null)

  const createMut = useMutation({
    mutationFn: () => createPipelineSchedule(pipelineId, { cron_expression: cronInput.trim(), enabled: enabledInput, max_retries: maxRetriesInput }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules', pipelineId] }),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateSchedule(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules', pipelineId] }),
  })

  const updateCronMut = useMutation({
    mutationFn: ({ id, cron, maxRetries }: { id: string; cron: string; maxRetries: number }) =>
      updateSchedule(id, { cron_expression: cron, max_retries: maxRetries }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules', pipelineId] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSchedule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules', pipelineId] }),
  })

  const validateCron = (val: string): boolean => {
    const parts = val.trim().split(/\s+/)
    if (parts.length !== 5) {
      setCronError('Must have 5 parts: minute hour day month weekday')
      return false
    }
    setCronError(null)
    return true
  }

  const handleCreate = () => {
    if (!validateCron(cronInput)) return
    createMut.mutate()
  }

  const existingSchedule: PipelineSchedule | undefined = schedules[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-navy-950">
          <div className="flex items-center gap-2.5">
            <Clock size={16} className="text-dblue-400" />
            <span className="font-semibold text-white text-sm">Schedule Pipeline</span>
            <span className="text-surface-400 text-xs font-mono truncate max-w-[160px]">{pipelineName}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-surface-400 gap-2 text-sm">
              <Loader2 size={15} className="animate-spin" /> Loading…
            </div>
          ) : existingSchedule ? (

            /* ── Existing schedule ─────────────────────────────────── */
            <div className="space-y-4">
              <div className="rounded-lg border border-surface-200 bg-surface-50 p-4 space-y-3">

                {/* Status row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={clsx(
                      'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold',
                      existingSchedule.enabled
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-surface-200 text-surface-500'
                    )}>
                      <span className={clsx(
                        'w-1.5 h-1.5 rounded-full',
                        existingSchedule.enabled ? 'bg-emerald-500' : 'bg-surface-400'
                      )} />
                      {existingSchedule.enabled ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <button
                    onClick={() => toggleMut.mutate({ id: existingSchedule.id, enabled: !existingSchedule.enabled })}
                    disabled={toggleMut.isPending}
                    className="text-xs font-medium text-dblue-600 hover:text-dblue-700 disabled:opacity-50"
                  >
                    {existingSchedule.enabled ? 'Pause' : 'Resume'}
                  </button>
                </div>

                {/* Cron expression — inline edit */}
                <div>
                  <label className="block text-xs font-semibold text-surface-500 mb-1.5">Schedule (cron)</label>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-surface-200 rounded focus:outline-none focus:ring-1 focus:ring-dblue-500"
                      value={cronInput || existingSchedule.cron_expression}
                      defaultValue={existingSchedule.cron_expression}
                      onChange={(e) => { setCronInput(e.target.value); validateCron(e.target.value) }}
                      placeholder="0 0 * * *"
                    />
                    <button
                      onClick={() => {
                        const val = cronInput || existingSchedule.cron_expression
                        if (!validateCron(val)) return
                        updateCronMut.mutate({ id: existingSchedule.id, cron: val, maxRetries: maxRetriesInput || existingSchedule.max_retries })
                      }}
                      disabled={updateCronMut.isPending}
                      className="px-3 py-1.5 text-xs font-medium bg-dblue-500 text-white rounded hover:bg-dblue-600 disabled:opacity-50"
                    >
                      {updateCronMut.isPending ? <Loader2 size={11} className="animate-spin" /> : 'Update'}
                    </button>
                  </div>
                  {cronError && <p className="mt-1 text-xs text-red-500">{cronError}</p>}
                  <p className="mt-1 text-xs text-surface-400">
                    {describeCron(cronInput || existingSchedule.cron_expression)}
                  </p>
                </div>

                {/* Preset chips */}
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.cron}
                      onClick={() => { setCronInput(p.cron); setCronError(null) }}
                      className={clsx(
                        'px-2.5 py-1 rounded-full text-xs border transition-colors',
                        cronInput === p.cron || (!cronInput && existingSchedule.cron_expression === p.cron)
                          ? 'bg-dblue-500 text-white border-dblue-500'
                          : 'border-surface-200 text-surface-600 hover:border-dblue-400 hover:text-dblue-600'
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Last run */}
                <div className="flex items-center gap-3 pt-1 border-t border-surface-200">
                  <div className="text-xs text-surface-500">
                    Last run: <span className="font-medium text-surface-700">{relativeTime(existingSchedule.last_run_at)}</span>
                  </div>
                  {existingSchedule.last_run_status && (
                    <div className={clsx(
                      'flex items-center gap-1 text-xs font-medium',
                      existingSchedule.last_run_status === 'success' ? 'text-emerald-600' : 'text-red-600'
                    )}>
                      {existingSchedule.last_run_status === 'success'
                        ? <CheckCircle size={12} />
                        : <XCircle size={12} />}
                      {existingSchedule.last_run_status}
                    </div>
                  )}
                </div>
                {existingSchedule.last_run_status === 'retrying' && existingSchedule.retry_next_at && (
                  <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-2 rounded-lg">
                    <Loader2 size={12} className="animate-spin shrink-0" />
                    <span>
                      Retry {existingSchedule.retry_count}/{existingSchedule.max_retries} — next attempt at{' '}
                      {new Date(existingSchedule.retry_next_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                {existingSchedule.last_run_status === 'failed' && existingSchedule.last_run_error && (
                  <p className="text-xs text-red-500 bg-red-50 px-2 py-1.5 rounded">
                    {existingSchedule.last_run_error}
                  </p>
                )}

                {/* Retry config */}
                <div className="pt-1 border-t border-surface-200">
                  <label className="block text-xs font-semibold text-surface-500 mb-1.5">
                    Retry on failure
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0} max={5} step={1}
                      value={maxRetriesInput !== 0 ? maxRetriesInput : (existingSchedule.max_retries ?? 0)}
                      onChange={(e) => setMaxRetriesInput(Number(e.target.value))}
                      className="flex-1 accent-dblue-500"
                    />
                    <span className="text-xs font-mono w-16 text-surface-600">
                      {(maxRetriesInput !== 0 ? maxRetriesInput : (existingSchedule.max_retries ?? 0)) === 0
                        ? 'No retry'
                        : `${maxRetriesInput !== 0 ? maxRetriesInput : existingSchedule.max_retries}× retry`}
                    </span>
                  </div>
                  {(maxRetriesInput !== 0 ? maxRetriesInput : (existingSchedule.max_retries ?? 0)) > 0 && (
                    <p className="text-xs text-surface-400 mt-1">
                      Backoff: 1m → 2m → 4m → 8m → 16m before alerting
                    </p>
                  )}
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={() => deleteMut.mutate(existingSchedule.id)}
                disabled={deleteMut.isPending}
                className="flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                {deleteMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Remove schedule
              </button>
            </div>

          ) : (

            /* ── No schedule yet ───────────────────────────────────── */
            <div className="space-y-4">
              <p className="text-sm text-surface-500">
                Set a cron schedule to run this pipeline automatically.
              </p>

              {/* Presets */}
              <div>
                <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
                  Quick Presets
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.cron}
                      onClick={() => { setCronInput(p.cron); setCronError(null) }}
                      className={clsx(
                        'px-2.5 py-1 rounded-full text-xs border transition-colors',
                        cronInput === p.cron
                          ? 'bg-dblue-500 text-white border-dblue-500'
                          : 'border-surface-200 text-surface-600 hover:border-dblue-400 hover:text-dblue-600'
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom cron */}
              <div>
                <label className="block text-xs font-semibold text-surface-500 mb-1">
                  Cron Expression
                  <span className="ml-1 font-normal text-surface-400">(minute hour day month weekday)</span>
                </label>
                <input
                  className={clsx(
                    'w-full px-2.5 py-1.5 text-xs font-mono border rounded focus:outline-none focus:ring-1 focus:ring-dblue-500',
                    cronError ? 'border-red-400' : 'border-surface-200'
                  )}
                  value={cronInput}
                  onChange={(e) => { setCronInput(e.target.value); validateCron(e.target.value) }}
                  placeholder="0 0 * * *"
                />
                {cronError
                  ? <p className="mt-1 text-xs text-red-500">{cronError}</p>
                  : <p className="mt-1 text-xs text-surface-400">{describeCron(cronInput)}</p>
                }
              </div>

              {/* Retry on failure */}
              <div>
                <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1.5">
                  Retry on failure
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0} max={5} step={1}
                    value={maxRetriesInput}
                    onChange={(e) => setMaxRetriesInput(Number(e.target.value))}
                    className="flex-1 accent-dblue-500"
                  />
                  <span className="text-xs font-mono w-16 text-surface-600">
                    {maxRetriesInput === 0 ? 'No retry' : `${maxRetriesInput}× retry`}
                  </span>
                </div>
                {maxRetriesInput > 0 && (
                  <p className="text-xs text-surface-400 mt-1">
                    Exponential backoff: 1m → 2m → 4m → … before alerting
                  </p>
                )}
              </div>

              {/* Enable toggle */}
              <label className="flex items-center gap-2.5 cursor-pointer">
                <div
                  onClick={() => setEnabledInput((v) => !v)}
                  className={clsx(
                    'w-9 h-5 rounded-full transition-colors relative cursor-pointer',
                    enabledInput ? 'bg-dblue-500' : 'bg-surface-300'
                  )}
                >
                  <span className={clsx(
                    'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                    enabledInput ? 'translate-x-4.5' : 'translate-x-0.5'
                  )} />
                </div>
                <span className="text-sm text-surface-700">
                  {enabledInput ? 'Start active' : 'Create paused'}
                </span>
              </label>

              {createMut.isError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-xs">
                  <XCircle size={13} className="shrink-0 mt-0.5" />
                  {(createMut.error as Error).message}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-surface-100 bg-surface-50">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-surface-500 hover:text-surface-700 transition-colors"
          >
            {existingSchedule ? 'Close' : 'Cancel'}
          </button>
          {!existingSchedule && (
            <button
              onClick={handleCreate}
              disabled={createMut.isPending || !!cronError}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-dblue-500 text-white rounded hover:bg-dblue-600 transition-colors disabled:opacity-50"
            >
              {createMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              Create Schedule
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
