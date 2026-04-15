import { useQuery } from '@tanstack/react-query'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import { ChevronUp, ChevronDown, Trash2, Plus, GripVertical, MessageSquare } from 'lucide-react'
import clsx from 'clsx'
import type { TransformStep } from '../types'
import { fetchTransforms } from '../api/client'

interface Props {
  steps: TransformStep[]
  selectedStepId: string | null
  onStepClick: (id: string) => void
  onStepDelete: (id: string) => void
  onStepMove: (id: string, direction: 'up' | 'down') => void
  onReorder?: (newSteps: TransformStep[]) => void
  onAddStep: () => void
}

function stepSummary(step: TransformStep): string {
  const c = step.config
  const cols = (arr: unknown) =>
    Array.isArray(arr) ? (arr as string[]).join(', ') : ''

  switch (step.transform_type) {
    case 'remove_duplicates':
      return `Deduplicate on: ${cols(c.dedup_columns) || '—'}`
    case 'drop_nulls':
      return `Drop nulls in: ${cols(c.columns) || '—'}`
    case 'fill_null':
      return `Fill ${c.column ?? '—'} using ${c.strategy ?? 'constant'}`
    case 'trim_whitespace':
      return `Trim: ${cols(c.columns) || '—'}`
    case 'standardize_case':
      return `${c.column ?? '—'} → ${c.case ?? 'lower'}`
    case 'cast_type':
      return `${c.column ?? '—'} → ${c.target_type ?? 'VARCHAR'}`
    case 'filter_rows':
      return `${c.column ?? '—'} ${c.operator ?? 'equals'} ${c.value ?? ''}`
    case 'remove_special_chars':
      return `Clean: ${c.column ?? '—'}`
    case 'rename_columns': {
      const renames = c.renames as Record<string, string> | undefined
      if (!renames) return 'No renames configured'
      return Object.entries(renames)
        .slice(0, 2)
        .map(([a, b]) => `${a}→${b}`)
        .join(', ')
    }
    case 'select_columns':
      return `Keep: ${cols(c.columns) || '—'}`
    case 'drop_columns':
      return `Drop: ${cols(c.columns) || '—'}`
    case 'split_column':
      return `Split ${c.column ?? '—'} by "${c.delimiter ?? ''}"`
    case 'combine_columns':
      return `Combine ${cols(c.columns) || '—'} → ${c.output_name ?? '—'}`
    case 'add_column':
      return `${c.name ?? '—'} = ${String(c.expression ?? '').slice(0, 30)}`
    case 'parse_date':
      return `Parse ${c.column ?? '—'} as ${c.output_type ?? 'TIMESTAMP'}`
    case 'extract_date_part':
      return `Extract ${c.part ?? '—'} from ${c.column ?? '—'}`
    case 'truncate_date':
      return `Truncate ${c.column ?? '—'} to ${c.period ?? '—'}`
    case 'date_diff':
      return `Diff ${c.start_column ?? '—'} → ${c.end_column ?? 'today'} in ${c.unit ?? 'day'}s`
    case 'date_add':
      return `${c.operation ?? 'add'} ${c.amount ?? 1} ${c.unit ?? 'day'}(s) to ${c.column ?? '—'}`
    case 'lookup_join':
      return `Join ${c.lookup_table ?? '—'} on ${c.join_key_source ?? '—'}`
    case 'map_values':
      return `Map values in ${c.column ?? '—'}`
    case 'bin_values':
      return `Bin ${c.column ?? '—'} → ${c.output_name ?? '—'}`
    case 'add_row_number':
      return `Row # ordered by ${c.order_by ?? '—'}`
    case 'add_running_total':
      return `Running total of ${c.column ?? '—'}`
    case 'group_aggregate':
      return `Group by: ${cols(c.group_by) || '—'}`
    case 'top_n_per_group':
      return `Top ${c.n ?? 10} per ${c.group_by ?? '—'}`
    case 'dedupe_keep_latest':
      return `Keep latest by ${c.timestamp_column ?? '—'}`
    case 'validate_regex':
      return `${c.mode === 'not_match' ? 'Exclude' : 'Keep'} rows where ${c.column ?? '—'} ${c.mode === 'not_match' ? "doesn't match" : 'matches'} ${c.pattern ?? '—'}`
    case 'clip_values':
      return `Clamp ${c.column ?? '—'} [${c.min_value ?? '∞'}, ${c.max_value ?? '∞'}]`
    case 'replace_string':
      return `In ${c.column ?? '—'}: "${c.find ?? ''}" → "${c.replace ?? ''}"`
    case 'reorder_columns':
      return `Reorder: ${Array.isArray(c.columns) ? c.columns.join(', ') : '—'}`
    case 'unpivot':
      return `Unpivot ${Array.isArray(c.value_columns) ? c.value_columns.length : 0} cols → ${c.key_column_name ?? 'key'} / ${c.value_column_name ?? 'value'}`
    case 'flatten_json':
      return `Extract ${c.fields ?? '—'} from ${c.column ?? '—'}`
    case 'conditional_column':
      return `${c.output_name ?? '—'} = CASE WHEN ${c.condition_column ?? '—'} …`
    case 'lag_lead':
      return `${c.function ?? 'LAG'}(${c.column ?? '—'}, ${c.offset ?? 1}) → ${c.output_name ?? '—'}`
    case 'percent_of_total':
      return `${c.column ?? '—'} as % of ${c.partition_by ? `${c.partition_by} group` : 'total'} → ${c.output_name ?? '—'}`
    case 'rolling_window':
      return `${c.function ?? 'AVG'}(${c.column ?? '—'}) over ${c.window_size ?? 7} rows → ${c.output_name ?? '—'}`
    case 'sample_rows':
      return `Random ${c.n ?? 1000} rows`
    case 'extract_regex':
      return `${c.pattern ?? '—'} from ${c.column ?? '—'} → ${c.output_name ?? '—'}`
    case 'pad_string':
      return `${c.direction === 'right' ? 'RPAD' : 'LPAD'}(${c.column ?? '—'}, ${c.length ?? 10}, '${c.fill_char ?? '0'}')`
    case 'substring':
      return `${c.column ?? '—'}[${c.start ?? 1}:${c.length ?? 10}]`
    case 'string_length':
      return `LENGTH(${c.column ?? '—'}) → ${c.output_name ?? '—'}`
    case 'upper_lower':
      return `${c.case ?? 'lower'}: ${Array.isArray(c.columns) ? c.columns.join(', ') : '—'}`
    case 'concat_literal':
      return `${c.prefix ?? ''}[${c.column ?? '—'}]${c.suffix ?? ''}`
    case 'hash_column':
      return `${c.algorithm ?? 'MD5'}(${c.column ?? '—'}) → ${c.output_name || c.column || '—'}`
    case 'surrogate_key':
      return `MD5(${Array.isArray(c.columns) ? c.columns.join(` ${c.separator ?? '|'} `) : '—'}) → ${c.output_name ?? '—'}`
    case 'join':
      return `${c.join_type ?? 'LEFT'} JOIN ${c.right_table ?? '—'}`
    case 'union':
      return `${c.mode ?? 'UNION ALL'} ${c.union_table ?? '—'}`
    case 'outlier_filter':
      return `${c.action === 'keep_outliers' ? 'Keep' : 'Remove'} outliers in ${c.column ?? '—'} (±${c.threshold ?? 3}σ)`
    case 'unit_conversion':
      return `${c.column ?? '—'}: ${c.from_unit ?? '—'} → ${c.to_unit ?? '—'}`
    case 'scd_type_1':
      return `SCD1 on ${Array.isArray(c.key_columns) ? c.key_columns.join(', ') : '—'} by ${c.timestamp_column ?? '—'}`
    default:
      return ''
  }
}

// ── Individual sortable step card ─────────────────────────────────────────────

interface StepCardProps {
  step: TransformStep
  idx: number
  total: number
  isSelected: boolean
  typeMap: Record<string, { name: string; icon: string }>
  onStepClick: (id: string) => void
  onStepMove: (id: string, direction: 'up' | 'down') => void
  onStepDelete: (id: string) => void
  isDragging?: boolean
}

function StepCard({
  step,
  idx,
  total,
  isSelected,
  typeMap,
  onStepClick,
  onStepMove,
  onStepDelete,
  isDragging = false,
}: StepCardProps) {
  const tt = typeMap[step.transform_type]
  const summary = stepSummary(step)

  return (
    <div
      onClick={() => onStepClick(step.id)}
      className={clsx(
        'flex items-start gap-2 p-3 bg-white rounded-lg border transition-all cursor-pointer select-none',
        isSelected
          ? 'border-blue-400 shadow-md ring-1 ring-blue-300'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm',
        isDragging && 'opacity-50'
      )}
    >
      {/* Step number */}
      <div
        className={clsx(
          'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5',
          isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
        )}
      >
        {idx + 1}
      </div>

      {/* Icon */}
      <span className="text-xl leading-none shrink-0 mt-0.5">{tt?.icon ?? '⚙️'}</span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-medium text-sm text-gray-800 truncate">
            {step.label ?? tt?.name ?? step.transform_type}
          </span>
          {step.label && tt && step.label !== tt.name && (
            <span className="text-xs text-gray-400">({tt.name})</span>
          )}
        </div>
        {summary && (
          <p className="text-xs text-gray-500 truncate">{summary}</p>
        )}
        {step.notes && (
          <p className="flex items-center gap-1 text-xs text-amber-600 truncate mt-0.5">
            <MessageSquare size={10} className="shrink-0" />
            <span className="truncate">{step.notes}</span>
          </p>
        )}
      </div>

      {/* Actions — fallback ↑↓ buttons (smaller/secondary) + delete */}
      <div
        className="flex items-center gap-0.5 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onStepMove(step.id, 'up') }}
          disabled={idx === 0}
          className="p-0.5 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          title="Move up"
        >
          <ChevronUp size={12} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onStepMove(step.id, 'down') }}
          disabled={idx === total - 1}
          className="p-0.5 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          title="Move down"
        >
          <ChevronDown size={12} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onStepDelete(step.id) }}
          className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          title="Delete step"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Sortable wrapper for each step ────────────────────────────────────────────

function SortableStepCard({
  step,
  idx,
  total,
  isSelected,
  typeMap,
  onStepClick,
  onStepMove,
  onStepDelete,
  activeId,
}: StepCardProps & { activeId: string | null }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-1.5">
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-center w-5 mt-3.5 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors shrink-0"
        onClick={(e) => e.stopPropagation()}
        title="Drag to reorder"
      >
        <GripVertical size={15} />
      </div>

      <div className="flex-1">
        <StepCard
          step={step}
          idx={idx}
          total={total}
          isSelected={isSelected}
          typeMap={typeMap}
          onStepClick={onStepClick}
          onStepMove={onStepMove}
          onStepDelete={onStepDelete}
          isDragging={isDragging || activeId === step.id}
        />
      </div>
    </div>
  )
}

// ── Main PipelineBuilder ──────────────────────────────────────────────────────

export default function PipelineBuilder({
  steps,
  selectedStepId,
  onStepClick,
  onStepDelete,
  onStepMove,
  onReorder,
  onAddStep,
}: Props) {
  const { data: transforms = [] } = useQuery({
    queryKey: ['transforms'],
    queryFn: fetchTransforms,
    staleTime: Infinity,
  })

  const typeMap = Object.fromEntries(transforms.map((t) => [t.id, t]))
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = steps.findIndex((s) => s.id === active.id)
    const newIdx = steps.findIndex((s) => s.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    const reordered = arrayMove(steps, oldIdx, newIdx)
    if (onReorder) {
      onReorder(reordered)
    }
  }

  const activeStep = activeId ? steps.find((s) => s.id === activeId) : null
  const activeIdx = activeId ? steps.findIndex((s) => s.id === activeId) : -1

  return (
    <div className="space-y-2 max-w-2xl mx-auto">
      {steps.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <div className="text-3xl mb-3">🔧</div>
          <p className="text-sm font-medium text-gray-500 mb-1">No transform steps yet</p>
          <p className="text-xs">Click "Add Transform" in the right panel to add your first step.</p>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {steps.map((step, idx) => (
              <SortableStepCard
                key={step.id}
                step={step}
                idx={idx}
                total={steps.length}
                isSelected={step.id === selectedStepId}
                typeMap={typeMap}
                onStepClick={onStepClick}
                onStepMove={onStepMove}
                onStepDelete={onStepDelete}
                activeId={activeId}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeStep && activeIdx >= 0 ? (
            <div className="flex items-start gap-1.5 opacity-95 rotate-1 scale-105">
              <div className="flex items-center justify-center w-5 mt-3.5 text-dblue-400 shrink-0">
                <GripVertical size={15} />
              </div>
              <div className="flex-1 shadow-2xl">
                <StepCard
                  step={activeStep}
                  idx={activeIdx}
                  total={steps.length}
                  isSelected={activeStep.id === selectedStepId}
                  typeMap={typeMap}
                  onStepClick={() => {}}
                  onStepMove={() => {}}
                  onStepDelete={() => {}}
                />
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Add step button */}
      <button
        onClick={onAddStep}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-all max-w-2xl"
      >
        <Plus size={15} /> Add transform step
      </button>
    </div>
  )
}
