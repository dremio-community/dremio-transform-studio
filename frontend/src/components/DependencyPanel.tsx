import React, { useState, useEffect } from 'react'
import { Plus, X, GitBranch, AlertTriangle, ArrowRight } from 'lucide-react'
import type { Pipeline } from '../types'
import { updatePipelineDependencies, fetchDag } from '../api/client'

interface DependencyPanelProps {
  pipeline: Pipeline
  allPipelines: Pipeline[]
  onDependenciesChange: (deps: string[]) => void
}

export default function DependencyPanel({ pipeline, allPipelines, onDependenciesChange }: DependencyPanelProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cycles, setCycles] = useState<string[][]>([])
  const [pickingDep, setPickingDep] = useState(false)

  const deps = pipeline.dependencies || []
  const available = allPipelines.filter(
    p => p.id !== pipeline.id && !deps.includes(p.id)
  )
  const depPipelines = deps.map(id => allPipelines.find(p => p.id === id)).filter(Boolean) as Pipeline[]

  // Check for cycles whenever deps change
  useEffect(() => {
    if (!pipeline.id) return
    fetchDag().then(dag => {
      if (dag.cycles.length > 0) {
        const myCycles = dag.cycles.filter(cycle => cycle.includes(pipeline.id))
        setCycles(myCycles)
      } else {
        setCycles([])
      }
    }).catch(() => {})
  }, [pipeline.id, deps.length])

  async function addDep(depId: string) {
    const newDeps = [...deps, depId]
    setPickingDep(false)
    onDependenciesChange(newDeps)
    if (pipeline.id) {
      setSaving(true)
      try {
        await updatePipelineDependencies(pipeline.id, newDeps)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to save')
      } finally {
        setSaving(false)
      }
    }
  }

  async function removeDep(depId: string) {
    const newDeps = deps.filter(d => d !== depId)
    onDependenciesChange(newDeps)
    if (pipeline.id) {
      setSaving(true)
      try {
        await updatePipelineDependencies(pipeline.id, newDeps)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to save')
      } finally {
        setSaving(false)
      }
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Explanation */}
      <p className="text-xs text-gray-500">
        Upstream pipelines that must run <strong>before</strong> this one in scheduled or chained runs.
        Analogous to <code className="bg-gray-100 px-0.5 rounded text-xs">ref()</code> in dbt.
      </p>

      {/* Cycle warning */}
      {cycles.length > 0 && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded px-3 py-2 text-xs text-red-700">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-red-400" />
          <div>
            <strong>Circular dependency detected!</strong>
            {cycles.map((cycle, i) => (
              <div key={i} className="mt-0.5 font-mono">
                {cycle.map(id => allPipelines.find(p => p.id === id)?.name || id).join(' → ')} → ...
              </div>
            ))}
            Remove one of the edges to fix this.
          </div>
        </div>
      )}

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-1.5">
          {error}
        </div>
      )}

      {/* Current deps */}
      {depPipelines.length === 0 ? (
        <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 text-xs">
          <GitBranch size={20} className="mx-auto mb-1 opacity-40" />
          No upstream dependencies.
          <br />This pipeline runs independently.
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {depPipelines.map(dep => (
            <div
              key={dep.id}
              className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg"
            >
              <ArrowRight size={12} className="text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-700 truncate">{dep.name}</div>
                {dep.output_table && (
                  <div className="text-xs text-gray-400 truncate">→ {dep.output_table}</div>
                )}
              </div>
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                dep.output_mode === 'ctas' ? 'bg-blue-100 text-blue-700' :
                dep.output_mode === 'incremental' ? 'bg-purple-100 text-purple-700' :
                dep.output_mode === 'view' ? 'bg-teal-100 text-teal-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {dep.output_mode}
              </span>
              <button
                onClick={() => removeDep(dep.id)}
                className="text-gray-300 hover:text-red-400 shrink-0"
                title="Remove dependency"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add dependency */}
      {!pickingDep ? (
        <button
          onClick={() => setPickingDep(true)}
          disabled={available.length === 0}
          className="flex items-center gap-1 px-3 py-1.5 text-xs border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-dblue-400 hover:text-dblue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors w-full justify-center"
        >
          <Plus size={12} />
          {available.length === 0 ? 'No more pipelines to add' : 'Add Upstream Pipeline'}
        </button>
      ) : (
        <div className="border border-dblue-300 rounded-lg overflow-hidden">
          <div className="bg-dblue-50 px-3 py-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-dblue-700">Pick upstream pipeline</span>
            <button onClick={() => setPickingDep(false)} className="text-gray-400 hover:text-gray-600">
              <X size={13} />
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {available.map(p => (
              <button
                key={p.id}
                onClick={() => addDep(p.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-dblue-50 border-b border-gray-100 last:border-0 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-700 truncate">{p.name}</div>
                  {p.output_table && (
                    <div className="text-xs text-gray-400 truncate">→ {p.output_table}</div>
                  )}
                </div>
                <span className={`text-xs px-1 py-0.5 rounded shrink-0 ${
                  p.output_mode === 'ctas' ? 'bg-blue-100 text-blue-700' :
                  p.output_mode === 'incremental' ? 'bg-purple-100 text-purple-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {p.output_mode}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {saving && (
        <div className="text-xs text-gray-400 text-center">Saving...</div>
      )}

      {/* Execution order info */}
      {depPipelines.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600">
          <strong>Run order:</strong>{' '}
          {depPipelines.map(d => d.name).join(' → ')}
          {' '}→ <strong className="text-navy-700">{pipeline.name}</strong>
        </div>
      )}
    </div>
  )
}
