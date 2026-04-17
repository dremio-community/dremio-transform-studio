import React, { useEffect, useState, useRef } from 'react'
import { GitBranch, ArrowRight, Layers, Shuffle } from 'lucide-react'
import { IconClose, IconEntityNamespace, IconRefresh, IconWarning } from './icons'
import type { PipelineDag, DagNode, LineageNode, DagEdge } from '../types'
import { fetchDag } from '../api/client'

interface PipelineDagViewProps {
  onClose: () => void
  onSelectPipeline: (id: string) => void
}

type ViewMode = 'dag' | 'lineage'

// ── Layout helpers ────────────────────────────────────────────────────────────

function computeDagLayout(dag: PipelineDag): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const depth = new Map<string, number>()

  function getDepth(id: string, visited = new Set<string>()): number {
    if (depth.has(id)) return depth.get(id)!
    if (visited.has(id)) return 0
    visited.add(id)
    const node = dag.nodes.find(n => n.id === id)
    const deps = node?.dependencies || []
    if (deps.length === 0) { depth.set(id, 0); return 0 }
    const d = Math.max(...deps.map(dep => getDepth(dep, new Set(visited)))) + 1
    depth.set(id, d)
    return d
  }
  dag.nodes.forEach(n => getDepth(n.id))

  const byDepth = new Map<number, string[]>()
  dag.nodes.forEach(n => {
    const d = depth.get(n.id) || 0
    if (!byDepth.has(d)) byDepth.set(d, [])
    byDepth.get(d)!.push(n.id)
  })

  byDepth.forEach((ids, col) => {
    ids.forEach((id, row) => {
      positions.set(id, { x: 40 + col * 220, y: 40 + row * 80 })
    })
  })
  return positions
}

function computeLineageLayout(dag: PipelineDag): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const nodes = dag.lineage_nodes
  const edges = dag.lineage_edges

  // Assign columns by type: source=0, intermediate=1 or computed, pipeline between tables, output=last
  // Use topological ordering based on edges
  const in_degree = new Map<string, number>(nodes.map(n => [n.id, 0]))
  const adj = new Map<string, string[]>(nodes.map(n => [n.id, []]))
  for (const e of edges) {
    if (adj.has(e.source)) adj.get(e.source)!.push(e.target)
    if (in_degree.has(e.target)) in_degree.set(e.target, (in_degree.get(e.target) || 0) + 1)
  }

  // Kahn's for levels
  const levels: string[][] = []
  let queue = nodes.filter(n => (in_degree.get(n.id) || 0) === 0).map(n => n.id)
  const visited = new Set<string>()
  while (queue.length) {
    levels.push([...queue])
    visited.clear()
    const next: string[] = []
    for (const id of queue) {
      for (const nb of adj.get(id) || []) {
        in_degree.set(nb, (in_degree.get(nb) || 1) - 1)
        if (in_degree.get(nb) === 0 && !next.includes(nb)) next.push(nb)
      }
    }
    queue = next
  }

  const COL = 230
  const ROW = 70
  levels.forEach((ids, col) => {
    ids.forEach((id, row) => positions.set(id, { x: 40 + col * COL, y: 40 + row * ROW }))
  })
  return positions
}

// ── Node renderers ────────────────────────────────────────────────────────────

function PipelineNodeCard({ node, pos, isInCycle, onClick }: {
  node: DagNode; pos: { x: number; y: number }; isInCycle: boolean; onClick: () => void
}) {
  const modeColor: Record<string, string> = {
    ctas: 'bg-blue-100 text-blue-700', incremental: 'bg-purple-100 text-purple-700',
    scd2: 'bg-orange-100 text-orange-700', view: 'bg-teal-100 text-teal-700',
    insert: 'bg-amber-100 text-amber-700', preview: 'bg-gray-100 text-gray-500',
  }
  return (
    <foreignObject x={pos.x} y={pos.y} width={180} height={60}>
      <div
        className={`w-full h-full rounded-lg border-2 px-3 py-2 cursor-pointer shadow-sm hover:shadow-md transition-shadow bg-white ${isInCycle ? 'border-red-400' : 'border-gray-200 hover:border-primary'}`}
        onClick={onClick}
        title={`Open ${node.name}`}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="text-xs font-semibold text-gray-800 truncate flex-1">{node.name}</div>
          {isInCycle && <IconWarning size={11} className="text-red-400 shrink-0 mt-0.5" />}
        </div>
        <div className="flex items-center gap-1 mt-1">
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${modeColor[node.output_mode] || 'bg-gray-100 text-gray-600'}`}>{node.output_mode}</span>
          {node.output_table && <span className="text-xs text-gray-400 truncate">{node.output_table.split('.').pop()}</span>}
        </div>
      </div>
    </foreignObject>
  )
}

function LineageNodeCard({ node, pos, onClick }: {
  node: LineageNode; pos: { x: number; y: number }; onClick?: () => void
}) {
  const isTable = node.type !== 'pipeline'
  const W = isTable ? 160 : 180
  const H = isTable ? 44 : 56

  const bgClass =
    node.type === 'source' ? 'bg-blue-50 border-blue-300' :
    node.type === 'output' ? 'bg-green-50 border-green-300' :
    node.type === 'intermediate' ? 'bg-amber-50 border-amber-300' :
    'bg-white border-gray-200 hover:border-primary cursor-pointer'

  const icon =
    node.type === 'source' ? <IconEntityNamespace size={11} className="text-blue-500 shrink-0" /> :
    node.type === 'output' ? <IconEntityNamespace size={11} className="text-green-500 shrink-0" /> :
    node.type === 'intermediate' ? <IconEntityNamespace size={11} className="text-amber-500 shrink-0" /> :
    <Layers size={11} className="text-navy-600 shrink-0" />

  const modeColor: Record<string, string> = {
    ctas: 'bg-blue-100 text-blue-700', incremental: 'bg-purple-100 text-purple-700',
    scd2: 'bg-orange-100 text-orange-700', view: 'bg-teal-100 text-teal-700',
    insert: 'bg-amber-100 text-amber-700',
  }

  return (
    <foreignObject x={pos.x} y={pos.y} width={W} height={H}>
      <div
        className={`w-full h-full rounded-lg border-2 px-2.5 py-1.5 shadow-sm transition-shadow ${bgClass} ${onClick ? 'hover:shadow-md' : ''}`}
        onClick={onClick}
        title={node.label}
      >
        <div className="flex items-center gap-1.5">
          {icon}
          <div className="text-xs font-medium text-gray-800 truncate flex-1">{node.label.split('.').pop()}</div>
        </div>
        {node.type === 'pipeline' && node.output_mode && (
          <div className="mt-1">
            <span className={`text-xs px-1 py-0.5 rounded ${modeColor[node.output_mode] || 'bg-gray-100 text-gray-500'}`}>{node.output_mode}</span>
          </div>
        )}
        {isTable && node.label.includes('.') && (
          <div className="text-xs text-gray-400 truncate">{node.label}</div>
        )}
      </div>
    </foreignObject>
  )
}

// ── Edge rendering ─────────────────────────────────────────────────────────────

function CurvedEdge({ x1, y1, x2, y2, color = '#9ca3af', dashed = false }: {
  x1: number; y1: number; x2: number; y2: number; color?: string; dashed?: boolean
}) {
  const mx = (x1 + x2) / 2
  return (
    <path
      d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
      fill="none" stroke={color} strokeWidth={1.5}
      strokeDasharray={dashed ? '4,3' : undefined}
      markerEnd="url(#arrowhead)"
    />
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PipelineDagView({ onClose, onSelectPipeline }: PipelineDagViewProps) {
  const [dag, setDag] = useState<PipelineDag | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('dag')

  async function load() {
    setLoading(true); setError(null)
    try { setDag(await fetchDag()) }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const cycleNodeIds = new Set(dag?.cycles.flat() || [])
  const dagPositions = dag ? computeDagLayout(dag) : new Map<string, { x: number; y: number }>()
  const lineagePositions = dag ? computeLineageLayout(dag) : new Map<string, { x: number; y: number }>()

  function svgSize(positions: Map<string, { x: number; y: number }>, nodeW = 180, nodeH = 60) {
    if (positions.size === 0) return { w: 800, h: 400 }
    const xs = [...positions.values()].map(p => p.x)
    const ys = [...positions.values()].map(p => p.y)
    return { w: Math.max(800, Math.max(...xs) + nodeW + 40), h: Math.max(400, Math.max(...ys) + nodeH + 40) }
  }

  const { w: svgW, h: svgH } = viewMode === 'dag'
    ? svgSize(dagPositions)
    : svgSize(lineagePositions, 160, 50)

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl flex flex-col w-full max-w-6xl max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-navy-800 text-white shrink-0">
          <div className="flex items-center gap-3">
            <GitBranch size={16} />
            <span className="font-semibold text-sm">Pipeline Graph</span>
            {/* View toggle */}
            <div className="flex bg-white/15 rounded-lg p-0.5 ml-2">
              <button
                onClick={() => setViewMode('dag')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === 'dag' ? 'bg-primary text-white' : 'text-white/60 hover:text-white'}`}
              >
                <GitBranch size={11} /> Dependency DAG
              </button>
              <button
                onClick={() => setViewMode('lineage')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === 'lineage' ? 'bg-primary text-white' : 'text-white/60 hover:text-white'}`}
              >
                <Shuffle size={11} /> Data Lineage
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dag && (
              <span className="text-xs text-white/60">
                {dag.nodes.length} pipeline{dag.nodes.length !== 1 ? 's' : ''}
                {viewMode === 'lineage' && ` · ${dag.lineage_nodes.filter(n => n.type !== 'pipeline').length} tables`}
              </span>
            )}
            {dag?.cycles.length ? (
              <span className="flex items-center gap-1 text-xs bg-red-500 text-white px-2 py-0.5 rounded">
                <IconWarning size={11} /> {dag.cycles.length} cycle(s)
              </span>
            ) : dag ? (
              <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">No cycles</span>
            ) : null}
            {dag && viewMode === 'dag' && dag.parallel_levels.length > 1 && (
              <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded">
                {dag.parallel_levels.length} parallel levels
              </span>
            )}
            <button onClick={load} disabled={loading} className="text-white/60 hover:text-white disabled:opacity-50" title="Refresh">
              <IconRefresh size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="text-white/60 hover:text-white"><IconClose size={16} /></button>
          </div>
        </div>

        {/* Legend */}
        {viewMode === 'lineage' && (
          <div className="flex items-center gap-4 px-5 py-1.5 bg-gray-50 border-b border-gray-200 shrink-0 text-xs text-gray-600">
            <span className="font-medium">Legend:</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-300 inline-block" /> Source table</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-300 inline-block" /> Intermediate table</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 border border-green-300 inline-block" /> Output table</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-white border-2 border-gray-200 inline-block" /> Pipeline</span>
          </div>
        )}
        {viewMode === 'dag' && dag && dag.parallel_levels.length > 1 && (
          <div className="flex items-center gap-3 px-5 py-1.5 bg-gray-50 border-b border-gray-200 shrink-0 text-xs text-gray-600 overflow-x-auto">
            <span className="font-medium shrink-0">Parallel levels:</span>
            {dag.parallel_levels.map((level, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ArrowRight size={10} className="text-gray-400 shrink-0" />}
                <span className="bg-purple-50 border border-purple-200 rounded px-2 py-0.5 whitespace-nowrap">
                  L{i}: {level.map(id => dag.nodes.find(n => n.id === id)?.name || id).join(', ')}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 overflow-auto bg-gray-50 p-4">
          {loading && (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              <IconRefresh size={16} className="animate-spin mr-2" /> Loading...
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-48 text-red-500 text-sm gap-2">
              <IconWarning size={16} /> {error}
            </div>
          )}
          {!loading && !error && dag && dag.nodes.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm gap-2">
              <GitBranch size={32} className="opacity-30" />
              No pipelines yet.
            </div>
          )}

          {!loading && !error && dag && dag.nodes.length > 0 && viewMode === 'dag' && (
            <div className="overflow-auto">
              <svg width={svgW} height={svgH} className="min-w-full">
                <defs>
                  <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                    <polygon points="0 0, 8 3, 0 6" fill="#6b7280" />
                  </marker>
                </defs>
                {dag.edges.map((edge, i) => {
                  const src = dagPositions.get(edge.source)
                  const tgt = dagPositions.get(edge.target)
                  if (!src || !tgt) return null
                  const isCycle = cycleNodeIds.has(edge.source) && cycleNodeIds.has(edge.target)
                  return (
                    <CurvedEdge key={i} x1={src.x + 180} y1={src.y + 30} x2={tgt.x} y2={tgt.y + 30}
                      color={isCycle ? '#ef4444' : '#9ca3af'} dashed={isCycle} />
                  )
                })}
                {dag.nodes.map(node => {
                  const pos = dagPositions.get(node.id)
                  if (!pos) return null
                  return (
                    <PipelineNodeCard key={node.id} node={node} pos={pos}
                      isInCycle={cycleNodeIds.has(node.id)}
                      onClick={() => { onSelectPipeline(node.id); onClose() }} />
                  )
                })}
              </svg>
            </div>
          )}

          {!loading && !error && dag && dag.lineage_nodes.length > 0 && viewMode === 'lineage' && (
            <div className="overflow-auto">
              <svg width={svgW} height={svgH} className="min-w-full">
                <defs>
                  <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                    <polygon points="0 0, 8 3, 0 6" fill="#6b7280" />
                  </marker>
                </defs>
                {dag.lineage_edges.map((edge, i) => {
                  const src = lineagePositions.get(edge.source)
                  const tgt = lineagePositions.get(edge.target)
                  if (!src || !tgt) return null
                  const srcNode = dag.lineage_nodes.find(n => n.id === edge.source)
                  const srcW = srcNode?.type !== 'pipeline' ? 160 : 180
                  const srcH = srcNode?.type !== 'pipeline' ? 22 : 28
                  return <CurvedEdge key={i} x1={src.x + srcW} y1={src.y + srcH} x2={tgt.x} y2={tgt.y + 22} />
                })}
                {dag.lineage_nodes.map(node => {
                  const pos = lineagePositions.get(node.id)
                  if (!pos) return null
                  return (
                    <LineageNodeCard key={node.id} node={node} pos={pos}
                      onClick={node.type === 'pipeline' && node.pipeline_id
                        ? () => { onSelectPipeline(node.pipeline_id!); onClose() }
                        : undefined} />
                  )
                })}
              </svg>
            </div>
          )}
        </div>

        {/* Footer: execution order */}
        {dag && dag.execution_order.length > 1 && viewMode === 'dag' && (
          <div className="border-t border-gray-200 px-5 py-2 bg-white flex items-center gap-2 overflow-x-auto shrink-0">
            <span className="text-xs text-gray-500 shrink-0 font-medium">Execution order:</span>
            {dag.execution_order.map((id, i) => {
              const node = dag.nodes.find(n => n.id === id)
              return (
                <React.Fragment key={id}>
                  {i > 0 && <ArrowRight size={10} className="text-gray-400 shrink-0" />}
                  <button
                    onClick={() => { onSelectPipeline(id); onClose() }}
                    className={`text-xs px-2 py-0.5 rounded shrink-0 hover:opacity-80 ${cycleNodeIds.has(id) ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700 hover:bg-primary/10 hover:text-primary'}`}
                  >
                    {node?.name || id}
                  </button>
                </React.Fragment>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
