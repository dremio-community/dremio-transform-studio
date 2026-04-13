import type { PreviewResult } from '../types'

interface Props {
  result: PreviewResult
}

export default function PreviewTable({ result }: Props) {
  const { columns, rows, row_count, truncated } = result

  return (
    <div className="flex flex-col h-full">
      {/* Info bar */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-gray-100 bg-gray-50 text-xs text-gray-500 shrink-0">
        <span>
          <span className="font-semibold text-gray-700">{row_count.toLocaleString()}</span> rows
          {truncated && (
            <span className="ml-1 text-amber-600 font-medium">(preview limited to 100)</span>
          )}
        </span>
        <span className="text-gray-300">|</span>
        <span>
          <span className="font-semibold text-gray-700">{columns.length}</span> columns
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-sm text-gray-400">
            No rows returned
          </div>
        ) : (
          <table className="min-w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-white shadow-sm z-10">
              <tr>
                <th className="px-2 py-1.5 text-right text-gray-400 font-medium border-r border-gray-100 w-10 shrink-0">
                  #
                </th>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-1.5 text-left text-gray-600 font-semibold border-b border-gray-200 whitespace-nowrap bg-gray-50"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                >
                  <td className="px-2 py-1 text-right text-gray-300 font-mono border-r border-gray-100 select-none">
                    {rowIdx + 1}
                  </td>
                  {columns.map((col) => {
                    const val = row[col]
                    const isNull = val === null || val === undefined
                    return (
                      <td
                        key={col}
                        className="px-3 py-1 whitespace-nowrap border-b border-gray-100 max-w-xs truncate"
                        title={isNull ? 'null' : String(val)}
                      >
                        {isNull ? (
                          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded text-[10px] font-mono">
                            null
                          </span>
                        ) : typeof val === 'boolean' ? (
                          <span className={`font-mono ${val ? 'text-green-700' : 'text-red-600'}`}>
                            {String(val)}
                          </span>
                        ) : typeof val === 'number' ? (
                          <span className="font-mono text-blue-700">{val.toLocaleString()}</span>
                        ) : (
                          <span className="text-gray-800">{String(val).slice(0, 120)}</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
