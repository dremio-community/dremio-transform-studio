import { useState } from 'react'
import { IconAdd, IconClose, IconDelete } from './icons'
import type { PipelineParameter } from '../types'

interface ParametersPanelProps {
  parameters: PipelineParameter[]
  onChange: (params: PipelineParameter[]) => void
}

const PARAM_TYPES: { value: PipelineParameter['type']; label: string }[] = [
  { value: 'string',       label: 'Text' },
  { value: 'number',       label: 'Number' },
  { value: 'date',         label: 'Date' },
  { value: 'boolean',      label: 'Boolean (on/off)' },
  { value: 'select',       label: 'Dropdown (single)' },
  { value: 'multi_select', label: 'Multi-select' },
]

const emptyParam = (): PipelineParameter => ({
  name: '',
  type: 'string',
  default_value: '',
  description: '',
  options: undefined,
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
          <p className="text-xs font-semibold text-white/30 uppercase tracking-wider">Pipeline Parameters</p>
          <p className="text-xs text-white/60 mt-0.5">
            Use <code className="font-mono bg-surface-100 px-1 py-0.5 rounded text-dblue-600">{'{{param_name}}'}</code> in transform configs
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-dblue-600 hover:bg-dblue-50 rounded transition-colors"
          >
            <IconAdd size={12} /> Add
          </button>
        )}
      </div>

      {/* Existing parameters */}
      {parameters.length === 0 && !adding && (
        <div className="text-center py-6">
          <p className="text-xs text-white/60">No parameters defined.</p>
          <p className="text-xs text-white/60 mt-1">
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
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-xs font-mono font-semibold text-dblue-600">{param.name}</code>
                  <span className="text-xs text-white/60 bg-surface-200 px-1.5 py-0.5 rounded">
                    {PARAM_TYPES.find(t => t.value === param.type)?.label ?? param.type}
                  </span>
                </div>
                {param.description && (
                  <p className="text-xs text-white/40 mt-0.5 truncate">{param.description}</p>
                )}
                {(param.type === 'select' || param.type === 'multi_select') && param.options && param.options.length > 0 && (
                  <p className="text-xs text-white/60 mt-0.5 truncate">
                    Options: {param.options.join(', ')}
                  </p>
                )}
                {param.default_value && (
                  <p className="text-xs text-white/60 mt-0.5">
                    Default: <code className="font-mono text-white/30">{param.default_value}</code>
                  </p>
                )}
              </div>
              <button
                onClick={() => handleDelete(param.name)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-white/60 hover:text-red-500 transition-all shrink-0"
                title="Delete parameter"
              >
                <IconDelete size={12} />
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
            <label className="block text-xs font-medium text-white/30 mb-1">Name <span className="text-red-500">*</span></label>
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
            <label className="block text-xs font-medium text-white/30 mb-1">Type</label>
            <select
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as PipelineParameter['type'], options: undefined, default_value: '' })}
              className="w-full px-2.5 py-1.5 text-xs border border-surface-300 rounded focus:outline-none focus:ring-1 focus:ring-dblue-400"
            >
              {PARAM_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Options — only for select / multi_select */}
          {(draft.type === 'select' || draft.type === 'multi_select') && (
            <div>
              <label className="block text-xs font-medium text-white/30 mb-1">
                Options <span className="text-red-500">*</span>
                <span className="ml-1 text-white/60 font-normal">(comma-separated)</span>
              </label>
              <input
                type="text"
                value={(draft.options ?? []).join(', ')}
                onChange={(e) => setDraft({ ...draft, options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                placeholder="e.g. daily, weekly, monthly"
                className="w-full px-2.5 py-1.5 text-xs border border-surface-300 rounded focus:outline-none focus:ring-1 focus:ring-dblue-400"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-white/30 mb-1">Default Value</label>
            {draft.type === 'boolean' ? (
              <select
                value={draft.default_value}
                onChange={(e) => setDraft({ ...draft, default_value: e.target.value })}
                className="w-full px-2.5 py-1.5 text-xs border border-surface-300 rounded focus:outline-none focus:ring-1 focus:ring-dblue-400"
              >
                <option value="">No default</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : draft.type === 'select' && (draft.options ?? []).length > 0 ? (
              <select
                value={draft.default_value}
                onChange={(e) => setDraft({ ...draft, default_value: e.target.value })}
                className="w-full px-2.5 py-1.5 text-xs border border-surface-300 rounded focus:outline-none focus:ring-1 focus:ring-dblue-400"
              >
                <option value="">No default</option>
                {(draft.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                type={draft.type === 'number' ? 'number' : draft.type === 'date' ? 'date' : 'text'}
                value={draft.default_value}
                onChange={(e) => setDraft({ ...draft, default_value: e.target.value })}
                placeholder="Optional default"
                className="w-full px-2.5 py-1.5 text-xs border border-surface-300 rounded focus:outline-none focus:ring-1 focus:ring-dblue-400"
              />
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-white/30 mb-1">Description</label>
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
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-white/40 hover:text-surface-700 transition-colors"
            >
              <IconClose size={11} /> Cancel
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
