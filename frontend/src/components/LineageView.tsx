import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { useState } from 'react'
import type { TransformStep, Pipeline } from '../types'
import { fetchTransforms, fetchColumnLineage } from '../api/client'

interface Props {
  pipeline: Pipeline
  selectedStepId: string | null
  onStepClick: (id: string) => void
}

function toTitleCase(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function stepSummary(step: TransformStep): string {
  const c = step.config
  const cols = (arr: unknown) =>
    Array.isArray(arr) ? (arr as string[]).join(', ') : ''

  switch (step.transform_type) {
    case 'remove_duplicates': return `Deduplicate on: ${cols(c.dedup_columns) || '—'}`
    case 'drop_nulls': return `Drop nulls in: ${cols(c.columns) || '—'}`
    case 'fill_null': return `Fill ${c.column ?? '—'} using ${c.strategy ?? 'constant'}`
    case 'trim_whitespace': return `Trim: ${cols(c.columns) || '—'}`
    case 'standardize_case': return `${c.column ?? '—'} → ${c.case ?? 'lower'}`
    case 'cast_type': return `${c.column ?? '—'} → ${c.target_type ?? 'VARCHAR'}`
    case 'filter_rows': return `${c.column ?? '—'} ${c.operator ?? 'equals'} ${c.value ?? ''}`
    case 'remove_special_chars': return `Clean: ${c.column ?? '—'}`
    case 'rename_columns': {
      const renames = c.renames as Record<string, string> | undefined
      if (!renames) return 'No renames configured'
      return Object.entries(renames).slice(0, 2).map(([a, b]) => `${a}→${b}`).join(', ')
    }
    case 'select_columns': return `Keep: ${cols(c.columns) || '—'}`
    case 'drop_columns': return `Drop: ${cols(c.columns) || '—'}`
    case 'split_column': return `Split ${c.column ?? '—'} by "${c.delimiter ?? ''}"`
    case 'combine_columns': return `Combine ${cols(c.columns) || '—'} → ${c.output_name ?? '—'}`
    case 'add_column': return `${c.name ?? '—'} = ${String(c.expression ?? '').slice(0, 30)}`
    case 'parse_date': return `Parse ${c.column ?? '—'} as ${c.output_type ?? 'TIMESTAMP'}`
    case 'extract_date_part': return `Extract ${c.part ?? '—'} from ${c.column ?? '—'}`
    case 'truncate_date': return `Truncate ${c.column ?? '—'} to ${c.period ?? '—'}`
    case 'date_diff': return `Diff ${c.start_column ?? '—'} → ${c.end_column ?? 'today'} in ${c.unit ?? 'day'}s`
    case 'date_add': return `${c.operation ?? 'add'} ${c.amount ?? 1} ${c.unit ?? 'day'}(s) to ${c.column ?? '—'}`
    case 'lookup_join': return `Join ${c.lookup_table ?? '—'} on ${c.join_key_source ?? '—'}`
    case 'map_values': return `Map values in ${c.column ?? '—'}`
    case 'bin_values': return `Bin ${c.column ?? '—'} → ${c.output_name ?? '—'}`
    case 'add_row_number': return `Row # ordered by ${c.order_by ?? '—'}`
    case 'add_running_total': return `Running total of ${c.column ?? '—'}`
    case 'group_aggregate': return `Group by: ${cols(c.group_by) || '—'}`
    case 'top_n_per_group': return `Top ${c.n ?? 10} per ${c.group_by ?? '—'}`
    case 'dedupe_keep_latest': return `Keep latest by ${c.timestamp_column ?? '—'}`
    case 'validate_regex': return `${c.mode === 'not_match' ? 'Exclude' : 'Keep'} rows matching ${c.pattern ?? '—'}`
    case 'clip_values': return `Clamp ${c.column ?? '—'} [${c.min_value ?? '∞'}, ${c.max_value ?? '∞'}]`
    case 'replace_string': return `In ${c.column ?? '—'}: "${c.find ?? ''}" → "${c.replace ?? ''}"`
    case 'reorder_columns': return `Reorder: ${Array.isArray(c.columns) ? (c.columns as string[]).join(', ') : '—'}`
    case 'unpivot': return `Unpivot ${Array.isArray(c.value_columns) ? (c.value_columns as unknown[]).length : 0} cols → ${c.key_column_name ?? 'key'} / ${c.value_column_name ?? 'value'}`
    case 'flatten_json': return `Extract ${c.fields ?? '—'} from ${c.column ?? '—'}`
    case 'conditional_column': return `${c.output_name ?? '—'} = CASE WHEN ${c.condition_column ?? '—'} …`
    case 'lag_lead': return `${c.function ?? 'LAG'}(${c.column ?? '—'}, ${c.offset ?? 1}) → ${c.output_name ?? '—'}`
    case 'percent_of_total': return `${c.column ?? '—'} as % of ${c.partition_by ? `${c.partition_by} group` : 'total'} → ${c.output_name ?? '—'}`
    case 'rolling_window': return `${c.function ?? 'AVG'}(${c.column ?? '—'}) over ${c.window_size ?? 7} rows → ${c.output_name ?? '—'}`
    case 'sample_rows': return `Random ${c.n ?? 1000} rows`
    case 'extract_regex': return `${c.pattern ?? '—'} from ${c.column ?? '—'} → ${c.output_name ?? '—'}`
    case 'pad_string': return `${c.direction === 'right' ? 'RPAD' : 'LPAD'}(${c.column ?? '—'}, ${c.length ?? 10}, '${c.fill_char ?? '0'}')`
    case 'substring': return `${c.column ?? '—'}[${c.start ?? 1}:${c.length ?? 10}]`
    case 'string_length': return `LENGTH(${c.column ?? '—'}) → ${c.output_name ?? '—'}`
    case 'upper_lower': return `${c.case ?? 'lower'}: ${Array.isArray(c.columns) ? (c.columns as string[]).join(', ') : '—'}`
    case 'concat_literal': return `${c.prefix ?? ''}[${c.column ?? '—'}]${c.suffix ?? ''}`
    case 'hash_column': return `${c.algorithm ?? 'MD5'}(${c.column ?? '—'}) → ${c.output_name || c.column || '—'}`
    case 'surrogate_key': return `MD5(${Array.isArray(c.columns) ? (c.columns as string[]).join(` ${c.separator ?? '|'} `) : '—'}) → ${c.output_name ?? '—'}`
    case 'join': return `${c.join_type ?? 'LEFT'} JOIN ${c.right_table ?? '—'}`
    case 'union': return `${c.mode ?? 'UNION ALL'} ${c.union_table ?? '—'}`
    case 'outlier_filter': return `${c.action === 'keep_outliers' ? 'Keep' : 'Remove'} outliers in ${c.column ?? '—'} (±${c.threshold ?? 3}σ)`
    case 'unit_conversion': return `${c.column ?? '—'}: ${c.from_unit ?? '—'} → ${c.to_unit ?? '—'}`
    case 'scd_type_1': return `SCD1 on ${Array.isArray(c.key_columns) ? (c.key_columns as string[]).join(', ') : '—'} by ${c.timestamp_column ?? '—'}`
    default: return toTitleCase(step.transform_type)
  }
}

function Arrow() {
  return (
    <div className="flex flex-col items-center py-1 select-none" aria-hidden>
      <div className="w-px h-4 bg-surface-300" />
      <span className="text-surface-400 leading-none text-sm">&#8595;</span>
    </div>
  )
}

export default function LineageView({ pipeline, selectedStepId, onStepClick }: Props) {
  const [lineageOpen, setLineageOpen] = useState(false)

  const { data: transforms = [] } = useQuery({
    queryKey: ['transforms'],
    queryFn: fetchTransforms,
    staleTime: Infinity,
  })

  const { data: columnLineage } = useQuery({
    queryKey: ['column-lineage', pipeline.id],
    queryFn: () => fetchColumnLineage(pipeline.id!),
    enabled: !!pipeline.id && pipeline.steps.length > 0,
    staleTime: 30_000,
  })

  const typeMap = Object.fromEntries(transforms.map((t) => [t.id, t]))
  const hasOutput = !!pipeline.output_table && pipeline.output_mode !== 'preview'
  const sourceShort = pipeline.source_table.split('.').pop() ?? pipeline.source_table

  return (
    <div className="w-full p-4 overflow-y-auto flex flex-col items-center">

      {/* Source node */}
      <div className="w-48 rounded-lg bg-navy-900 text-white px-3 py-2.5 shadow-md flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">🗄️</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-surface-400">Source</span>
        </div>
        <p className="text-xs font-mono text-dblue-300 truncate" title={pipeline.source_table}>
          {sourceShort}
        </p>
      </div>

      {/* Steps */}
      {pipeline.steps.length === 0 && (
        <>
          <Arrow />
          <div className="w-48 rounded-lg border border-dashed border-surface-300 bg-surface-50 px-3 py-3 text-center">
            <p className="text-xs text-surface-400">No transform steps</p>
          </div>
        </>
      )}

      {pipeline.steps.map((step) => {
        const tt = typeMap[step.transform_type]
        const isSelected = step.id === selectedStepId
        const summary = stepSummary(step)
        const displayName = step.label ?? tt?.name ?? toTitleCase(step.transform_type)

        return (
          <div key={step.id} className="flex flex-col items-center">
            <Arrow />
            <button
              onClick={() => onStepClick(step.id)}
              className={clsx(
                'w-48 rounded-lg border bg-white px-3 py-2.5 text-left shadow-sm transition-all',
                'hover:shadow-md hover:border-dblue-300',
                isSelected
                  ? 'border-dblue-400 ring-1 ring-dblue-300 border-l-4 border-l-dblue-500'
                  : 'border-surface-200 border-l-4 border-l-surface-300'
              )}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-base leading-none shrink-0">{tt?.icon ?? '⚙️'}</span>
                <span className={clsx(
                  'text-xs font-semibold truncate',
                  isSelected ? 'text-dblue-700' : 'text-surface-800'
                )}>
                  {displayName}
                </span>
              </div>
              {summary && (
                <p className="text-xs text-surface-500 truncate pl-6" title={summary}>
                  {summary}
                </p>
              )}
            </button>
          </div>
        )
      })}

      {/* Output node */}
      {hasOutput && (
        <>
          <Arrow />
          <div className="w-48 rounded-lg bg-emerald-700 text-white px-3 py-2.5 shadow-md flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-base leading-none">📤</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-200">Output</span>
            </div>
            <p className="text-xs font-mono text-emerald-100 truncate" title={pipeline.output_table}>
              {pipeline.output_table?.split('.').pop() ?? pipeline.output_table}
            </p>
            <p className="text-xs text-emerald-300 capitalize">
              {pipeline.output_mode === 'ctas'
                ? 'Create Table'
                : pipeline.output_mode === 'insert'
                  ? 'Insert Into'
                  : pipeline.output_mode === 'view'
                    ? 'Create View'
                    : pipeline.output_mode}
            </p>
          </div>
        </>
      )}

      {/* Exposure nodes */}
      {(pipeline.exposures ?? []).length > 0 && (
        <>
          <Arrow />
          <div className="flex flex-col items-center gap-2 w-full">
            {(pipeline.exposures ?? []).map(exp => (
              <a
                key={exp.id}
                href={exp.url || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="w-48 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 shadow-sm flex flex-col gap-0.5 hover:shadow-md hover:border-indigo-400 transition-all"
                title={exp.description || exp.url}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm leading-none">{
                    exp.tool_type === 'tableau' ? '📊' :
                    exp.tool_type === 'looker' ? '👁️' :
                    exp.tool_type === 'metabase' ? '📈' :
                    exp.tool_type === 'powerbi' ? '📉' :
                    exp.tool_type === 'mode' ? '📋' :
                    exp.tool_type === 'superset' ? '⚡' :
                    exp.tool_type === 'redash' ? '🔮' : '🔗'
                  }</span>
                  <span className="text-xs font-semibold text-indigo-800 truncate">{exp.name || 'Exposure'}</span>
                </div>
                <p className="text-[10px] text-indigo-500 capitalize pl-5">
                  {exp.tool_type === 'powerbi' ? 'Power BI' : exp.tool_type.charAt(0).toUpperCase() + exp.tool_type.slice(1)}
                  {exp.url && ' ↗'}
                </p>
              </a>
            ))}
          </div>
        </>
      )}

      {/* Column lineage section */}
      {columnLineage && columnLineage.steps.length > 0 && (
        <div className="w-full mt-6 border-t border-surface-200 pt-4">
          <button
            onClick={() => setLineageOpen(v => !v)}
            className="flex items-center gap-2 text-xs font-semibold text-surface-600 hover:text-surface-900 mb-3 w-full"
          >
            <span className="text-surface-400">{lineageOpen ? '▼' : '▶'}</span>
            Column Lineage
            <span className="ml-auto text-[10px] font-normal text-surface-400">
              {columnLineage.steps[columnLineage.steps.length - 1]?.output_columns.length ?? 0} output columns
            </span>
          </button>

          {lineageOpen && (
            <div className="space-y-3">
              {columnLineage.steps.map((step) => {
                const changedCols = Object.entries(step.column_map).filter(
                  ([out, srcs]) => !(srcs.length === 1 && srcs[0] === out)
                )
                if (changedCols.length === 0) return null
                return (
                  <div key={step.step_index} className="rounded-lg border border-surface-200 bg-surface-50 overflow-hidden">
                    <div className="px-3 py-1.5 bg-surface-100 border-b border-surface-200 flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">
                        Step {step.step_index + 1}
                      </span>
                      <span className="text-[10px] text-surface-600 truncate">{step.step_label}</span>
                    </div>
                    <div className="divide-y divide-surface-100">
                      {changedCols.map(([outCol, srcCols]) => (
                        <div key={outCol} className="px-3 py-1.5 flex items-start gap-2 text-xs">
                          <span className="font-mono text-dblue-600 shrink-0 min-w-0 truncate" style={{ maxWidth: '40%' }} title={outCol}>
                            {outCol}
                          </span>
                          <span className="text-surface-400 shrink-0">←</span>
                          <span className="text-surface-600 font-mono min-w-0 truncate flex-1" title={srcCols.join(', ')}>
                            {srcCols[0] === '*'
                              ? <span className="italic text-surface-400">computed</span>
                              : srcCols.join(', ')
                            }
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
