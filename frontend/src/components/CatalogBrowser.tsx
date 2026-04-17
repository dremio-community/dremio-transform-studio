import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { IconCaretRight, IconCaretDown, IconEntityNamespace, IconEntityFolderBlue, IconEntityTable, IconSearch } from './icons'
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
          isActive ? 'bg-primary/20 text-primary font-medium' : 'text-white/70 hover:bg-sidebar-accent hover:text-white'
        )}
      >
        <IconEntityTable size={11} className={clsx('shrink-0', isActive ? 'text-primary' : 'text-white/40')} />
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
        className="flex items-center gap-1.5 w-full pr-3 py-1.5 text-xs text-white/70 hover:bg-sidebar-accent hover:text-white transition-colors"
      >
        {open ? <IconCaretDown size={11} className="text-white/40 shrink-0" /> : <IconCaretRight size={11} className="text-white/40 shrink-0" />}
        <IconEntityFolderBlue size={11} className="shrink-0" />
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
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-sm hover:bg-sidebar-accent text-white/70 hover:text-white transition-colors"
      >
        {open ? (
          <IconCaretDown size={12} className="text-white/40 shrink-0" />
        ) : (
          <IconCaretRight size={12} className="text-white/40 shrink-0" />
        )}
        <IconEntityNamespace size={12} className="text-primary shrink-0" />
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
        <div className="flex items-center gap-1.5 bg-sidebar-accent rounded px-2 py-1.5 border border-sidebar-border">
          <IconSearch size={12} className="text-white/50 shrink-0" />
          <input
            type="text"
            placeholder="Filter namespaces…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-xs text-white/80 outline-none flex-1 placeholder-white/30"
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
