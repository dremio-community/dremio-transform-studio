import React from 'react'
import { Plus, Trash2, ExternalLink } from 'lucide-react'
import type { Exposure, ExposureToolType } from '../types'

interface ExposuresPanelProps {
  exposures: Exposure[]
  onExposuresChange: (exposures: Exposure[]) => void
}

const TOOL_OPTIONS: { value: ExposureToolType; label: string; icon: string }[] = [
  { value: 'tableau',   label: 'Tableau',   icon: '📊' },
  { value: 'looker',    label: 'Looker',    icon: '👁️' },
  { value: 'metabase',  label: 'Metabase',  icon: '📈' },
  { value: 'powerbi',   label: 'Power BI',  icon: '📉' },
  { value: 'mode',      label: 'Mode',      icon: '📋' },
  { value: 'superset',  label: 'Superset',  icon: '⚡' },
  { value: 'redash',    label: 'Redash',    icon: '🔮' },
  { value: 'custom',    label: 'Custom',    icon: '🔗' },
]

function toolIcon(tool: ExposureToolType): string {
  return TOOL_OPTIONS.find(o => o.value === tool)?.icon ?? '🔗'
}
function toolLabel(tool: ExposureToolType): string {
  return TOOL_OPTIONS.find(o => o.value === tool)?.label ?? tool
}

function newExposure(): Exposure {
  return {
    id: crypto.randomUUID(),
    name: '',
    url: '',
    tool_type: 'custom',
    description: '',
  }
}

export default function ExposuresPanel({ exposures, onExposuresChange }: ExposuresPanelProps) {
  const [expanded, setExpanded] = React.useState<string | null>(null)

  function add() {
    const e = newExposure()
    onExposuresChange([...exposures, e])
    setExpanded(e.id)
  }

  function update(id: string, patch: Partial<Exposure>) {
    onExposuresChange(exposures.map(e => e.id === id ? { ...e, ...patch } : e))
  }

  function remove(id: string) {
    onExposuresChange(exposures.filter(e => e.id !== id))
    if (expanded === id) setExpanded(null)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Tag downstream BI tools and dashboards that consume this pipeline's output.
          Exposures appear in the lineage view.
        </p>
        <button
          onClick={add}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-navy-700 text-white rounded hover:bg-navy-600 shrink-0 ml-2"
        >
          <Plus size={12} />
          Add
        </button>
      </div>

      {/* Empty state */}
      {exposures.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-xs border-2 border-dashed border-gray-200 rounded-lg">
          <div className="text-2xl mb-1">📊</div>
          No exposures defined yet.
          <br />Click <strong>Add</strong> to tag a downstream BI tool or dashboard.
        </div>
      )}

      {/* List */}
      <div className="flex flex-col gap-2">
        {exposures.map(exp => {
          const isOpen = expanded === exp.id
          return (
            <div key={exp.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              {/* Row */}
              <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpanded(isOpen ? null : exp.id)}
              >
                <span className="text-base leading-none">{toolIcon(exp.tool_type)}</span>
                <span className="flex-1 text-xs font-medium text-gray-700 truncate">
                  {exp.name || <span className="text-gray-400 italic">Unnamed exposure</span>}
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium">
                  {toolLabel(exp.tool_type)}
                </span>
                {exp.url && (
                  <a
                    href={exp.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-gray-400 hover:text-dblue-500"
                    title="Open URL"
                  >
                    <ExternalLink size={11} />
                  </a>
                )}
                <button
                  onClick={e => { e.stopPropagation(); remove(exp.id) }}
                  className="text-gray-300 hover:text-red-400 ml-1"
                >
                  <Trash2 size={12} />
                </button>
              </div>

              {/* Editor */}
              {isOpen && (
                <div className="border-t border-gray-100 bg-gray-50/50 px-3 py-2 flex flex-col gap-2">
                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">Name</label>
                    <input
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                      placeholder="e.g. Weekly Sales Dashboard"
                      value={exp.name}
                      onChange={e => update(exp.id, { name: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">BI Tool</label>
                    <select
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                      value={exp.tool_type}
                      onChange={e => update(exp.id, { tool_type: e.target.value as ExposureToolType })}
                    >
                      {TOOL_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.icon} {o.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">URL</label>
                    <input
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white font-mono"
                      placeholder="https://tableau.mycompany.com/views/..."
                      value={exp.url}
                      onChange={e => update(exp.id, { url: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">Description <span className="text-gray-400">(optional)</span></label>
                    <input
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                      placeholder="e.g. Used by finance team for weekly reporting"
                      value={exp.description || ''}
                      onChange={e => update(exp.id, { description: e.target.value || undefined })}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
