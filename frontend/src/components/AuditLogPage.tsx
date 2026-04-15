import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Download, ScrollText, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchAuditLog, exportAuditLogCsv, fetchUsers } from '../api/client'
import type { AuditLogEntry } from '../types'
import clsx from 'clsx'

interface Props {
  onClose: () => void
}

const PAGE_SIZE = 50

const ACTION_COLORS: Record<string, string> = {
  pipeline_created: 'bg-blue-100 text-blue-700',
  pipeline_saved: 'bg-blue-50 text-blue-600',
  pipeline_deleted: 'bg-red-100 text-red-700',
  pipeline_executed: 'bg-emerald-100 text-emerald-700',
  pipeline_previewed: 'bg-gray-100 text-gray-600',
  user_created: 'bg-violet-100 text-violet-700',
  user_deleted: 'bg-red-100 text-red-700',
  user_role_changed: 'bg-violet-50 text-violet-600',
  schedule_created: 'bg-amber-100 text-amber-700',
  schedule_updated: 'bg-amber-50 text-amber-600',
  schedule_deleted: 'bg-red-50 text-red-600',
  schedule_run: 'bg-amber-50 text-amber-600',
  auth_settings_changed: 'bg-rose-100 text-rose-700',
  sso_configured: 'bg-teal-100 text-teal-700',
  sso_deleted: 'bg-red-50 text-red-600',
  settings_changed: 'bg-gray-100 text-gray-600',
  pipeline_shared: 'bg-indigo-100 text-indigo-700',
  pipeline_permission_changed: 'bg-indigo-50 text-indigo-600',
}

export default function AuditLogPage({ onClose }: Props) {
  const [filterStart, setFilterStart] = useState('')
  const [filterEnd, setFilterEnd] = useState('')
  const [filterUserId, setFilterUserId] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterResource, setFilterResource] = useState('')
  const [page, setPage] = useState(0)
  const [exporting, setExporting] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-log', filterStart, filterEnd, filterUserId, filterAction, filterResource, page],
    queryFn: () => fetchAuditLog({
      start: filterStart || undefined,
      end: filterEnd || undefined,
      user_id: filterUserId || undefined,
      action: filterAction || undefined,
      resource_name: filterResource || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    staleTime: 15_000,
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    enabled: true,
  })

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportAuditLogCsv({
        start: filterStart || undefined,
        end: filterEnd || undefined,
        user_id: filterUserId || undefined,
        action: filterAction || undefined,
        resource_name: filterResource || undefined,
      })
    } finally {
      setExporting(false)
    }
  }

  const handleReset = () => {
    setFilterStart('')
    setFilterEnd('')
    setFilterUserId('')
    setFilterAction('')
    setFilterResource('')
    setPage(0)
  }

  const inputCls = 'text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-dblue-400'
  const labelCls = 'block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5'

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0
  const showingStart = page * PAGE_SIZE + 1
  const showingEnd = Math.min((page + 1) * PAGE_SIZE, data?.total ?? 0)

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-navy-950 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm text-surface-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2">
            <ScrollText size={16} className="text-dblue-400" />
            <span className="text-white font-semibold text-sm">Audit Log</span>
          </div>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-navy-800 text-surface-300 hover:bg-navy-700 hover:text-white border border-navy-700 transition-colors disabled:opacity-50"
        >
          {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          Export CSV
        </button>
      </div>

      {/* Filter bar */}
      <div className="border-b bg-gray-50 px-4 py-2.5 flex gap-3 flex-wrap items-end shrink-0">
        <div>
          <label className={labelCls}>From</label>
          <input
            type="date"
            value={filterStart}
            onChange={e => { setFilterStart(e.target.value); setPage(0) }}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>To</label>
          <input
            type="date"
            value={filterEnd}
            onChange={e => { setFilterEnd(e.target.value); setPage(0) }}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>User</label>
          <select
            value={filterUserId}
            onChange={e => { setFilterUserId(e.target.value); setPage(0) }}
            className={inputCls}
          >
            <option value="">All users</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.username}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Action</label>
          <select
            value={filterAction}
            onChange={e => { setFilterAction(e.target.value); setPage(0) }}
            className={inputCls}
          >
            <option value="">All actions</option>
            {Object.keys(ACTION_COLORS).map(action => (
              <option key={action} value={action}>{action.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Resource</label>
          <input
            type="text"
            value={filterResource}
            onChange={e => { setFilterResource(e.target.value); setPage(0) }}
            placeholder="Filter resource..."
            className={inputCls}
          />
        </div>
        <button
          onClick={handleReset}
          className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-200 transition-colors"
        >
          Reset
        </button>
        <span className="text-[10px] text-gray-400 self-end pb-1">
          {data?.total ?? 0} events
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-full gap-2 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        )}
        {isError && (
          <div className="flex items-center justify-center h-full">
            <span className="text-sm text-red-500">Failed to load audit log</span>
          </div>
        )}
        {!isLoading && !isError && data && data.entries.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
            <ScrollText size={32} className="text-gray-300" />
            <span className="text-sm">No audit events found</span>
          </div>
        )}
        {!isLoading && !isError && data && data.entries.length > 0 && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-gray-500 font-semibold whitespace-nowrap">Time</th>
                <th className="text-left px-4 py-2 text-gray-500 font-semibold">User</th>
                <th className="text-left px-4 py-2 text-gray-500 font-semibold">Action</th>
                <th className="text-left px-4 py-2 text-gray-500 font-semibold">Resource</th>
                <th className="text-left px-4 py-2 text-gray-500 font-semibold">Details</th>
                <th className="text-left px-4 py-2 text-gray-500 font-semibold">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.entries.map((entry: AuditLogEntry) => (
                <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2 whitespace-nowrap text-gray-500 font-mono text-[11px]">
                    {new Date(entry.event_time).toLocaleString(undefined, {
                      month: 'short', day: 'numeric', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {entry.username === 'scheduler'
                      ? <span className="italic text-gray-400">scheduled</span>
                      : <span className="font-medium text-gray-700">{entry.username ?? entry.user_id ?? '—'}</span>
                    }
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className={clsx('px-2 py-0.5 rounded-full font-medium', ACTION_COLORS[entry.action] ?? 'bg-gray-100 text-gray-600')}>
                      {entry.action.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-2 max-w-[180px] truncate">
                    {entry.resource_type && <span className="text-gray-400 mr-1">{entry.resource_type}</span>}
                    <span className="text-gray-700">{entry.resource_name ?? entry.resource_id ?? '—'}</span>
                  </td>
                  <td className="px-4 py-2 max-w-[200px]">
                    {entry.details ? (() => {
                      try {
                        const d = JSON.parse(entry.details)
                        return (
                          <span className="text-gray-500">
                            {Object.entries(d).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                          </span>
                        )
                      } catch {
                        return <span className="text-gray-400 font-mono text-[10px]">{entry.details.slice(0, 60)}</span>
                      }
                    })() : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2 font-mono text-[10px] text-gray-400">{entry.ip_address ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination footer */}
      {data && data.total > 0 && (
        <div className="border-t px-4 py-2.5 flex items-center justify-between bg-gray-50 shrink-0">
          <span className="text-xs text-gray-500">
            Showing {showingStart}–{showingEnd} of {data.total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page === 0}
              className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages - 1}
              className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
