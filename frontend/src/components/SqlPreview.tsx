import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface Props {
  sql: string
}

// Minimal keyword highlighter for display purposes
function highlightSql(sql: string): string {
  const keywords = [
    'WITH', 'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING',
    'JOIN', 'LEFT JOIN', 'INNER JOIN', 'ON', 'AND', 'OR', 'NOT', 'IN',
    'IS NULL', 'IS NOT NULL', 'AS', 'DISTINCT', 'LIMIT', 'OFFSET',
    'CREATE', 'TABLE', 'VIEW', 'INSERT', 'INTO', 'REPLACE',
    'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
    'OVER', 'PARTITION BY', 'ROWS', 'UNBOUNDED', 'PRECEDING',
    'ROW_NUMBER', 'SUM', 'COUNT', 'AVG', 'MIN', 'MAX',
    'COALESCE', 'NULLIF', 'TRY_CAST', 'CAST',
    'DATE_TRUNC', 'DATEADD', 'DATEDIFF', 'TO_DATE', 'TO_TIMESTAMP',
    'TRIM', 'UPPER', 'LOWER', 'INITCAP', 'CONCAT', 'SPLIT_PART',
    'REGEXP_REPLACE', 'REGEXP_LIKE', 'EXCEPT',
  ]
  // We return the raw SQL — actual color is handled via CSS span classes
  // For a simple MVP we just return the SQL as-is and let the <pre> render it
  return sql
}

export default function SqlPreview({ sql }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sql)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Split into lines and apply rudimentary token coloring
  const lines = sql.split('\n')

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 shrink-0">
        <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Generated SQL</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
        >
          {copied ? (
            <>
              <Check size={12} className="text-green-400" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code block */}
      <div className="flex-1 overflow-auto p-4">
        <pre className="text-xs font-mono leading-relaxed text-gray-100 whitespace-pre-wrap break-words">
          {lines.map((line, i) => {
            // Color CTE names (_src, _s0, etc.)
            const colored = line
              .replace(
                /\b(WITH|SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|JOIN|LEFT JOIN|INNER JOIN|PARTITION BY|ORDER BY|AS|ON|AND|OR|NOT|IN|CASE|WHEN|THEN|ELSE|END|OVER|ROWS|UNBOUNDED|PRECEDING|FOLLOWING|LIMIT|OFFSET|DISTINCT|CREATE|TABLE|VIEW|INSERT|INTO|REPLACE|EXCEPT)\b/g,
                '<kw>$1</kw>'
              )

            // We can't do JSX tags here easily without dangerouslySetInnerHTML,
            // so instead we do simple line-by-line rendering with color hints:

            const isCteHeader = line.trim().startsWith('_src AS') || /^  _s\d+ AS/.test(line)
            const isComment = line.trim().startsWith('--')

            return (
              <span
                key={i}
                className={
                  isComment
                    ? 'text-gray-500'
                    : isCteHeader
                    ? 'text-emerald-400 font-medium'
                    : ''
                }
              >
                <SqlLine line={line} />
                {'\n'}
              </span>
            )
          })}
        </pre>
      </div>
    </div>
  )
}

const SQL_KEYWORDS = new Set([
  'WITH', 'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'HAVING',
  'JOIN', 'LEFT', 'INNER', 'ON', 'AND', 'OR', 'NOT', 'IN', 'AS',
  'DISTINCT', 'LIMIT', 'OFFSET', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'OVER', 'PARTITION', 'ROWS', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING',
  'CREATE', 'TABLE', 'VIEW', 'INSERT', 'INTO', 'REPLACE', 'EXCEPT', 'NULL',
  'IS', 'DESC', 'ASC', 'COALESCE', 'NULLIF', 'CAST', 'TRY_CAST',
])

function SqlLine({ line }: { line: string }) {
  // Tokenize: strings, numbers, identifiers, symbols
  const tokens: Array<{ type: string; text: string }> = []
  let remaining = line

  while (remaining.length > 0) {
    // String literal
    const strMatch = remaining.match(/^('(?:[^']|'')*')/)
    if (strMatch) {
      tokens.push({ type: 'string', text: strMatch[1] })
      remaining = remaining.slice(strMatch[1].length)
      continue
    }
    // Word token
    const wordMatch = remaining.match(/^([A-Za-z_][A-Za-z0-9_]*)/)
    if (wordMatch) {
      const word = wordMatch[1]
      const upper = word.toUpperCase()
      tokens.push({ type: SQL_KEYWORDS.has(upper) ? 'keyword' : 'ident', text: word })
      remaining = remaining.slice(word.length)
      continue
    }
    // Number
    const numMatch = remaining.match(/^(\d+(?:\.\d+)?)/)
    if (numMatch) {
      tokens.push({ type: 'number', text: numMatch[1] })
      remaining = remaining.slice(numMatch[1].length)
      continue
    }
    // Single char
    tokens.push({ type: 'symbol', text: remaining[0] })
    remaining = remaining.slice(1)
  }

  return (
    <>
      {tokens.map((tok, i) => {
        switch (tok.type) {
          case 'keyword':
            return <span key={i} className="text-blue-400 font-semibold">{tok.text}</span>
          case 'string':
            return <span key={i} className="text-amber-300">{tok.text}</span>
          case 'number':
            return <span key={i} className="text-purple-300">{tok.text}</span>
          case 'ident':
            return (
              <span key={i} className={tok.text.startsWith('_') ? 'text-emerald-400' : 'text-gray-100'}>
                {tok.text}
              </span>
            )
          default:
            return <span key={i} className="text-gray-300">{tok.text}</span>
        }
      })}
    </>
  )
}
