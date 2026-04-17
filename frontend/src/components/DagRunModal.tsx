import React, { useState } from 'react'
import { Loader2, SkipForward, GitMerge } from 'lucide-react'
import { IconCaretRight, IconCheckCircle, IconClose, IconErrorCircle } from './icons'
import type { DagExecuteResult, DagPipelineResult } from '../types'
import { executeWithDeps } from '../api/client'

interface DagRunModalProps {
  pipelineId: string
  pipelineName: string
  dependencies: string[]           // upstream pipeline IDs
  dependencyNames: string[]        // upstream pipeline names (same order)
  outputTable?: string
  outputMode?: string
  onClose: () => void
}

export default function DagRunModal({
  pipelineId,
  pipelineName,
  dependencies,
  dependencyNames,
  outputTable,
  outputMode,
  onClose,
}: DagRunModalProps) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<DagExecuteResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Build ordered display list: deps first, then target
  const chainNames = [...dependencyNames, pipelineName]

  const handleRun = async () => {
    setRunning(true)
    setError(null)
    try {
      const res = await executeWithDeps(pipelineId, outputTable, outputMode)
      setResult(res)
    } catch (e) {
      setError((e as Error).message ?? 'Execution failed')
    } finally {
      setRunning(false)
    }
  }

  const statusIcon = (r: DagPipelineResult) => {
    if (r.skipped) return <SkipForward size={16} className="text-white/60" />
    if (r.success) return <IconCheckCircle size={16} className="text-emerald-400" />
    return <IconErrorCircle size={16} className="text-red-400" />
  }

  const resultFor = (name: string): DagPipelineResult | undefined =>
    result?.pipeline_results.find(r => r.pipeline_name === name)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-navy-900 border border-navy-700 rounded-xl shadow-2xl w-[520px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800">
          <div className="flex items-center gap-2">
            <GitMerge size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-white">Run with Dependencies</h2>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white">
            <IconClose size={15} />
          </button>
        </div>

        {/* Chain preview */}
        <div className="px-5 py-4 border-b border-navy-800">
          <p className="text-xs text-white/60 mb-3">
            Pipelines will run in order. If any step fails, subsequent steps are skipped.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {chainNames.map((name, i) => (
              <React.Fragment key={name}>
                <div className={`flex items-center gap-2 px-2.5 py-1 rounded text-xs ${
                  name === pipelineName
                    ? 'bg-dblue-500 text-white font-semibold'
                    : 'bg-navy-800 text-white/70'
                }`}>
                  {result && (() => {
                    const r = resultFor(name)
                    if (!r) return null
                    return <span className="mr-1">{statusIcon(r)}</span>
                  })()}
                  {running && !result && i === 0 && <Loader2 size={12} className="animate-spin mr-1" />}
                  {name}
                </div>
                {i < chainNames.length - 1 && (
                  <IconCaretRight size={14} className="text-white/30" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="px-5 py-4 flex-1 overflow-y-auto">
            <div className="space-y-2">
              {result.pipeline_results.map(r => (
                <div
                  key={r.pipeline_id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    r.skipped
                      ? 'border-navy-700 bg-navy-800/40'
                      : r.success
                      ? 'border-emerald-800 bg-emerald-900/20'
                      : 'border-red-800 bg-red-900/20'
                  }`}
                >
                  <div className="mt-0.5">{statusIcon(r)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium">{r.pipeline_name}</p>
                    {r.skipped && (
                      <p className="text-xs text-white/60 mt-0.5">Skipped — upstream failure</p>
                    )}
                    {!r.skipped && r.success && (
                      <p className="text-xs text-emerald-400 mt-0.5">
                        {r.rows_written != null ? `${r.rows_written.toLocaleString()} rows written` : 'Success'}
                        {r.duration_ms != null && ` in ${(r.duration_ms / 1000).toFixed(1)}s`}
                      </p>
                    )}
                    {!r.skipped && !r.success && (
                      <p className="text-xs text-red-400 mt-0.5 font-mono break-all">{r.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="mt-4 pt-4 border-t border-navy-800 flex gap-4 text-xs">
              <span className="text-emerald-400">{result.succeeded} succeeded</span>
              {result.failed > 0 && <span className="text-red-400">{result.failed} failed</span>}
              {result.skipped > 0 && <span className="text-white/60">{result.skipped} skipped</span>}
            </div>
          </div>
        )}

        {error && (
          <div className="px-5 py-3 mx-5 my-2 bg-red-900/30 border border-red-800 rounded text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 border-t border-navy-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-white/70 hover:text-white rounded border border-navy-700 hover:border-white/15 transition-colors"
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              onClick={handleRun}
              disabled={running}
              className="px-4 py-1.5 text-xs font-semibold bg-dblue-500 hover:bg-dblue-400 text-white rounded disabled:opacity-50 flex items-center gap-1.5 transition-colors"
            >
              {running && <Loader2 size={12} className="animate-spin" />}
              {running ? 'Running…' : `Run Chain (${chainNames.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
