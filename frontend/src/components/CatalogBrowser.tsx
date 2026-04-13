import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ChevronDown, Database, Folder, Table2, Search, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { fetchNamespaces, fetchTables } from '../api/client'
import type { CatalogEntry } from '../types'

interface Props {
  activeTable: string
  onSelectTable: (fullName: string) => void
}

function EntryNode({
  entry,
  parentPath,
  activeTable,
  onSelectTable,
  depth = 0,
}: {
  entry: CatalogEntry
  parentPath: string
  activeTable: string
  onSelectTable: (fullName: string) => void
  depth?: number
}) {
  const [open, setOpen] = useState(false)
  const fullPath = `${parentPath}.${entry.name}`

  const { data: children = [], isLoading } = useQuery({
    queryKey: ['tables', fullPath],
    queryFn: () => fetchTables(fullPath),
    enabled: open && entry.type === 'CONTAINER',
  })

  if (entry.type === 'DATASET') {
    const isActive = activeTable === fullPath
    return (
      <button
        onClick={() => onSelectTable(fullPath)}
        style={{ paddingLeft: `${12 + depth * 12}px` }}
        className={clsx(
          'flex items-center gap-1.5 w-full pr-3 py-1.5 text-xs transition-colors',
          isActive ? 'bg-dblue-500/20 text-dblue-400 font-medium' : 'text-surface-300 hover:bg-navy-800 hover:text-white'
        )}
      >
        <Table2 size={11} className={clsx('shrink-0', isActive ? 'text-dblue-400' : 'text-surface-600')} />
        <span className="truncate">{entry.name}</span>
      </button>
    )
  }

  // CONTAINER (folder)
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ paddingLeft: `${12 + depth * 12}px` }}
        className="flex items-center gap-1.5 w-full pr-3 py-1.5 text-xs text-surface-300 hover:bg-navy-800 hover:text-white transition-colors"
      >
        {open ? <ChevronDown size={11} className="text-surface-500 shrink-0" /> : <ChevronRight size={11} className="text-surface-500 shrink-0" />}
        <Folder size={11} className="text-amber-500 shrink-0" />
        <span className="truncate">{entry.name}</span>
      </button>
      {open && (
        <div>
          {isLoading && (
            <div className="flex items-center gap-1.5 py-1.5 text-xs text-gray-400" style={{ paddingLeft: `${24 + depth * 12}px` }}>
              <Loader2 size={10} className="animate-spin" /> Loading…
            </div>
          )}
          {!isLoading && children.length === 0 && (
            <div className="py-1.5 text-xs text-gray-400" style={{ paddingLeft: `${24 + depth * 12}px` }}>Empty</div>
          )}
          {children.map((child) => (
            <EntryNode
              key={child.name}
              entry={child}
              parentPath={fullPath}
              activeTable={activeTable}
              onSelectTable={onSelectTable}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function NamespaceNode({
  ns,
  activeTable,
  onSelectTable,
}: {
  ns: string
  activeTable: string
  onSelectTable: (fullName: string) => void
}) {
  const [open, setOpen] = useState(false)

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['tables', ns],
    queryFn: () => fetchTables(ns),
    enabled: open,
  })

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-sm hover:bg-navy-800 text-surface-300 hover:text-white transition-colors"
      >
        {open ? (
          <ChevronDown size={12} className="text-surface-500 shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-surface-500 shrink-0" />
        )}
        <Database size={12} className="text-dblue-400 shrink-0" />
        <span className="truncate font-medium text-xs">{ns}</span>
      </button>

      {open && (
        <div>
          {isLoading && (
            <div className="flex items-center gap-1.5 px-6 py-1.5 text-xs text-surface-600">
              <Loader2 size={11} className="animate-spin" /> Loading…
            </div>
          )}
          {!isLoading && entries.length === 0 && (
            <div className="px-6 py-1.5 text-xs text-surface-600">No tables</div>
          )}
          {entries.map((entry) => (
            <EntryNode
              key={entry.name}
              entry={entry}
              parentPath={ns}
              activeTable={activeTable}
              onSelectTable={onSelectTable}
              depth={0}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function CatalogBrowser({ activeTable, onSelectTable }: Props) {
  const [search, setSearch] = useState('')

  const { data: namespaces = [], isLoading, error } = useQuery({
    queryKey: ['namespaces'],
    queryFn: fetchNamespaces,
    staleTime: 60_000,
  })

  const filtered = namespaces.filter((ns) =>
    ns.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 shrink-0">
        <div className="flex items-center gap-1.5 bg-navy-800 rounded px-2 py-1.5">
          <Search size={12} className="text-surface-500 shrink-0" />
          <input
            type="text"
            placeholder="Filter namespaces…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-xs text-surface-300 outline-none flex-1 placeholder-surface-400"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center gap-2 px-3 py-3 text-xs text-surface-600">
            <Loader2 size={12} className="animate-spin" /> Loading catalog…
          </div>
        )}
        {error && (
          <div className="px-3 py-3 text-xs text-red-400">
            Failed to connect to Dremio
          </div>
        )}
        {!isLoading && !error && filtered.length === 0 && (
          <div className="px-3 py-3 text-xs text-surface-600">No namespaces found</div>
        )}
        {filtered.map((ns) => (
          <NamespaceNode
            key={ns}
            ns={ns}
            activeTable={activeTable}
            onSelectTable={onSelectTable}
          />
        ))}
      </div>
    </div>
  )
}
