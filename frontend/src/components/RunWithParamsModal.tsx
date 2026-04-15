import { useState } from 'react'
import { X, Play, Zap } from 'lucide-react'
import type { PipelineParameter } from '../types'

interface RunWithParamsModalProps {
  parameters: PipelineParameter[]
  mode: 'preview' | 'execute'
  onRun: (paramValues: Record<string, string>) => void
  onCancel: () => void
}

export default function RunWithParamsModal({ parameters, mode, onRun, onCancel }: RunWithParamsModalProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const p of parameters) {
      init[p.name] = p.default_value ?? ''
    }
    return init
  })

  const handleRun = () => {
    onRun(values)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-[420px] mx-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-navy-950 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {mode === 'preview' ? <Play size={14} className="text-emerald-400" /> : <Zap size={14} className="text-dblue-400" />}
            <span className="text-sm font-semibold text-white capitalize">
              {mode === 'preview' ? 'Preview' : 'Execute'} with Parameters
            </span>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-white transition-colors">
            <X size={15} />
          </button>
        </div>
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-surface-500">
            Set values for each pipeline parameter. Leave blank to use the default value.
          </p>
          {parameters.map((param) => (
            <div key={param.name}>
              <div className="flex items-center gap-2 mb-1">
                <label className="text-xs font-semibold text-surface-700 font-mono">{param.name}</label>
                <span className="text-xs text-surface-400 bg-surface-100 px-1.5 py-0.5 rounded">{param.type}</span>
              </div>
              {param.description && (
                <p className="text-xs text-surface-400 mb-1.5">{param.description}</p>
              )}

              {/* Boolean toggle */}
              {param.type === 'boolean' && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setValues(v => ({ ...v, [param.name]: values[param.name] === 'true' ? 'false' : 'true' }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${values[param.name] === 'true' ? 'bg-dblue-500' : 'bg-gray-200'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${values[param.name] === 'true' ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <span className="text-sm text-gray-700">{values[param.name] === 'true' ? 'true' : 'false'}</span>
                </div>
              )}

              {/* Single dropdown */}
              {param.type === 'select' && (
                <select
                  value={values[param.name] ?? ''}
                  onChange={(e) => setValues(v => ({ ...v, [param.name]: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-dblue-400"
                >
                  <option value="">— select —</option>
                  {(param.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              )}

              {/* Multi-select checkboxes */}
              {param.type === 'multi_select' && (
                <div className="space-y-1.5 border border-gray-200 rounded-lg p-2.5">
                  {(param.options ?? []).map(o => {
                    const selected = (values[param.name] ?? '').split(',').map(s => s.trim()).filter(Boolean)
                    const checked = selected.includes(o)
                    return (
                      <label key={o} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked ? selected.filter(s => s !== o) : [...selected, o]
                            setValues(v => ({ ...v, [param.name]: next.join(', ') }))
                          }}
                          className="rounded border-gray-300 text-dblue-500"
                        />
                        <span className="text-sm text-gray-700">{o}</span>
                      </label>
                    )
                  })}
                </div>
              )}

              {/* Date picker */}
              {param.type === 'date' && (
                <input
                  type="date"
                  value={values[param.name] ?? ''}
                  onChange={(e) => setValues(v => ({ ...v, [param.name]: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-dblue-400"
                />
              )}

              {/* Number */}
              {param.type === 'number' && (
                <input
                  type="number"
                  value={values[param.name] ?? ''}
                  onChange={(e) => setValues(v => ({ ...v, [param.name]: e.target.value }))}
                  placeholder={param.default_value || `Enter ${param.name}…`}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-dblue-400 font-mono"
                />
              )}

              {/* Default: free text */}
              {param.type === 'string' && (
                <input
                  type="text"
                  value={values[param.name] ?? ''}
                  onChange={(e) => setValues(v => ({ ...v, [param.name]: e.target.value }))}
                  placeholder={param.default_value || `Enter ${param.name}…`}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-dblue-400 font-mono"
                />
              )}

              {param.default_value && param.type !== 'boolean' && (
                <p className="text-xs text-surface-400 mt-1">
                  Default: <code className="font-mono">{param.default_value}</code>
                </p>
              )}
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleRun}
            className={
              mode === 'preview'
                ? 'flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors'
                : 'flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-dblue-500 text-white rounded-lg hover:bg-dblue-600 transition-colors'
            }
          >
            {mode === 'preview' ? <Play size={12} /> : <Zap size={12} />}
            {mode === 'preview' ? 'Preview' : 'Execute'}
          </button>
        </div>
      </div>
    </div>
  )
}
