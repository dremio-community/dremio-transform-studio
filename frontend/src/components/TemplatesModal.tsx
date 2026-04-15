import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { X, Loader2, ChevronRight, ArrowLeft } from 'lucide-react'
import clsx from 'clsx'
import { fetchTemplates, deployTemplate } from '../api/client'
import type { PipelineTemplate } from '../api/client'
import type { Pipeline } from '../types'

interface Props {
  onClose: () => void
  onDeployed: (pipeline: Pipeline) => void
}

const CATEGORY_ORDER = ['Analytics', 'Marketing', 'Product', 'Operations']

export default function TemplatesModal({ onClose, onDeployed }: Props) {
  const [selectedTemplate, setSelectedTemplate] = useState<PipelineTemplate | null>(null)
  const [sourceTable, setSourceTable] = useState('')
  const [outputTable, setOutputTable] = useState('')
  const [filterCategory, setFilterCategory] = useState<string | null>(null)

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: fetchTemplates,
  })

  const deployMut = useMutation({
    mutationFn: () => deployTemplate(selectedTemplate!.id, sourceTable.trim(), outputTable.trim() || undefined),
    onSuccess: (pipeline) => onDeployed(pipeline),
  })

  const categories = CATEGORY_ORDER.filter(c => templates.some(t => t.category === c))
  const filtered = filterCategory ? templates.filter(t => t.category === filterCategory) : templates

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-xl shadow-2xl w-[780px] max-h-[85vh] mx-4 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-navy-950 shrink-0">
          <div className="flex items-center gap-2.5">
            {selectedTemplate && (
              <button
                onClick={() => { setSelectedTemplate(null); setSourceTable(''); setOutputTable('') }}
                className="text-gray-400 hover:text-white transition-colors mr-1"
              >
                <ArrowLeft size={15} />
              </button>
            )}
            <span className="text-xl">{selectedTemplate ? selectedTemplate.icon : '📐'}</span>
            <div>
              <p className="font-semibold text-white text-sm">
                {selectedTemplate ? selectedTemplate.name : 'Pipeline Templates'}
              </p>
              {!selectedTemplate && (
                <p className="text-xs text-surface-400">{templates.length} pre-built templates — one click to deploy</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-surface-400 gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading templates…
          </div>

        ) : selectedTemplate ? (
          /* ── Deploy view ── */
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            <p className="text-sm text-gray-600">{selectedTemplate.description}</p>

            {/* Steps preview */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Steps included</p>
              <div className="space-y-1.5">
                {selectedTemplate.steps.map((s, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-dblue-500/10 text-dblue-600 text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                    <div>
                      <span className="font-medium">{s.label ?? s.transform_type}</span>
                      {s.notes && <p className="text-xs text-amber-600 mt-0.5">{s.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Source table input */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Source table <span className="text-red-500">*</span>
              </label>
              <input
                autoFocus
                type="text"
                value={sourceTable}
                onChange={(e) => setSourceTable(e.target.value)}
                placeholder={selectedTemplate.source_hint}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-dblue-400 font-mono"
              />
              <p className="text-xs text-gray-400 mt-1">Fully qualified: <code className="font-mono">namespace.table_name</code></p>
            </div>

            {/* Output table input */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Output table <span className="text-gray-400 font-normal">(optional — can set later)</span>
              </label>
              <input
                type="text"
                value={outputTable}
                onChange={(e) => setOutputTable(e.target.value)}
                placeholder="e.g. my_space.daily_sales_summary"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-dblue-400 font-mono"
              />
            </div>

            {deployMut.isError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
                {(deployMut.error as Error).message}
              </div>
            )}
          </div>

        ) : (
          /* ── Gallery view ── */
          <div className="flex flex-1 overflow-hidden">
            {/* Category sidebar */}
            <div className="w-36 border-r border-gray-100 p-3 space-y-1 shrink-0">
              <button
                onClick={() => setFilterCategory(null)}
                className={clsx(
                  'w-full text-left px-2.5 py-1.5 rounded text-xs font-medium transition-colors',
                  filterCategory === null ? 'bg-dblue-500 text-white' : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                All ({templates.length})
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={clsx(
                    'w-full text-left px-2.5 py-1.5 rounded text-xs font-medium transition-colors',
                    filterCategory === cat ? 'bg-dblue-500 text-white' : 'text-gray-600 hover:bg-gray-100'
                  )}
                >
                  {cat} ({templates.filter(t => t.category === cat).length})
                </button>
              ))}
            </div>

            {/* Template cards */}
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-3 content-start">
              {filtered.map(tmpl => (
                <button
                  key={tmpl.id}
                  onClick={() => { setSelectedTemplate(tmpl); setSourceTable('') }}
                  className="text-left p-4 border border-gray-200 rounded-xl hover:border-dblue-400 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{tmpl.icon}</span>
                      <div>
                        <p className="font-semibold text-sm text-gray-800">{tmpl.name}</p>
                        <p className="text-xs text-gray-400">{tmpl.steps.length} steps · {tmpl.output_mode}</p>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-gray-300 group-hover:text-dblue-500 transition-colors shrink-0 mt-1" />
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2">{tmpl.description}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {tmpl.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">{tag}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50 shrink-0">
          <button
            onClick={selectedTemplate ? () => { setSelectedTemplate(null); setSourceTable('') } : onClose}
            className="px-4 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            {selectedTemplate ? 'Back' : 'Cancel'}
          </button>
          {selectedTemplate && (
            <button
              onClick={() => deployMut.mutate()}
              disabled={!sourceTable.trim() || deployMut.isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-dblue-500 text-white rounded-lg hover:bg-dblue-600 transition-colors disabled:opacity-50"
            >
              {deployMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <LayoutTemplate size={12} />}
              Deploy Template
            </button>
          )}
        </div>

      </div>
    </div>
  )
}

// Local import for icon used in JSX
import { LayoutTemplate } from 'lucide-react'
