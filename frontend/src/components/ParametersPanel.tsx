import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import type { PipelineParameter } from '../types'

interface ParametersPanelProps {
  parameters: PipelineParameter[]
  onChange: (params: PipelineParameter[]) => void
}

const PARAM_TYPES: PipelineParameter['type'][] = ['string', 'number', 'date']

const emptyParam = (): PipelineParameter => ({
  name: '',
  type: 'string',
  default_value: '',
  description: '',
})

export default function ParametersPanel({ parameters, onChange }: ParametersPanelProps) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<PipelineParameter>(emptyParam())
  const [draftError, setDraftError] = useState<string | null>(null)

  const handleAdd = () => {
    if (!draft.name.trim()) {
      setDraftError('Name is required')
      return
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(draft.name.trim())) {
      setDraftError('Name must start with a letter or underscore, and contain only letters, numbers, or underscores')
      return
    }
    if (parameters.some((p) => p.name === draft.name.trim())) {
      setDraftError('A parameter with this name already exists')
      return
    }
    onChange([...parameters, { ...draft, name: draft.name.trim() }])
    setDraft(emptyParam())
    setAdding(false)
    setDraftError(null)
  }

  const handleDelete = (name: string) => {
    onChange(parameters.filter((p) => p.name !== name))
  }

  const handleCancel = () => {
    setAdding(false)
    setDraft(emptyParam())
    setDraftError(null)
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-surface-600 uppercase tracking-wider">Pipeline Parameters</p>
          <p className="text-xs text-surface-400 mt-0.5">
            Use <code className="font-mono bg-surface-100 px-1 py-0.5 rounded text-dblue-600">{'{{param_name}}'}</code> in transform configs
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-dblue-600 hover:bg-dblue-50 rounded transition-colors"
          >
            <Plus size={12} /> Add
          </button>
        )}
      </div>

      {/* Existing parameters */}
      {parameters.length === 0 && !adding && (
        <div className="text-center py-6">
          <p className="text-xs text-surface-400">No parameters defined.</p>
          <p className="text-xs text-surface-400 mt-1">
            Add parameters to make this pipeline reusable with different values.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {parameters.map((param) => (
          <div
            key={param.name}
            className="bg-surface-50 border border-surface-200 rounded-lg px-3 py-2.5 group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono font-semibold text-dblue-600">{param.name}</code>
                  <span className="text-xs text-surface-400 bg-surface-200 px-1.5 py-0.5 rounded">{param.type}</span>
                </div>
                {param.description && (
                  <p className="text-xs text-surface-500 mt-0.5 truncate">{param.description}</p>
                )}
                {param.default_value && (
                  <p className="text-xs text-surface-400 mt-0.5">
                    Default: <code className="font-mono text-surface-600">{param.default_value}</code>
                  </p>
                )}
              </div>
              <button
                onClick={() => handleDelete(param.name)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-surface-400 hover:text-red-500 transition-all shrink-0"
                title="Delete parameter"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add form */}
      {adding && (
        <div className="bg-dblue-50 border border-dblue-200 rounded-lg p-3 space-y-3">
          <p className="text-xs font-semibold text-dblue-700">New Parameter</p>

          {draftError && (
            <p className="text-xs text-red-600">{draftError}</p>
          )}

          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1">Name <span className="text-red-500">*</span></label>
            <input
              autoFocus
              type="text"
              value={draft.name}
              onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setDraftError(null) }}
              placeholder="e.g. start_date"
              className="w-full px-2.5 py-1.5 text-xs border border-surface-300 rounded focus:outline-none focus:ring-1 focus:ring-dblue-400 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1">Type</label>
            <select
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as PipelineParameter['type'] })}
              className="w-full px-2.5 py-1.5 text-xs border border-surface-300 rounded focus:outline-none focus:ring-1 focus:ring-dblue-400"
            >
              {PARAM_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1">Default Value</label>
            <input
              type="text"
              value={draft.default_value}
              onChange={(e) => setDraft({ ...draft, default_value: e.target.value })}
              placeholder="Optional default"
              className="w-full px-2.5 py-1.5 text-xs border border-surface-300 rounded focus:outline-none focus:ring-1 focus:ring-dblue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1">Description</label>
            <input
              type="text"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="What does this parameter do?"
              className="w-full px-2.5 py-1.5 text-xs border border-surface-300 rounded focus:outline-none focus:ring-1 focus:ring-dblue-400"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-surface-500 hover:text-surface-700 transition-colors"
            >
              <X size={11} /> Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!draft.name.trim()}
              className="px-3 py-1.5 text-xs font-semibold bg-dblue-500 text-white rounded hover:bg-dblue-600 disabled:opacity-50 transition-colors"
            >
              Add Parameter
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
