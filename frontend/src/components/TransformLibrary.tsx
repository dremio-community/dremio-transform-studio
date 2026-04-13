import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import clsx from 'clsx'
import type { TransformType } from '../types'
import { fetchTransforms } from '../api/client'

interface Props {
  onAddTransform: (tt: TransformType) => void
}

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'custom', label: 'Custom' },
  { id: 'clean', label: 'Clean' },
  { id: 'reshape', label: 'Reshape' },
  { id: 'string', label: 'String' },
  { id: 'datetime', label: 'Date & Time' },
  { id: 'enrich', label: 'Enrich' },
  { id: 'aggregate', label: 'Aggregate' },
] as const

const CATEGORY_COLORS: Record<string, string> = {
  clean: 'bg-red-50 text-red-700',
  reshape: 'bg-purple-50 text-purple-700',
  string: 'bg-pink-50 text-pink-700',
  datetime: 'bg-amber-50 text-amber-700',
  enrich: 'bg-emerald-50 text-emerald-700',
  aggregate: 'bg-blue-50 text-blue-700',
  custom: 'bg-indigo-50 text-indigo-700',
}

export default function TransformLibrary({ onAddTransform }: Props) {
  const [activeCategory, setActiveCategory] = useState<string>('all')

  const { data: transforms = [], isLoading } = useQuery({
    queryKey: ['transforms'],
    queryFn: fetchTransforms,
    staleTime: Infinity,
  })

  const filtered =
    activeCategory === 'all'
      ? transforms
      : transforms.filter((t) => t.category === activeCategory)

  return (
    <div className="flex flex-col h-full">
      {/* Category tabs */}
      <div className="px-2 pt-2 pb-1 border-b border-gray-100 shrink-0">
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={clsx(
                'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                activeCategory === cat.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {isLoading && (
          <div className="flex items-center gap-2 justify-center py-8 text-gray-400 text-xs">
            <Loader2 size={14} className="animate-spin" /> Loading transforms…
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-8 text-xs text-gray-400">No transforms in this category</div>
        )}

        {filtered.map((tt) => (
          <button
            key={tt.id}
            onClick={() => onAddTransform(tt)}
            className={clsx(
              'transform-card w-full text-left p-3 rounded-lg border transition-all',
              tt.id === 'custom_sql'
                ? 'border-indigo-200 bg-indigo-50 hover:border-indigo-400 hover:bg-indigo-100 hover:shadow-sm'
                : 'border-gray-100 bg-white hover:border-blue-200 hover:bg-blue-50 hover:shadow-sm'
            )}
          >
            <div className="flex items-start gap-2.5">
              <span className="text-xl leading-none shrink-0 mt-0.5">{tt.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="font-medium text-sm text-gray-800 truncate">{tt.name}</span>
                  <span
                    className={clsx(
                      'shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider',
                      CATEGORY_COLORS[tt.category] ?? 'bg-gray-100 text-gray-600'
                    )}
                  >
                    {tt.category}
                  </span>
                </div>
                <p className="transform-desc text-xs text-gray-500 leading-relaxed">
                  {tt.description}
                </p>
                {tt.id === 'custom_sql' && (
                  <p className="text-[10px] text-indigo-500 font-medium mt-1">
                    Opens SQL editor →
                  </p>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
