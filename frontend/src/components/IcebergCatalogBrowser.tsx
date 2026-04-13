import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ChevronDown, Folder, Table2, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { fetchIcebergNamespaces, fetchIcebergChildren } from '../api/client'
import type { IcebergCatalog, CatalogEntry } from '../types'

interface Props {
  catalog: IcebergCatalog
  activeTable: string
  onSelectTable: (fullName: string) => void
}

function IcebergEntryNode({
  entry,
  parentPath,
  connId,
  activeTable,
  onSelectTable,
  depth,
}: {
  entry: CatalogEntry
  parentPath: string
  connId: string
  activeTable: string
  onSelectTable: (t: string) => void
  depth: number
}) {
  const [open, setOpen] = useState(false)
  // For Iceberg, the full "table" path to pass to SQL is namespace.table
  // We need to pass the full dotted path as the source table identifier
  // The format matches how we pass it to the backend: "ns.table"
  const fullPath = `${parentPath}.${entry.name}`

  const { data: children = [], isLoading } = useQuery({
    queryKey: ['iceberg-children', connId, fullPath],
    queryFn: () => fetchIcebergChildren(connId, fullPath),
    enabled: open && entry.type === 'CONTAINER',
  })

  if (entry.type === 'DATASET') {
    const isActive = activeTable === fullPath
    return (
      <button
        onClick={() => onSelectTable(fullPath)}
        style={{ paddingLeft: `${10 + depth * 12}px` }}
        className={clsx(
          'flex items-center gap-1.5 w-full pr-3 py-1.5 text-xs transition-colors',
          isActive ? 'bg-dblue-500/20 text-dblue-400 font-medium' : 'text-surface-500 hover:bg-navy-800 hover:text-white'
        )}
      >
        <Table2 size={10} className="shrink-0 text-surface-600" />
        <span className="truncate">{entry.name}</span>
      </button>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ paddingLeft: `${10 + depth * 12}px` }}
        className="flex items-center gap-1.5 w-full pr-3 py-1.5 text-xs text-surface-300 hover:bg-navy-800 hover:text-white transition-colors"
      >
        {open ? <ChevronDown size={10} className="shrink-0" /> : <ChevronRight size={10} className="shrink-0" />}
        <Folder size={10} className="shrink-0 text-amber-500" />
        <span className="truncate">{entry.name}</span>
      </button>
      {open && (
        <div>
          {isLoading && (
            <div className="flex items-center gap-1 py-1 text-xs text-surface-600" style={{ paddingLeft: `${22 + depth * 12}px` }}>
              <Loader2 size={9} className="animate-spin" /> Loading…
            </div>
          )}
          {!isLoading && children.length === 0 && (
            <div className="py-1 text-xs text-surface-600" style={{ paddingLeft: `${22 + depth * 12}px` }}>Empty</div>
          )}
          {children.map((child) => (
            <IcebergEntryNode
              key={child.name}
              entry={child}
              parentPath={fullPath}
              connId={connId}
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

export default function IcebergCatalogBrowser({ catalog, activeTable, onSelectTable }: Props) {
  const { data: namespaces = [], isLoading, error } = useQuery({
    queryKey: ['iceberg-namespaces', catalog.id],
    queryFn: () => fetchIcebergNamespaces(catalog.id),
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-surface-600">
        <Loader2 size={11} className="animate-spin" /> Loading…
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-3 py-2 text-xs text-red-400">
        Failed to connect
      </div>
    )
  }

  if (namespaces.length === 0) {
    return <div className="px-3 py-2 text-xs text-surface-600">No namespaces</div>
  }

  return (
    <div>
      {namespaces.map((ns) => {
        // Top-level namespaces are treated as containers
        const entry: CatalogEntry = { name: ns.split('.').pop() ?? ns, type: 'CONTAINER' }
        // parentPath is everything before the last dot, or catalog.name if top-level
        const parentPath = ns.includes('.') ? ns.substring(0, ns.lastIndexOf('.')) : ''
        return (
          <IcebergEntryNode
            key={ns}
            entry={entry}
            parentPath={parentPath}
            connId={catalog.id}
            activeTable={activeTable}
            onSelectTable={onSelectTable}
            depth={0}
          />
        )
      })}
    </div>
  )
}
