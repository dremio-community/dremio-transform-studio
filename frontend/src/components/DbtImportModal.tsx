import React, { useState, useRef } from 'react'
import { Upload, Package, Loader2 } from 'lucide-react'
import { IconCaretDown, IconCaretRight, IconCheckCircle, IconClose, IconWarning } from './icons'
import { previewDbtImport, confirmDbtImport } from '../api/client'

interface DbtModelPreview {
  model_name: string
  display_name: string
  description: string | null
  source_table: string
  output_mode: string
  incremental_strategy: string | null
  unique_key: string | null
  refs: string[]
  sources_used: [string, string][]
  tests: object[]
  warnings: string[]
}

interface PreviewResult {
  models: DbtModelPreview[]
  global_warnings: string[]
  error: string | null
}

interface Props {
  onClose: () => void
  onImported: () => void
}

const MODE_LABELS: Record<string, { label: string; color: string }> = {
  ctas:        { label: 'TABLE',       color: '#3b82f6' },
  incremental: { label: 'INCREMENTAL', color: '#f59e0b' },
  view:        { label: 'VIEW',        color: '#10b981' },
  preview:     { label: 'EPHEMERAL',   color: '#6b7280' },
}

export default function DbtImportModal({ onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload')
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [namePrefix, setNamePrefix] = useState('')
  const [expandedWarnings, setExpandedWarnings] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<{ created: number; skipped: string[]; errors: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [parsing, setParsing] = useState(false)

  async function handleFile(file: File) {
    if (!file.name.endsWith('.zip')) {
      setError('Please upload a .zip file containing a dbt project.')
      return
    }
    setSelectedFile(file)
    setError(null)
    setParsing(true)
    try {
      const result = await previewDbtImport(file)
      if (result.error) {
        setError(result.error)
        setParsing(false)
        return
      }
      setPreview(result)
      setStep('preview')
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to parse ZIP.')
    }
    setParsing(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  async function handleConfirm() {
    if (!preview) return
    setStep('importing')
    try {
      const res = await confirmDbtImport(preview.models, namePrefix || undefined)
      setResult({
        created: res.created.length,
        skipped: res.skipped || [],
        errors: res.errors || [],
      })
      setStep('done')
      onImported()
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Import failed.')
      setStep('preview')
    }
  }

  function toggleWarnings(model_name: string) {
    setExpandedWarnings(prev => {
      const next = new Set(prev)
      if (next.has(model_name)) next.delete(model_name)
      else next.add(model_name)
      return next
    })
  }

  const totalWarnings = preview?.models.reduce((n, m) => n + m.warnings.length, 0) ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-navy-800 border border-white/15 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Package size={18} className="text-primary" />
            <h2 className="text-white font-semibold text-base">Import from dbt</h2>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
            <IconClose size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* ── Upload step ── */}
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-white/70 text-sm">
                Upload a dbt project ZIP. Transform Studio will parse the models and create
                equivalent pipelines — one per <code className="bg-navy-700 px-1 rounded text-xs">.sql</code> file
                in the <code className="bg-navy-700 px-1 rounded text-xs">models/</code> folder.
              </p>

              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors"
                style={{ borderColor: dragOver ? '#60a5fa' : '#374151', background: dragOver ? 'rgba(96,165,250,0.05)' : undefined }}
              >
                {parsing ? (
                  <div className="flex flex-col items-center gap-2 text-white/60">
                    <Loader2 size={28} className="animate-spin" />
                    <span className="text-sm">Parsing dbt project…</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-white/60">
                    <Upload size={28} />
                    <span className="text-sm font-medium text-white/70">Drop your dbt project ZIP here</span>
                    <span className="text-xs">or click to browse</span>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
              />

              {error && (
                <div className="bg-red-900/30 border border-red-700 rounded p-3 text-red-300 text-sm flex items-center gap-2">
                  <IconWarning size={14} /> {error}
                </div>
              )}
            </div>
          )}

          {/* ── Preview step ── */}
          {step === 'preview' && preview && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center gap-4 text-sm">
                <span className="text-white/70">
                  <span className="text-white font-semibold">{preview.models.length}</span> model{preview.models.length !== 1 ? 's' : ''} found
                  {selectedFile && <span className="text-white/40 ml-1">in {selectedFile.name}</span>}
                </span>
                {totalWarnings > 0 && (
                  <span className="text-amber-400 flex items-center gap-1">
                    <IconWarning size={13} /> {totalWarnings} warning{totalWarnings !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Global warnings */}
              {preview.global_warnings.length > 0 && (
                <div className="bg-amber-900/20 border border-amber-700/40 rounded p-3 space-y-1">
                  {preview.global_warnings.map((w, i) => (
                    <p key={i} className="text-amber-300 text-xs flex items-center gap-1">
                      <IconWarning size={11} /> {w}
                    </p>
                  ))}
                </div>
              )}

              {/* Name prefix */}
              <div className="flex items-center gap-3">
                <label className="text-white/60 text-xs whitespace-nowrap">Name prefix (optional):</label>
                <input
                  type="text"
                  value={namePrefix}
                  onChange={e => setNamePrefix(e.target.value)}
                  placeholder="e.g. dbt_"
                  className="flex-1 bg-navy-700 border border-white/15 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-primary"
                />
              </div>

              {/* Model table */}
              <div className="border border-white/10 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white/5 text-white/60 text-left">
                      <th className="px-3 py-2 font-medium">Model</th>
                      <th className="px-3 py-2 font-medium">Source Table</th>
                      <th className="px-3 py-2 font-medium">Mode</th>
                      <th className="px-3 py-2 font-medium">Deps</th>
                      <th className="px-3 py-2 font-medium">Tests</th>
                      <th className="px-3 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.models.map((m, i) => {
                      const modeInfo = MODE_LABELS[m.output_mode] ?? { label: m.output_mode.toUpperCase(), color: '#6b7280' }
                      const hasWarns = m.warnings.length > 0
                      const expanded = expandedWarnings.has(m.model_name)
                      return (
                        <React.Fragment key={m.model_name}>
                          <tr className={i % 2 === 0 ? 'bg-navy-800' : 'bg-white/5'}>
                            <td className="px-3 py-2 text-white font-medium">
                              {namePrefix}{m.display_name}
                              {m.description && (
                                <p className="text-white/60 font-normal truncate max-w-[180px]">{m.description}</p>
                              )}
                            </td>
                            <td className="px-3 py-2 text-white/70 font-mono truncate max-w-[160px]">
                              {m.source_table.replace(/_dbt_ref__/, '→ ')}
                            </td>
                            <td className="px-3 py-2">
                              <span className="px-1.5 py-0.5 rounded text-white font-semibold"
                                style={{ background: modeInfo.color, fontSize: 10 }}>
                                {modeInfo.label}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-white/60">
                              {m.refs.length > 0 ? m.refs.join(', ') : '—'}
                            </td>
                            <td className="px-3 py-2 text-white/60">
                              {m.tests.length > 0 ? <span className="text-primary">{m.tests.length}</span> : '—'}
                            </td>
                            <td className="px-3 py-2">
                              {hasWarns && (
                                <button
                                  onClick={() => toggleWarnings(m.model_name)}
                                  className="flex items-center gap-1 text-amber-400 hover:text-amber-300"
                                >
                                  <IconWarning size={11} />
                                  {expanded ? <IconCaretDown size={11} /> : <IconCaretRight size={11} />}
                                </button>
                              )}
                            </td>
                          </tr>
                          {expanded && hasWarns && (
                            <tr className={i % 2 === 0 ? 'bg-navy-800' : 'bg-white/5'}>
                              <td colSpan={6} className="px-4 pb-2">
                                {m.warnings.map((w, j) => (
                                  <p key={j} className="text-amber-300 text-xs flex items-center gap-1 py-0.5">
                                    <IconWarning size={10} /> {w}
                                  </p>
                                ))}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {error && (
                <div className="bg-red-900/30 border border-red-700 rounded p-3 text-red-300 text-sm flex items-center gap-2">
                  <IconWarning size={14} /> {error}
                </div>
              )}

              <p className="text-white/40 text-xs">
                Each model becomes a pipeline with one Custom SQL step.
                Source tables and refs are wired up automatically.
                You can edit any pipeline after import.
              </p>
            </div>
          )}

          {/* ── Importing step ── */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-white/60">
              <Loader2 size={32} className="animate-spin text-primary" />
              <p className="text-sm">Creating pipelines…</p>
            </div>
          )}

          {/* ── Done step ── */}
          {step === 'done' && result && (
            <div className="space-y-4">
              <div className="flex flex-col items-center py-8 gap-3">
                <IconCheckCircle size={40} className="text-green-400" />
                <p className="text-white font-semibold text-lg">Import complete</p>
                <p className="text-white/70 text-sm">
                  {result.created} pipeline{result.created !== 1 ? 's' : ''} created successfully
                </p>
              </div>

              {result.errors.length > 0 && (
                <div className="bg-amber-900/20 border border-amber-700/40 rounded p-3 space-y-1">
                  <p className="text-amber-300 text-xs font-semibold mb-1">
                    {result.skipped.length} model{result.skipped.length !== 1 ? 's' : ''} skipped:
                  </p>
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-amber-300 text-xs flex items-center gap-1">
                      <IconWarning size={10} /> {e}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
          {step === 'upload' && (
            <>
              <p className="text-white/40 text-xs">Supports any standard dbt project ZIP</p>
              <button onClick={onClose} className="px-4 py-2 text-sm text-white/70 hover:text-white transition-colors">
                Cancel
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button
                onClick={() => { setStep('upload'); setPreview(null); setError(null) }}
                className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
              >
                ← Back
              </button>
              <div className="flex items-center gap-3">
                <button onClick={onClose} className="px-4 py-2 text-sm text-white/70 hover:text-white transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={(preview?.models.length ?? 0) === 0}
                  className="px-5 py-2 bg-primary hover:bg-sidebar-primary text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Import {preview?.models.length ?? 0} Pipeline{(preview?.models.length ?? 0) !== 1 ? 's' : ''}
                </button>
              </div>
            </>
          )}
          {step === 'done' && (
            <div className="flex justify-end w-full">
              <button
                onClick={onClose}
                className="px-5 py-2 bg-primary hover:bg-sidebar-primary text-white text-sm font-medium rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
