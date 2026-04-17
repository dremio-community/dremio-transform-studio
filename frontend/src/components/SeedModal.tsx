import React, { useState, useRef } from 'react'
import { Upload, Loader2, Sprout } from 'lucide-react'
import { IconCheckCircle, IconClose, IconErrorCircle } from './icons'
import type { SeedResult } from '../types'
import { seedTable } from '../api/client'

interface SeedModalProps {
  onClose: () => void
}

export default function SeedModal({ onClose }: SeedModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [tableName, setTableName] = useState('')
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SeedResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    setFile(f)
    setResult(null)
    setError(null)
    // Auto-fill table name from filename (strip extension, sanitise)
    if (!tableName) {
      const base = f.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
      setTableName(base)
    }
    // Parse preview (first 5 rows)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) return
      const parseRow = (line: string) => {
        // Simple CSV parse (handles quoted fields)
        const result: string[] = []
        let cur = ''
        let inQuote = false
        for (const ch of line) {
          if (ch === '"') { inQuote = !inQuote }
          else if (ch === ',' && !inQuote) { result.push(cur); cur = '' }
          else { cur += ch }
        }
        result.push(cur)
        return result
      }
      const headers = parseRow(lines[0])
      const rows = lines.slice(1, 6).map(parseRow)
      setPreview({ headers, rows })
    }
    reader.readAsText(f)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f && f.name.endsWith('.csv')) handleFile(f)
  }

  const handleRun = async () => {
    if (!file || !tableName.trim()) return
    setRunning(true)
    setError(null)
    try {
      const res = await seedTable(tableName.trim(), file)
      setResult(res)
    } catch (e) {
      setError((e as Error).message ?? 'Seed failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-navy-900 border border-navy-700 rounded-xl shadow-2xl w-[580px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800">
          <div className="flex items-center gap-2">
            <Sprout size={16} className="text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">Seed Table from CSV</h2>
          </div>
          <button onClick={onClose} className="text-surface-400 hover:text-white"><IconClose size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-navy-700 hover:border-dblue-400 rounded-lg p-6 text-center cursor-pointer transition-colors"
          >
            <Upload size={22} className="mx-auto mb-2 text-surface-400" />
            {file ? (
              <p className="text-sm text-white">{file.name} <span className="text-surface-400">({(file.size / 1024).toFixed(1)} KB)</span></p>
            ) : (
              <>
                <p className="text-sm text-surface-300">Drop a CSV file here, or click to browse</p>
                <p className="text-xs text-surface-500 mt-1">Max 5,000 rows · UTF-8 or Latin-1</p>
              </>
            )}
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>

          {/* Table name */}
          <div>
            <label className="block text-xs text-surface-300 mb-1">Output table name</label>
            <input
              value={tableName}
              onChange={e => setTableName(e.target.value)}
              placeholder="my_space.seed_table"
              className="w-full bg-navy-800 border border-navy-700 rounded px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-dblue-400"
            />
            <p className="text-xs text-surface-500 mt-1">Use namespace.tablename format. Table will be created or replaced.</p>
          </div>

          {/* Preview */}
          {preview && (
            <div>
              <p className="text-xs text-surface-400 mb-2">Preview (first 5 rows)</p>
              <div className="overflow-x-auto rounded border border-navy-700">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-navy-800">
                      {preview.headers.map(h => (
                        <th key={h} className="px-3 py-2 text-left text-surface-300 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, i) => (
                      <tr key={i} className="border-t border-navy-800">
                        {row.map((cell, j) => (
                          <td key={j} className="px-3 py-1.5 text-surface-200 whitespace-nowrap max-w-[120px] truncate">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={`p-4 rounded-lg border ${result.success ? 'border-emerald-800 bg-emerald-900/20' : 'border-red-800 bg-red-900/20'}`}>
              <div className="flex items-center gap-2 mb-1">
                {result.success
                  ? <IconCheckCircle size={16} className="text-emerald-400" />
                  : <IconErrorCircle size={16} className="text-red-400" />}
                <span className="text-sm font-semibold text-white">
                  {result.success ? `${result.rows_inserted.toLocaleString()} rows seeded into ${result.table_name}` : 'Seed failed'}
                </span>
              </div>
              {result.error && <p className="text-xs text-red-400 font-mono mt-1">{result.error}</p>}
            </div>
          )}

          {error && (
            <div className="p-3 rounded border border-red-800 bg-red-900/20 text-xs text-red-300">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-navy-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-surface-300 hover:text-white rounded border border-navy-700 hover:border-navy-600 transition-colors"
          >
            {result?.success ? 'Done' : 'Cancel'}
          </button>
          {!result?.success && (
            <button
              onClick={handleRun}
              disabled={!file || !tableName.trim() || running}
              className="px-4 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-50 flex items-center gap-1.5 transition-colors"
            >
              {running && <Loader2 size={12} className="animate-spin" />}
              {running ? 'Seeding…' : 'Seed Table'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
