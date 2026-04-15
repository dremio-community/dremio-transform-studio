import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trash2, Plus, X, MessageSquare } from 'lucide-react'
import clsx from 'clsx'
import type { TransformStep, TransformParam } from '../types'
import { fetchTransform } from '../api/client'

interface Props {
  step: TransformStep
  columns: string[]
  onUpdate: (updates: Partial<TransformStep>) => void
  onDelete: () => void
  onOpenEditor?: () => void
}

// ── Individual field renderers ─────────────────────────────────────────────

function ColumnSelect({
  param,
  value,
  columns,
  onChange,
}: {
  param: TransformParam
  value: string
  columns: string[]
  onChange: (v: string) => void
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const filtered = columns.filter((c) => c.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-2.5 py-1.5 border border-gray-200 rounded text-sm bg-white hover:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-400 flex items-center justify-between"
      >
        <span className={value ? 'text-gray-800 font-mono text-xs' : 'text-gray-400 text-xs'}>
          {value || (param.placeholder ?? 'Select column…')}
        </span>
        <span className="text-gray-400 text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-48 flex flex-col">
          <div className="p-1.5 border-b border-gray-100 shrink-0">
            <input
              autoFocus
              placeholder="Search columns…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400">No columns match</div>
            )}
            {filtered.map((col) => (
              <button
                key={col}
                type="button"
                onClick={() => { onChange(col); setOpen(false); setSearch('') }}
                className={clsx(
                  'w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-blue-50 transition-colors',
                  col === value ? 'text-blue-700 font-medium bg-blue-50' : 'text-gray-700'
                )}
              >
                {col}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ColumnsMultiSelect({
  param,
  value,
  columns,
  onChange,
}: {
  param: TransformParam
  value: string[]
  columns: string[]
  onChange: (v: string[]) => void
}) {
  const [search, setSearch] = useState('')
  const filtered = columns.filter((c) => c.toLowerCase().includes(search.toLowerCase()))
  const selected = new Set(value)

  const toggle = (col: string) => {
    const next = new Set(selected)
    if (next.has(col)) next.delete(col)
    else next.add(col)
    onChange(Array.from(next))
  }

  return (
    <div className="border border-gray-200 rounded overflow-hidden">
      <div className="p-1.5 border-b border-gray-100 bg-gray-50">
        <input
          placeholder="Search columns…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-xs px-2 py-1 border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
      <div className="max-h-36 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="px-3 py-2 text-xs text-gray-400">No columns</div>
        )}
        {filtered.map((col) => (
          <label
            key={col}
            className="flex items-center gap-2 px-3 py-1.5 hover:bg-blue-50 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.has(col)}
              onChange={() => toggle(col)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
            />
            <span className="text-xs font-mono text-gray-700">{col}</span>
          </label>
        ))}
      </div>
      {value.length > 0 && (
        <div className="px-2 py-1.5 border-t border-gray-100 bg-gray-50 flex flex-wrap gap-1">
          {value.map((col) => (
            <span key={col} className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-mono">
              {col}
              <button onClick={() => toggle(col)} className="hover:text-blue-900">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function MapEditor({
  value,
  onChange,
}: {
  value: Record<string, string>
  onChange: (v: Record<string, string>) => void
}) {
  const entries = Object.entries(value)

  const updateKey = (oldKey: string, newKey: string) => {
    const next: Record<string, string> = {}
    for (const [k, v] of entries) {
      next[k === oldKey ? newKey : k] = v
    }
    onChange(next)
  }

  const updateValue = (key: string, newVal: string) => {
    onChange({ ...value, [key]: newVal })
  }

  const addRow = () => {
    onChange({ ...value, '': '' })
  }

  const removeRow = (key: string) => {
    const next = { ...value }
    delete next[key]
    onChange(next)
  }

  return (
    <div className="space-y-1.5">
      {entries.map(([k, v], i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded font-mono focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="key"
            value={k}
            onChange={(e) => updateKey(k, e.target.value)}
          />
          <span className="text-gray-400 text-xs">→</span>
          <input
            className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded font-mono focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="value"
            value={v}
            onChange={(e) => updateValue(k, e.target.value)}
          />
          <button
            type="button"
            onClick={() => removeRow(k)}
            className="text-gray-400 hover:text-red-500 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
      >
        <Plus size={12} /> Add row
      </button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function TransformConfig({ step, columns, onUpdate, onDelete, onOpenEditor }: Props) {
  const { data: transformType, isLoading } = useQuery({
    queryKey: ['transform', step.transform_type],
    queryFn: () => fetchTransform(step.transform_type),
    staleTime: Infinity,
  })

  const setConfig = (name: string, value: unknown) => {
    onUpdate({ config: { ...step.config, [name]: value } })
  }

  const renderField = (param: TransformParam) => {
    const raw = step.config[param.name]

    switch (param.type) {
      case 'column': {
        return (
          <ColumnSelect
            param={param}
            value={typeof raw === 'string' ? raw : ''}
            columns={columns}
            onChange={(v) => setConfig(param.name, v)}
          />
        )
      }
      case 'columns': {
        return (
          <ColumnsMultiSelect
            param={param}
            value={Array.isArray(raw) ? (raw as string[]) : []}
            columns={columns}
            onChange={(v) => setConfig(param.name, v)}
          />
        )
      }
      case 'text': {
        return (
          <input
            type="text"
            value={typeof raw === 'string' ? raw : typeof param.default === 'string' ? param.default : ''}
            placeholder={param.placeholder ?? ''}
            onChange={(e) => setConfig(param.name, e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        )
      }
      case 'number': {
        return (
          <input
            type="number"
            value={typeof raw === 'number' ? raw : typeof param.default === 'number' ? param.default : 0}
            onChange={(e) => setConfig(param.name, Number(e.target.value))}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        )
      }
      case 'select': {
        const options = param.options ?? []
        const current = typeof raw === 'string' ? raw : (param.default as string | undefined) ?? options[0] ?? ''
        return (
          <select
            value={current}
            onChange={(e) => setConfig(param.name, e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            {options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        )
      }
      case 'map': {
        const mapVal = raw != null && typeof raw === 'object' && !Array.isArray(raw)
          ? (raw as Record<string, string>)
          : {}
        return (
          <MapEditor
            value={mapVal}
            onChange={(v) => setConfig(param.name, v)}
          />
        )
      }
      case 'boolean': {
        const boolVal = typeof raw === 'boolean' ? raw : param.default === true
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={boolVal}
              onChange={(e) => setConfig(param.name, e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
            />
            <span className="text-sm text-gray-700">{param.label}</span>
          </label>
        )
      }
      default:
        return (
          <input
            type="text"
            value={typeof raw === 'string' ? raw : ''}
            placeholder={param.placeholder ?? ''}
            onChange={(e) => setConfig(param.name, e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        )
    }
  }

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-400">Loading…</div>
  }

  if (!transformType) {
    return <div className="p-4 text-sm text-red-500">Transform type not found</div>
  }

  // Custom SQL: show a special panel with an "Open Editor" button
  if (step.transform_type === 'custom_sql') {
    const currentSql = typeof step.config.sql === 'string' ? step.config.sql : ''
    return (
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">✏️</span>
          <div>
            <h3 className="font-semibold text-sm text-gray-800">Custom SQL</h3>
            <p className="text-xs text-gray-500">Write any SQL referencing {'{input}'} as the previous step</p>
          </div>
        </div>

        {/* Step label */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            Step label (optional)
          </label>
          <input
            type="text"
            value={step.label ?? ''}
            placeholder="Custom SQL"
            onChange={(e) => onUpdate({ label: e.target.value || undefined })}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        {/* Step notes */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            <MessageSquare size={11} /> Notes (optional)
          </label>
          <textarea
            value={step.notes ?? ''}
            placeholder="e.g. Removes test accounts — see JIRA-1234"
            rows={2}
            onChange={(e) => onUpdate({ notes: e.target.value || undefined })}
            className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none text-gray-600 placeholder:text-gray-300"
          />
        </div>

        {/* SQL preview */}
        {currentSql ? (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              SQL
            </label>
            <pre className="text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2.5 max-h-32 overflow-auto text-gray-700 whitespace-pre-wrap leading-relaxed">
              {currentSql}
            </pre>
          </div>
        ) : (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
            No SQL written yet. Open the editor to write your query.
          </div>
        )}

        {/* Open editor button */}
        <button
          onClick={onOpenEditor}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
        >
          ✏️ Open SQL Editor
        </button>

        {/* Delete */}
        <div className="pt-2 border-t border-gray-100">
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
          >
            <Trash2 size={13} /> Remove step
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <span className="text-2xl">{transformType.icon}</span>
        <div>
          <h3 className="font-semibold text-sm text-gray-800">{transformType.name}</h3>
          <p className="text-xs text-gray-500">{transformType.description}</p>
        </div>
      </div>

      {/* Step label */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
          Step label (optional)
        </label>
        <input
          type="text"
          value={step.label ?? ''}
          placeholder={transformType.name}
          onChange={(e) => onUpdate({ label: e.target.value || undefined })}
          className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>

      {/* Step notes */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
          <MessageSquare size={11} /> Notes (optional)
        </label>
        <textarea
          value={step.notes ?? ''}
          placeholder="e.g. Removes test accounts — see JIRA-1234"
          rows={2}
          onChange={(e) => onUpdate({ notes: e.target.value || undefined })}
          className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none text-gray-600 placeholder:text-gray-300"
        />
      </div>

      {/* Params */}
      {transformType.params.map((param) => (
        param.type === 'boolean' ? (
          <div key={param.name}>
            {renderField(param)}
          </div>
        ) : (
          <div key={param.name}>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {param.label}
              {!param.required && (
                <span className="ml-1 text-gray-400 font-normal">(optional)</span>
              )}
            </label>
            {renderField(param)}
          </div>
        )
      ))}

      {/* Delete button */}
      <div className="pt-2 border-t border-gray-100">
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
        >
          <Trash2 size={13} /> Remove step
        </button>
      </div>
    </div>
  )
}
