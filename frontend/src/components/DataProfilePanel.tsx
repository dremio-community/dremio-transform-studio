import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, BarChart2, Clock } from 'lucide-react'
import { IconClose, IconErrorCircle, IconRefresh } from './icons'
import clsx from 'clsx'
import { fetchTableProfile } from '../api/client'
import type { ColumnProfile, TableProfile } from '../api/client'

interface Props {
  table: string
  onClose: () => void
}

function NullBar({ pct }: { pct: number }) {
  const r = Math.round(Math.min(255, (pct / 100) * 510))
  const g = Math.round(Math.min(255, ((100 - pct) / 100) * 510))
  const color = `rgb(${r},${g},0)`
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-surface-200 rounded-full overflow-hidden shrink-0">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs text-surface-500 tabular-nums w-9 text-right">{pct.toFixed(1)}%</span>
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    VARCHAR: 'bg-purple-100 text-purple-700',
    BIGINT: 'bg-blue-100 text-blue-700',
    INTEGER: 'bg-blue-100 text-blue-700',
    DOUBLE: 'bg-cyan-100 text-cyan-700',
    FLOAT: 'bg-cyan-100 text-cyan-700',
    BOOLEAN: 'bg-green-100 text-green-700',
    DATE: 'bg-amber-100 text-amber-700',
    TIMESTAMP: 'bg-amber-100 text-amber-700',
    DECIMAL: 'bg-indigo-100 text-indigo-700',
  }
  const cls = colors[type.toUpperCase()] ?? 'bg-surface-100 text-surface-600'
  return <span className={clsx('text-xs font-mono px-1.5 py-0.5 rounded font-medium', cls)}>{type}</span>
}

function ProfileRow({ col }: { col: ColumnProfile }) {
  const truncate = (s: string, n = 20) => s.length > n ? s.slice(0, n) + '…' : s
  return (
    <tr className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
      <td className="px-3 py-2 text-xs font-medium text-surface-800 max-w-[140px] truncate" title={col.name}>{col.name}</td>
      <td className="px-3 py-2"><TypeBadge type={col.type} /></td>
      <td className="px-3 py-2"><NullBar pct={col.null_pct} /></td>
      <td className="px-3 py-2 text-xs text-surface-600 tabular-nums text-right">{col.distinct.toLocaleString()}</td>
      <td className="px-3 py-2 text-xs font-mono text-surface-500 max-w-[100px] truncate" title={col.min}>{truncate(col.min)}</td>
      <td className="px-3 py-2 text-xs font-mono text-surface-500 max-w-[100px] truncate" title={col.max}>{truncate(col.max)}</td>
    </tr>
  )
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function DataProfilePanel({ table, onClose }: Props) {
  const [triggered, setTriggered] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const queryClient = useQueryClient()

  const { data: profile, isFetching, error } = useQuery<TableProfile & { from_cache?: boolean; cached_at?: string }>({
    queryKey: ['profile', table],
    queryFn: () => fetchTableProfile(table),
    enabled: triggered,
    staleTime: Infinity, // never auto-refetch — user controls refresh
  })

  const handleRefresh = async () => {
    setRefreshing(true)
    // Invalidate and refetch with ?refresh=true
    await queryClient.fetchQuery({
      queryKey: ['profile', table, 'refresh'],
      queryFn: () => fetchTableProfile(table, true),
    })
    // Update the main cache key too
    queryClient.setQueryData(['profile', table], queryClient.getQueryData(['profile', table, 'refresh']))
    setRefreshing(false)
  }

  return (
    <div className="bg-white border border-surface-200 rounded-lg shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-navy-900 border-b border-navy-800">
        <BarChart2 size={14} className="text-dblue-400" />
        <span className="text-sm font-semibold text-white flex-1">Data Profile</span>
        <code className="text-xs font-mono text-surface-400 truncate max-w-xs">{table}</code>
        {profile && (
          <button
            onClick={handleRefresh}
            disabled={refreshing || isFetching}
            title="Refresh profile (re-runs Dremio query)"
            className="ml-1 p-1 rounded text-surface-400 hover:text-white hover:bg-navy-700 transition-colors disabled:opacity-40"
          >
            <IconRefresh size={12} className={clsx(refreshing && 'animate-spin')} />
          </button>
        )}
        <button onClick={onClose} className="p-1 rounded text-surface-400 hover:text-white hover:bg-navy-700 transition-colors">
          <IconClose size={13} />
        </button>
      </div>

      {/* Body */}
      <div className="max-h-72 overflow-y-auto">
        {!triggered ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <p className="text-sm text-surface-500">Profile this table to see column statistics.</p>
            <button
              onClick={() => setTriggered(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-dblue-500 text-white rounded-lg hover:bg-dblue-600 transition-colors"
            >
              <BarChart2 size={14} /> Profile Table
            </button>
          </div>
        ) : isFetching || refreshing ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-surface-500">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Running profile query on Dremio…</span>
            <span className="text-xs text-surface-400">This takes a few seconds — results will be cached for next time</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 p-4 text-red-600">
            <IconErrorCircle size={14} />
            <span className="text-sm">{(error as Error).message}</span>
          </div>
        ) : profile ? (
          <>
            <div className="px-4 py-1.5 bg-surface-50 border-b border-surface-100 flex items-center gap-3">
              <span className="text-xs text-surface-500">
                <span className="font-semibold text-surface-700">{profile.total_rows.toLocaleString()}</span> rows
                {profile.sampled && ' (sampled from first 10,000)'}
              </span>
              <span className="text-xs text-surface-400">·</span>
              <span className="text-xs text-surface-500">
                <span className="font-semibold text-surface-700">{profile.columns.length}</span> columns
              </span>
              {profile.from_cache && profile.cached_at && (
                <>
                  <span className="text-xs text-surface-400">·</span>
                  <span className="flex items-center gap-1 text-xs text-surface-400">
                    <Clock size={10} /> Cached {timeAgo(profile.cached_at)}
                  </span>
                </>
              )}
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-50 sticky top-0">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Column</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Nulls</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-surface-500 uppercase tracking-wider">Distinct</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Min</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Max</th>
                </tr>
              </thead>
              <tbody>
                {profile.columns.map((col) => <ProfileRow key={col.name} col={col} />)}
              </tbody>
            </table>
          </>
        ) : null}
      </div>
    </div>
  )
}
