import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save, Loader2, Tag } from 'lucide-react'
import { IconAdd, IconCheck, IconClose, IconDelete, IconSearch } from './icons'
import clsx from 'clsx'
import type { TransformStep, CustomTransformTemplate } from '../types'
import {
  fetchCustomTransforms,
  createCustomTransform,
  deleteCustomTransform,
  recordCustomTransformUse,
} from '../api/client'

interface Props {
  step: TransformStep
  columns: string[]
  onSave: (sql: string, label?: string) => void
  onClose: () => void
}

// ── Save-as-template modal ────────────────────────────────────────────────────

function SaveTemplateModal({
  sql,
  onSave,
  onClose,
}: {
  sql: string
  onSave: (name: string, description: string, tags: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave(name.trim(), description.trim(), tags.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Save as Template</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <IconClose size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Name *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Filter active users"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this transform do?"
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Tags</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. filter, users, active (comma-separated)"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* SQL preview */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">SQL being saved</label>
            <pre className="text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 max-h-24 overflow-auto text-gray-600 whitespace-pre-wrap">
              {sql || '(empty)'}
            </pre>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
            >
              <Save size={13} /> Save Template
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Template library panel ────────────────────────────────────────────────────

function TemplateLibrary({
  onLoad,
}: {
  onLoad: (tpl: CustomTransformTemplate) => void
}) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['custom-transforms', search],
    queryFn: () => fetchCustomTransforms(search || undefined),
    staleTime: 30_000,
  })

  const deleteMut = useMutation({
    mutationFn: deleteCustomTransform,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-transforms'] })
      setDeleteConfirmId(null)
    },
  })

  const handleLoad = async (tpl: CustomTransformTemplate) => {
    // Increment use count in background
    recordCustomTransformUse(tpl.id).catch(() => {})
    qc.invalidateQueries({ queryKey: ['custom-transforms'] })
    onLoad(tpl)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
        <h3 className="font-semibold text-sm text-gray-800 mb-2">Template Library</h3>
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
          <IconSearch size={13} className="text-gray-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="flex-1 bg-transparent text-xs text-gray-700 placeholder-gray-400 outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
              <IconClose size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading && (
          <div className="flex items-center justify-center py-8 text-gray-400 text-xs gap-2">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        )}
        {!isLoading && templates.length === 0 && (
          <div className="text-center py-10 text-xs text-gray-400">
            {search ? 'No templates match your search' : 'No saved templates yet'}
            <p className="mt-1 text-gray-300">Write SQL and click "Save as Template"</p>
          </div>
        )}
        {templates.map((tpl) => (
          <div
            key={tpl.id}
            className="group border border-gray-200 rounded-lg bg-white hover:border-blue-200 hover:shadow-sm transition-all"
          >
            <div className="p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="font-medium text-xs text-gray-800 leading-tight">{tpl.name}</span>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {deleteConfirmId === tpl.id ? (
                    <>
                      <button
                        onClick={() => deleteMut.mutate(tpl.id)}
                        className="p-1 rounded text-red-500 hover:bg-red-50 text-xs"
                        title="Confirm delete"
                      >
                        <IconCheck size={12} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="p-1 rounded text-gray-400 hover:bg-gray-100"
                      >
                        <IconClose size={12} />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(tpl.id)}
                      className="p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                    >
                      <IconDelete size={12} />
                    </button>
                  )}
                </div>
              </div>
              {tpl.description && (
                <p className="text-xs text-gray-500 mb-2 leading-relaxed">{tpl.description}</p>
              )}
              {tpl.tags && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {tpl.tags.split(',').map((tag) => tag.trim()).filter(Boolean).map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[10px] font-medium"
                    >
                      <Tag size={8} /> {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">{tpl.use_count} uses</span>
                <button
                  onClick={() => handleLoad(tpl)}
                  className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
                >
                  Load
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main CustomSqlEditor ──────────────────────────────────────────────────────

export default function CustomSqlEditor({ step, columns, onSave, onClose }: Props) {
  const qc = useQueryClient()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [sql, setSql] = useState<string>(
    typeof step.config.sql === 'string' ? step.config.sql : 'SELECT *\nFROM {input}'
  )
  const [label, setLabel] = useState<string>(step.label ?? '')
  const [showSaveModal, setShowSaveModal] = useState(false)

  // Focus editor on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const saveMut = useMutation({
    mutationFn: createCustomTransform,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-transforms'] })
      setShowSaveModal(false)
    },
  })

  const handleApply = () => {
    onSave(sql.trim(), label.trim() || undefined)
  }

  const handleSaveTemplate = (name: string, description: string, tags: string) => {
    saveMut.mutate({ name, description, sql_template: sql, tags })
  }

  const handleLoadTemplate = (tpl: CustomTransformTemplate) => {
    setSql(tpl.sql_template)
    // Optionally set label to template name if step label is still default
    if (!label || label === 'Custom SQL') {
      setLabel(tpl.name)
    }
    textareaRef.current?.focus()
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-gray-200 bg-white shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <div className="h-5 w-px bg-gray-200" />

        <div className="flex items-center gap-2">
          <span className="text-xl">✏️</span>
          <span className="font-semibold text-gray-800">Custom SQL</span>
        </div>

        <div className="h-5 w-px bg-gray-200" />

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 shrink-0">Step label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Custom SQL"
            className="px-2.5 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 w-48"
          />
        </div>

        <div className="flex-1" />

        <button
          onClick={() => setShowSaveModal(true)}
          disabled={!sql.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <IconAdd size={14} /> Save as Template
        </button>

        <button
          onClick={onClose}
          className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-800 transition-colors"
        >
          Cancel
        </button>

        <button
          onClick={handleApply}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          <IconCheck size={14} /> Apply
        </button>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* SQL Editor — left 65% */}
        <div className="flex flex-col flex-1 overflow-hidden border-r border-gray-200">
          {/* Toolbar strip */}
          <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 shrink-0">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">SQL Editor</span>
            <div className="h-4 w-px bg-gray-300" />
            <span className="text-xs text-gray-400">
              Use <code className="bg-gray-100 px-1 rounded font-mono text-gray-600">{'{input}'}</code> to reference the previous step
            </span>
            {columns.length > 0 && (
              <>
                <div className="h-4 w-px bg-gray-300" />
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-gray-400">Columns:</span>
                  {columns.slice(0, 8).map((col) => (
                    <button
                      key={col}
                      onClick={() => {
                        const ta = textareaRef.current
                        if (!ta) return
                        const start = ta.selectionStart
                        const end = ta.selectionEnd
                        const newSql = sql.slice(0, start) + col + sql.slice(end)
                        setSql(newSql)
                        setTimeout(() => {
                          ta.selectionStart = ta.selectionEnd = start + col.length
                          ta.focus()
                        }, 0)
                      }}
                      className="font-mono text-[10px] px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-600 hover:border-blue-300 hover:text-blue-700 transition-colors"
                    >
                      {col}
                    </button>
                  ))}
                  {columns.length > 8 && (
                    <span className="text-xs text-gray-400">+{columns.length - 8} more</span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Textarea */}
          <div className="flex-1 overflow-hidden flex">
            <textarea
              ref={textareaRef}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              spellCheck={false}
              placeholder={'SELECT *\nFROM {input}\nWHERE 1=1'}
              className="flex-1 p-4 font-mono text-sm text-gray-800 bg-white resize-none outline-none leading-relaxed"
              style={{ tabSize: 2 }}
              onKeyDown={(e) => {
                // Tab inserts spaces instead of moving focus
                if (e.key === 'Tab') {
                  e.preventDefault()
                  const ta = e.currentTarget
                  const start = ta.selectionStart
                  const end = ta.selectionEnd
                  const newSql = sql.slice(0, start) + '  ' + sql.slice(end)
                  setSql(newSql)
                  setTimeout(() => {
                    ta.selectionStart = ta.selectionEnd = start + 2
                  }, 0)
                }
              }}
            />
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 shrink-0 text-xs text-gray-400 flex items-center gap-4">
            <span>Tab = 2 spaces</span>
            <span>{sql.split('\n').length} lines</span>
          </div>
        </div>

        {/* Template Library — right 35% */}
        <div className="w-80 shrink-0 flex flex-col overflow-hidden">
          <TemplateLibrary onLoad={handleLoadTemplate} />
        </div>
      </div>

      {/* Save template modal */}
      {showSaveModal && (
        <SaveTemplateModal
          sql={sql}
          onSave={handleSaveTemplate}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </div>
  )
}
