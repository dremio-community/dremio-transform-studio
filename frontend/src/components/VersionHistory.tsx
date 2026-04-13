import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock, RotateCcw } from 'lucide-react'
import clsx from 'clsx'

import type { Pipeline, VersionEntry } from '../types'
import { fetchPipelineHistory, fetchPipelineVersion } from '../api/client'

interface Props {
  pipelineId: string
  currentVersion: number
  onRestore: (pipeline: Pipeline) => void
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

export default function VersionHistory({ pipelineId, currentVersion, onRestore }: Props) {
  const [confirmingVersion, setConfirmingVersion] = useState<number | null>(null)
  const [restoring, setRestoring] = useState(false)

  const { data: history = [], isLoading, error } = useQuery<VersionEntry[]>({
    queryKey: ['history', pipelineId],
    queryFn: () => fetchPipelineHistory(pipelineId),
    enabled: !!pipelineId,
  })

  const sorted = [...history].sort((a, b) => b.version - a.version)

  const handleRestoreClick = (version: number) => {
    setConfirmingVersion(version)
  }

  const handleConfirmRestore = async (version: number) => {
    setRestoring(true)
    try {
      const pipeline = await fetchPipelineVersion(pipelineId, version)
      onRestore(pipeline)
    } finally {
      setRestoring(false)
      setConfirmingVersion(null)
    }
  }

  const handleCancelRestore = () => {
    setConfirmingVersion(null)
  }

  if (isLoading) {
    return (
      <div className="p-6 text-center text-surface-400 text-xs">
        Loading history...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-400 text-xs">
        Failed to load history
      </div>
    )
  }

  if (sorted.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center gap-3 text-center">
        <Clock size={28} className="text-surface-300" />
        <p className="text-xs text-surface-400">No version history yet.<br />Save the pipeline to create a version.</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-surface-100">
      {sorted.map((entry) => {
        const isCurrent = entry.version === currentVersion
        const isConfirming = confirmingVersion === entry.version

        return (
          <div
            key={entry.id}
            className={clsx(
              'px-4 py-3 flex flex-col gap-1',
              isCurrent ? 'bg-blue-50' : 'bg-white hover:bg-surface-50'
            )}
          >
            {/* Top row: version badge + time */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold text-surface-700">
                  v{entry.version}
                </span>
                {isCurrent && (
                  <span className="text-xs font-medium text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full leading-none">
                    current
                  </span>
                )}
              </div>
              <span className="text-xs text-surface-400 flex items-center gap-1">
                <Clock size={10} />
                {relativeTime(entry.created_at)}
              </span>
            </div>

            {/* Message */}
            <p className="text-xs text-surface-600 leading-relaxed">
              {entry.message || <span className="italic text-surface-400">No message</span>}
            </p>

            {/* Restore controls */}
            {!isCurrent && (
              <div className="mt-1">
                {isConfirming ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-surface-500">Are you sure?</span>
                    <button
                      onClick={() => handleConfirmRestore(entry.version)}
                      disabled={restoring}
                      className="text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 px-2 py-1 rounded transition-colors"
                    >
                      {restoring ? 'Restoring…' : 'Yes'}
                    </button>
                    <button
                      onClick={handleCancelRestore}
                      disabled={restoring}
                      className="text-xs font-medium text-surface-500 hover:text-surface-700 px-2 py-1 rounded transition-colors"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleRestoreClick(entry.version)}
                    className="flex items-center gap-1 text-xs text-surface-500 hover:text-blue-600 transition-colors"
                  >
                    <RotateCcw size={11} />
                    Restore
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
