import React, { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { IconAdd, IconCheckCircle, IconDatasetRun, IconDelete, IconErrorCircle, IconWarning } from './icons'
import type { PipelineTest, TestResult, TestType, TestSeverity } from '../types'
import { runPipelineTests } from '../api/client'

interface TestsPanelProps {
  pipelineId?: string
  tests: PipelineTest[]
  columns: string[]
  onTestsChange: (tests: PipelineTest[]) => void
}

const TEST_TYPE_OPTIONS: { value: TestType; label: string; description: string }[] = [
  { value: 'not_null', label: 'Not Null', description: 'Column has no NULL values' },
  { value: 'unique', label: 'Unique', description: 'Column values are all distinct' },
  { value: 'row_count_between', label: 'Row Count Between', description: 'Row count is within min–max range' },
  { value: 'accepted_values', label: 'Accepted Values', description: 'Column only contains listed values' },
  { value: 'relationships', label: 'Relationships', description: 'Column values all exist in a reference table (FK integrity)' },
  { value: 'custom_sql', label: 'Custom SQL', description: 'SQL returning 0 rows = pass, >0 rows = fail. Use {table} as placeholder.' },
]

function newTest(): PipelineTest {
  return {
    id: crypto.randomUUID(),
    name: '',
    test_type: 'not_null',
    severity: 'error',
  }
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'passed') return <IconCheckCircle size={14} className="text-green-500" />
  if (status === 'failed') return <IconErrorCircle size={14} className="text-red-500" />
  if (status === 'error') return <IconWarning size={14} className="text-orange-400" />
  return null
}

export default function TestsPanel({ pipelineId, tests, columns, onTestsChange }: TestsPanelProps) {
  const [results, setResults] = useState<TestResult[]>([])
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  function addTest() {
    onTestsChange([...tests, newTest()])
  }

  function updateTest(id: string, patch: Partial<PipelineTest>) {
    onTestsChange(tests.map(t => t.id === id ? { ...t, ...patch } : t))
  }

  function removeTest(id: string) {
    onTestsChange(tests.filter(t => t.id !== id))
    setResults(results.filter(r => r.test_id !== id))
  }

  async function handleRunTests() {
    if (!pipelineId) return
    setRunning(true)
    setRunError(null)
    try {
      const res = await runPipelineTests(pipelineId)
      setResults(res.results)
    } catch (e: unknown) {
      setRunError(e instanceof Error ? e.message : 'Failed to run tests')
    } finally {
      setRunning(false)
    }
  }

  const passed = results.filter(r => r.status === 'passed').length
  const failed = results.filter(r => r.status !== 'passed').length

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">
            Define data quality assertions that run after each execution.
            <span className="text-red-400"> Error</span> tests block the pipeline from completing.
            <span className="text-yellow-500"> Warn</span> tests log but don't block.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {pipelineId && tests.length > 0 && (
            <button
              onClick={handleRunTests}
              disabled={running}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-dblue-500 text-white rounded hover:bg-dblue-600 disabled:opacity-60"
            >
              {running ? <Loader2 size={12} className="animate-spin" /> : <IconDatasetRun size={12} />}
              Run Now
            </button>
          )}
          <button
            onClick={addTest}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-navy-700 text-white rounded hover:bg-white/15"
          >
            <IconAdd size={12} />
            Add Test
          </button>
        </div>
      </div>

      {/* Run results summary */}
      {results.length > 0 && (
        <div className={`flex items-center gap-3 px-3 py-2 rounded text-xs font-medium ${
          failed > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
        }`}>
          <IconCheckCircle size={13} className={failed > 0 ? 'text-red-400' : 'text-green-500'} />
          <span className={failed > 0 ? 'text-red-700' : 'text-green-700'}>
            {passed} passed · {failed} failed
          </span>
        </div>
      )}

      {runError && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {runError}
        </div>
      )}

      {/* Test list */}
      {tests.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-xs border-2 border-dashed border-gray-200 rounded-lg">
          <div className="text-2xl mb-1">🧪</div>
          No tests defined yet.
          <br />Click <strong>Add Test</strong> to create your first assertion.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {tests.map((test) => {
          const result = results.find(r => r.test_id === test.id)
          const isOpen = expanded === test.id
          return (
            <div
              key={test.id}
              className={`border rounded-lg overflow-hidden transition-colors ${
                result
                  ? result.status === 'passed'
                    ? 'border-green-300 bg-green-50/30'
                    : 'border-red-300 bg-red-50/30'
                  : 'border-gray-200 bg-white'
              }`}
            >
              {/* Test header row */}
              <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50/70"
                onClick={() => setExpanded(isOpen ? null : test.id)}
              >
                {result && <StatusIcon status={result.status} />}
                <span className="flex-1 text-xs font-medium text-gray-700 truncate">
                  {test.name || <span className="text-gray-400 italic">Unnamed test</span>}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  test.test_type === 'custom_sql' ? 'bg-indigo-100 text-indigo-700' :
                  test.test_type === 'relationships' ? 'bg-purple-100 text-purple-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {TEST_TYPE_OPTIONS.find(o => o.value === test.test_type)?.label}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  test.severity === 'error' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {test.severity}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeTest(test.id) }}
                  className="text-gray-300 hover:text-red-400 ml-1"
                >
                  <IconDelete size={12} />
                </button>
              </div>

              {/* Result message */}
              {result && (
                <div className={`px-3 py-1.5 text-xs border-t flex items-start gap-2 ${
                  result.status === 'passed' ? 'border-green-200 text-green-700' : 'border-red-200 text-red-700'
                }`}>
                  <span className="flex-1">{result.message}</span>
                  {result.failure_table && (
                    <span
                      className="shrink-0 px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-mono text-[10px] cursor-pointer hover:bg-orange-200"
                      title={`Failing rows stored in: ${result.failure_table}`}
                      onClick={() => navigator.clipboard.writeText(result.failure_table!)}
                    >
                      📋 {result.failure_table.split('.').pop()}
                    </span>
                  )}
                </div>
              )}

              {/* Expanded editor */}
              {isOpen && (
                <div className="border-t border-gray-100 bg-gray-50/50 px-3 py-2 flex flex-col gap-2">
                  {/* Name */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">Test Name</label>
                    <input
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                      placeholder="e.g. user_id must be unique"
                      value={test.name}
                      onChange={e => updateTest(test.id, { name: e.target.value })}
                    />
                  </div>

                  {/* Type */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">Test Type</label>
                    <select
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                      value={test.test_type}
                      onChange={e => updateTest(test.id, { test_type: e.target.value as TestType })}
                    >
                      {TEST_TYPE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label} — {o.description}</option>
                      ))}
                    </select>
                  </div>

                  {/* Severity */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">Severity</label>
                    <div className="flex gap-2">
                      {(['error', 'warn'] as TestSeverity[]).map(s => (
                        <label key={s} className="flex items-center gap-1 text-xs cursor-pointer">
                          <input
                            type="radio"
                            name={`severity-${test.id}`}
                            value={s}
                            checked={test.severity === s}
                            onChange={() => updateTest(test.id, { severity: s })}
                          />
                          <span className={s === 'error' ? 'text-red-600' : 'text-yellow-600'}>
                            {s === 'error' ? '🚫 Error (blocking)' : '⚠️ Warn (non-blocking)'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Type-specific fields */}
                  {(test.test_type === 'not_null' || test.test_type === 'unique') && (
                    <div>
                      <label className="text-xs text-gray-500 block mb-0.5">Column</label>
                      <select
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                        value={test.column || ''}
                        onChange={e => updateTest(test.id, { column: e.target.value })}
                      >
                        <option value="">— pick a column —</option>
                        {columns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <input
                        className="mt-1 w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                        placeholder="Or type column name..."
                        value={test.column || ''}
                        onChange={e => updateTest(test.id, { column: e.target.value })}
                      />
                    </div>
                  )}

                  {test.test_type === 'row_count_between' && (
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-xs text-gray-500 block mb-0.5">Min Rows</label>
                        <input
                          type="number"
                          className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                          placeholder="e.g. 1"
                          value={test.min_rows ?? ''}
                          onChange={e => updateTest(test.id, { min_rows: e.target.value ? Number(e.target.value) : undefined })}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-gray-500 block mb-0.5">Max Rows</label>
                        <input
                          type="number"
                          className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                          placeholder="e.g. 1000000"
                          value={test.max_rows ?? ''}
                          onChange={e => updateTest(test.id, { max_rows: e.target.value ? Number(e.target.value) : undefined })}
                        />
                      </div>
                    </div>
                  )}

                  {test.test_type === 'accepted_values' && (
                    <div>
                      <div className="mb-1">
                        <label className="text-xs text-gray-500 block mb-0.5">Column</label>
                        <input
                          className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                          placeholder="Column name"
                          value={test.column || ''}
                          onChange={e => updateTest(test.id, { column: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">Accepted Values (one per line)</label>
                        <textarea
                          className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white font-mono resize-none"
                          rows={4}
                          placeholder="active&#10;inactive&#10;pending"
                          value={(test.values || []).join('\n')}
                          onChange={e => updateTest(test.id, {
                            values: e.target.value.split('\n').map(v => v.trim()).filter(Boolean)
                          })}
                        />
                      </div>
                    </div>
                  )}

                  {test.test_type === 'relationships' && (
                    <div className="flex flex-col gap-1.5">
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">Column (in this table)</label>
                        <input
                          className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white font-mono"
                          placeholder="e.g. customer_id"
                          value={test.column || ''}
                          onChange={e => updateTest(test.id, { column: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">Reference Table</label>
                        <input
                          className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white font-mono"
                          placeholder="e.g. My Space.dim_customers"
                          value={test.reference_table || ''}
                          onChange={e => updateTest(test.id, { reference_table: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">Reference Column (in reference table)</label>
                        <input
                          className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white font-mono"
                          placeholder="e.g. id"
                          value={test.reference_column || ''}
                          onChange={e => updateTest(test.id, { reference_column: e.target.value })}
                        />
                      </div>
                      <p className="text-[10px] text-gray-400">
                        Checks that every value of <em>column</em> exists in <em>reference table.reference column</em>.
                        Fails if any orphan values are found.
                      </p>
                    </div>
                  )}

                  {test.test_type === 'custom_sql' && (
                    <div>
                      <label className="text-xs text-gray-500 block mb-0.5">
                        SQL — returns 0 rows = <span className="text-green-600">PASS</span>,
                        &gt;0 rows = <span className="text-red-500">FAIL</span>.
                        Use <code className="bg-gray-200 px-0.5 rounded">{'{table}'}</code> for the output table.
                      </label>
                      <textarea
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white font-mono resize-none"
                        rows={4}
                        placeholder={'SELECT * FROM {table} WHERE amount < 0'}
                        value={test.sql || ''}
                        onChange={e => updateTest(test.id, { sql: e.target.value })}
                      />
                    </div>
                  )}

                  {/* Row filter — applies to all test types except custom_sql */}
                  {test.test_type !== 'custom_sql' && (
                    <div>
                      <label className="text-xs text-gray-500 block mb-0.5">
                        Row filter <span className="text-gray-400">(optional WHERE clause, no WHERE keyword)</span>
                      </label>
                      <input
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white font-mono"
                        placeholder="e.g. status = 'active' AND region = 'US'"
                        value={test.filter || ''}
                        onChange={e => updateTest(test.id, { filter: e.target.value || undefined })}
                      />
                    </div>
                  )}

                  {/* Store failures */}
                  <label className="flex items-center gap-2 text-xs cursor-pointer select-none pt-1 border-t border-gray-100">
                    <input
                      type="checkbox"
                      checked={!!test.store_failures}
                      onChange={e => updateTest(test.id, { store_failures: e.target.checked })}
                    />
                    <span className="text-gray-600">
                      Store failures — CTAS failing rows to <code className="bg-gray-100 px-0.5 rounded">_failures_{'{test_name}'}</code> table on failure
                    </span>
                  </label>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
