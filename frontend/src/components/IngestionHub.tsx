import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Upload, Play, Pause, Trash2, RefreshCw, Database, ArrowLeft, Plus, X, AlertCircle, CheckCircle2, Clock, Zap, Link2, Radio } from 'lucide-react'
import { IconClose, IconCaretDown, IconEntityTable, IconEntityNamespace, IconEntityFolderBlue, IconSearch } from './icons'
import clsx from 'clsx'
import {
  fetchIngestionJobs, runCopyInto, deleteIngestionJob,
  fetchIngestionPipes, createIngestionPipe, deleteIngestionPipe,
  pauseIngestionPipe, resumeIngestionPipe, triggerIngestionPipe,
  fetchNamespaces, fetchTables,
  type IngestionJob, type IngestionPipe,
} from '../api/client'
import type { CatalogEntry } from '../types'

type Tab = 'jobs' | 'pipes' | 'upload' | 'dremio_load' | 'dremio_cdc'

interface Props {
  onClose: () => void
  loadTriggerUrl?: string
  loadTriggerJobId?: string
  cdcTriggerUrl?: string
  onLoadTriggerChange?: (url: string, jobId: string) => void
  onCdcTriggerChange?: (url: string) => void
  pipelineName?: string
}

export default function IngestionHub({ onClose, loadTriggerUrl = '', loadTriggerJobId = '', cdcTriggerUrl = '', onLoadTriggerChange, onCdcTriggerChange, pipelineName }: Props) {
  const [tab, setTab] = useState<Tab>('jobs')

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0f1923]">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10 shrink-0">
        <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors">
          <ArrowLeft size={16} />
        </button>
        <Zap size={18} className="text-primary" />
        <h1 className="text-base font-semibold text-white">Ingestion Hub</h1>
        <span className="text-xs text-white/40 ml-1">Load data into Dremio Iceberg tables</span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 px-6 pt-4 shrink-0">
        {([
          { id: 'jobs', label: 'COPY INTO Jobs', icon: <Database size={13} /> },
          { id: 'pipes', label: 'Continuous Pipes', icon: <RefreshCw size={13} /> },
          { id: 'upload', label: 'File Upload', icon: <Upload size={13} /> },
          { id: 'dremio_load', label: 'Dremio Load', icon: <Link2 size={13} /> },
          { id: 'dremio_cdc', label: 'Dremio CDC', icon: <Radio size={13} /> },
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-t-lg text-xs font-semibold transition-colors',
              tab === t.id
                ? 'bg-navy-800 text-white border border-white/10 border-b-navy-800'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5'
            )}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden bg-navy-800 border-t border-white/10">
        {tab === 'jobs' && <CopyJobsTab />}
        {tab === 'pipes' && <PipesTab />}
        {tab === 'upload' && <FileUploadTab />}
        {tab === 'dremio_load' && (
          <DremioLoadTab
            url={loadTriggerUrl}
            jobId={loadTriggerJobId}
            onChange={onLoadTriggerChange}
            pipelineName={pipelineName}
          />
        )}
        {tab === 'dremio_cdc' && (
          <DremioCdcTab
            url={cdcTriggerUrl}
            onChange={onCdcTriggerChange}
            pipelineName={pipelineName}
          />
        )}
      </div>
    </div>
  )
}

// ── Shared catalog picker ──────────────────────────────────────────────────

function CatalogPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="e.g. my_source.my_table"
          className="flex-1 px-3 py-2 text-xs bg-navy-900 border border-white/15 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="px-3 py-2 text-xs bg-navy-900 border border-white/15 rounded-lg text-white/60 hover:text-white hover:border-primary transition-colors"
        >
          Browse
        </button>
      </div>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-navy-900 border border-white/15 rounded-lg shadow-xl max-h-56 overflow-y-auto">
          <CatalogTree onSelect={t => { onChange(t); setOpen(false) }} />
        </div>
      )}
    </div>
  )
}

function CatalogTree({ onSelect }: { onSelect: (t: string) => void }) {
  const [search, setSearch] = useState('')
  const { data: namespaces = [], isLoading } = useQuery({
    queryKey: ['namespaces-ingestion'],
    queryFn: fetchNamespaces,
    staleTime: 60_000,
  })
  const filtered = search ? namespaces.filter(n => n.toLowerCase().includes(search.toLowerCase())) : namespaces
  return (
    <div className="p-2">
      <div className="relative mb-1.5">
        <IconSearch size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/40" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
          className="w-full pl-6 pr-2 py-1 text-xs bg-navy-800 border border-white/10 rounded text-white placeholder-white/30 focus:outline-none" />
      </div>
      {isLoading ? <div className="text-xs text-white/50 p-2">Loading…</div>
        : filtered.map(ns => <CatalogNode key={ns} name={ns} path={ns} isNamespace onSelect={onSelect} />)}
    </div>
  )
}

function CatalogNode({ name, path, isNamespace, type, onSelect }: {
  name: string; path: string; isNamespace?: boolean; type?: 'DATASET' | 'CONTAINER'; onSelect: (t: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isContainer = isNamespace || type === 'CONTAINER'
  const { data: children = [], isLoading } = useQuery({
    queryKey: ['catalog-children-ingestion', path],
    queryFn: () => fetchTables(path),
    enabled: expanded && isContainer,
    staleTime: 60_000,
  })
  if (!isContainer) {
    return (
      <button onClick={() => onSelect(path)}
        className="w-full flex items-center gap-1.5 px-2 py-1 rounded hover:bg-primary/20 text-left">
        <IconEntityTable size={10} className="text-white/50 shrink-0" />
        <span className="text-xs text-white/70 truncate">{name}</span>
      </button>
    )
  }
  return (
    <div>
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/5 text-left">
        <IconCaretDown size={10} className={clsx('text-white/50 shrink-0 transition-transform', !expanded && '-rotate-90')} />
        {isNamespace ? <IconEntityNamespace size={10} className="text-primary shrink-0" />
          : <IconEntityFolderBlue size={10} className="shrink-0" />}
        <span className="text-xs text-white truncate">{name}</span>
        {isLoading && <Loader2 size={9} className="animate-spin text-white/40 ml-auto" />}
      </button>
      {expanded && !isLoading && (
        <div className="ml-4 border-l border-white/10 pl-1">
          {children.length === 0
            ? <div className="text-xs text-white/40 px-2 py-1 italic">Empty</div>
            : children.map((c: CatalogEntry) => (
                <CatalogNode key={c.name} name={c.name} path={`${path}.${c.name}`} type={c.type} onSelect={onSelect} />
              ))}
        </div>
      )}
    </div>
  )
}

// ── Copy Jobs tab ──────────────────────────────────────────────────────────

const FILE_FORMATS = ['PARQUET', 'JSON', 'CSV', 'AVRO', 'ORC', 'DELTA', 'ICEBERG']

function CopyJobsTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', source_path: '', target_table: '', file_format: 'PARQUET', on_error: 'CONTINUE' })

  const { data: jobs = [], isLoading } = useQuery({ queryKey: ['ingestion-jobs'], queryFn: fetchIngestionJobs })

  const runMut = useMutation({
    mutationFn: () => runCopyInto({ ...form, options: { on_error: form.on_error } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ingestion-jobs'] }); setShowForm(false); setForm({ name: '', source_path: '', target_table: '', file_format: 'PARQUET', on_error: 'CONTINUE' }) },
  })

  const deleteMut = useMutation({
    mutationFn: deleteIngestionJob,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ingestion-jobs'] }),
  })

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 shrink-0">
        <div>
          <p className="text-sm font-semibold text-white">COPY INTO Jobs</p>
          <p className="text-xs text-white/50 mt-0.5">One-shot batch loads from cloud storage or Dremio catalog paths into Iceberg tables</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-xs font-semibold rounded-lg transition-colors">
          <Plus size={13} /> Run COPY INTO
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="mx-6 my-4 p-5 bg-navy-900 border border-white/15 rounded-xl shrink-0">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-white">New COPY INTO Job</span>
            <button onClick={() => setShowForm(false)} className="text-white/40 hover:text-white"><X size={14} /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/60 mb-1">Job Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Auto-generated if blank"
                className="w-full px-3 py-2 text-xs bg-navy-800 border border-white/15 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">File Format</label>
              <select value={form.file_format} onChange={e => setForm(f => ({ ...f, file_format: e.target.value }))}
                className="w-full px-3 py-2 text-xs bg-navy-800 border border-white/15 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-primary">
                {FILE_FORMATS.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-white/60 mb-1">Source Path <span className="text-white/30">(S3/ADLS/GCS URI or Dremio catalog path)</span></label>
              <input value={form.source_path} onChange={e => setForm(f => ({ ...f, source_path: e.target.value }))}
                placeholder="s3://my-bucket/data/orders/*.parquet"
                className="w-full px-3 py-2 text-xs bg-navy-800 border border-white/15 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-white/60 mb-1">Target Table</label>
              <CatalogPicker value={form.target_table} onChange={v => setForm(f => ({ ...f, target_table: v }))} />
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">On Error</label>
              <select value={form.on_error} onChange={e => setForm(f => ({ ...f, on_error: e.target.value }))}
                className="w-full px-3 py-2 text-xs bg-navy-800 border border-white/15 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="CONTINUE">CONTINUE (skip bad rows)</option>
                <option value="ABORT">ABORT (fail on first error)</option>
              </select>
            </div>
          </div>
          {runMut.error && (
            <div className="mt-3 flex items-center gap-2 text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">
              <AlertCircle size={12} /> {String(runMut.error)}
            </div>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-xs text-white/60 hover:text-white transition-colors">Cancel</button>
            <button onClick={() => runMut.mutate()}
              disabled={!form.source_path || !form.target_table || runMut.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {runMut.isPending ? <><Loader2 size={12} className="animate-spin" /> Running…</> : <><Play size={12} /> Run Now</>}
            </button>
          </div>
        </div>
      )}

      {/* Jobs table */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-white/50 p-4"><Loader2 size={13} className="animate-spin" /> Loading jobs…</div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-white/30">
            <Database size={32} className="mb-3 opacity-40" />
            <p className="text-sm">No jobs yet</p>
            <p className="text-xs mt-1">Run a COPY INTO job to load data from cloud storage</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-white/40 uppercase tracking-wider text-[10px]">
                <th className="text-left pb-2 font-semibold">Job</th>
                <th className="text-left pb-2 font-semibold">Source</th>
                <th className="text-left pb-2 font-semibold">Target</th>
                <th className="text-left pb-2 font-semibold">Format</th>
                <th className="text-right pb-2 font-semibold">Rows</th>
                <th className="text-left pb-2 font-semibold pl-3">Status</th>
                <th className="text-right pb-2 font-semibold">Started</th>
                <th className="w-8 pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {jobs.map(job => (
                <tr key={job.id} className="hover:bg-white/3 group">
                  <td className="py-2.5 text-white font-medium">{job.name}</td>
                  <td className="py-2.5 text-white/50 max-w-[180px] truncate font-mono text-[10px]">{job.source_path}</td>
                  <td className="py-2.5 text-white/70">{job.target_table}</td>
                  <td className="py-2.5 text-white/50">{job.file_format}</td>
                  <td className="py-2.5 text-right text-white/70">
                    {job.rows_inserted != null ? job.rows_inserted.toLocaleString() : '—'}
                    {job.rows_skipped ? <span className="text-amber-400 ml-1">({job.rows_skipped} skipped)</span> : null}
                  </td>
                  <td className="py-2.5 pl-3"><JobStatusBadge job={job} /></td>
                  <td className="py-2.5 text-right text-white/40">{job.started_at ? new Date(job.started_at).toLocaleString() : '—'}</td>
                  <td className="py-2.5 text-right">
                    <button onClick={() => deleteMut.mutate(job.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-white/40 hover:text-red-400 transition-all">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function JobStatusBadge({ job }: { job: IngestionJob }) {
  if (job.status === 'running') return <span className="flex items-center gap-1 text-blue-400"><Loader2 size={11} className="animate-spin" /> Running</span>
  if (job.status === 'success') return <span className="flex items-center gap-1 text-green-400"><CheckCircle2 size={11} /> Success</span>
  return (
    <span className="flex items-center gap-1 text-red-400" title={job.error_message ?? ''}>
      <AlertCircle size={11} /> Failed
    </span>
  )
}

// ── Pipes tab ──────────────────────────────────────────────────────────────

function PipesTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const emptyForm = { name: '', source_location: '', source_path: '', target_table: '', file_format: 'PARQUET', dedup_lookback_period: 14, notification_provider: 'AWS_SQS', notification_queue_reference: '' }
  const [form, setForm] = useState(emptyForm)

  const { data: pipes = [], isLoading } = useQuery({ queryKey: ['ingestion-pipes'], queryFn: fetchIngestionPipes })

  const createMut = useMutation({
    mutationFn: () => createIngestionPipe(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ingestion-pipes'] }); setShowForm(false); setForm(emptyForm) },
  })
  const deleteMut = useMutation({ mutationFn: deleteIngestionPipe, onSuccess: () => qc.invalidateQueries({ queryKey: ['ingestion-pipes'] }) })
  const pauseMut = useMutation({ mutationFn: pauseIngestionPipe, onSuccess: () => qc.invalidateQueries({ queryKey: ['ingestion-pipes'] }) })
  const resumeMut = useMutation({ mutationFn: resumeIngestionPipe, onSuccess: () => qc.invalidateQueries({ queryKey: ['ingestion-pipes'] }) })
  const triggerMut = useMutation({ mutationFn: triggerIngestionPipe, onSuccess: () => qc.invalidateQueries({ queryKey: ['ingestion-pipes'] }) })

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 shrink-0">
        <div>
          <p className="text-sm font-semibold text-white">Continuous Pipes</p>
          <p className="text-xs text-white/50 mt-0.5">Dremio Enterprise &amp; Cloud — continuously ingest new files from cloud storage as they arrive</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-xs font-semibold rounded-lg transition-colors">
          <Plus size={13} /> Create Pipe
        </button>
      </div>

      {showForm && (
        <div className="mx-6 my-4 p-5 bg-navy-900 border border-white/15 rounded-xl shrink-0">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-white">New Pipe</span>
            <button onClick={() => setShowForm(false)} className="text-white/40 hover:text-white"><X size={14} /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/60 mb-1">Pipe Name <span className="text-white/30">(SQL identifier)</span></label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="orders_pipe"
                className="w-full px-3 py-2 text-xs bg-navy-800 border border-white/15 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">File Format</label>
              <select value={form.file_format} onChange={e => setForm(f => ({ ...f, file_format: e.target.value }))}
                className="w-full px-3 py-2 text-xs bg-navy-800 border border-white/15 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-primary">
                {FILE_FORMATS.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">Dremio Source Name <span className="text-white/30">(pre-configured S3 source)</span></label>
              <input value={form.source_location} onChange={e => setForm(f => ({ ...f, source_location: e.target.value }))}
                placeholder="s3_source"
                className="w-full px-3 py-2 text-xs bg-navy-800 border border-white/15 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">Folder Path <span className="text-white/30">(within source, optional)</span></label>
              <input value={form.source_path} onChange={e => setForm(f => ({ ...f, source_path: e.target.value }))}
                placeholder="/incoming/orders/"
                className="w-full px-3 py-2 text-xs bg-navy-800 border border-white/15 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-white/60 mb-1">Target Table <span className="text-white/30">(Iceberg)</span></label>
              <CatalogPicker value={form.target_table} onChange={v => setForm(f => ({ ...f, target_table: v }))} />
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">Notification Provider</label>
              <select value={form.notification_provider} onChange={e => setForm(f => ({ ...f, notification_provider: e.target.value }))}
                className="w-full px-3 py-2 text-xs bg-navy-800 border border-white/15 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="AWS_SQS">AWS SQS</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">Dedup Lookback <span className="text-white/30">(days, 0–90)</span></label>
              <input type="number" min={0} max={90} value={form.dedup_lookback_period}
                onChange={e => setForm(f => ({ ...f, dedup_lookback_period: Number(e.target.value) }))}
                className="w-full px-3 py-2 text-xs bg-navy-800 border border-white/15 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-white/60 mb-1">SQS Queue ARN <span className="text-white/30">(notification_queue_reference)</span></label>
              <input value={form.notification_queue_reference} onChange={e => setForm(f => ({ ...f, notification_queue_reference: e.target.value }))}
                placeholder="arn:aws:sqs:us-east-1:123456789012:my-queue"
                className="w-full px-3 py-2 text-xs bg-navy-800 border border-white/15 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>
          {createMut.error && (
            <div className="mt-3 flex items-center gap-2 text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">
              <AlertCircle size={12} /> {String(createMut.error)}
            </div>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-xs text-white/60 hover:text-white transition-colors">Cancel</button>
            <button onClick={() => createMut.mutate()}
              disabled={!form.name || !form.source_location || !form.target_table || !form.notification_queue_reference || createMut.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {createMut.isPending ? <><Loader2 size={12} className="animate-spin" /> Creating…</> : <><Plus size={12} /> Create Pipe</>}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-white/50 p-4"><Loader2 size={13} className="animate-spin" /> Loading pipes…</div>
        ) : pipes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-white/30">
            <RefreshCw size={32} className="mb-3 opacity-40" />
            <p className="text-sm">No pipes configured</p>
            <p className="text-xs mt-1">Requires Dremio Enterprise or Cloud with an Iceberg target table and AWS SQS notification</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pipes.map(pipe => (
              <div key={pipe.id} className="p-4 bg-navy-900 border border-white/10 rounded-xl">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className={clsx('w-2 h-2 rounded-full shrink-0', pipe.enabled ? 'bg-green-400' : 'bg-white/20')} />
                    <div>
                      <p className="text-sm font-semibold text-white">{pipe.name}</p>
                      <p className="text-xs text-white/40 font-mono mt-0.5">@{pipe.source_location}{pipe.source_path} → {pipe.target_table}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => triggerMut.mutate(pipe.id)} disabled={triggerMut.isPending}
                      title="Trigger now" className="p-1.5 rounded text-white/50 hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40">
                      <Play size={13} />
                    </button>
                    {pipe.enabled
                      ? <button onClick={() => pauseMut.mutate(pipe.id)} title="Pause" className="p-1.5 rounded text-white/50 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"><Pause size={13} /></button>
                      : <button onClick={() => resumeMut.mutate(pipe.id)} title="Resume" className="p-1.5 rounded text-white/50 hover:text-green-400 hover:bg-green-400/10 transition-colors"><Play size={13} /></button>}
                    <button onClick={() => deleteMut.mutate(pipe.id)} title="Delete"
                      className="p-1.5 rounded text-white/50 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-2.5 text-xs text-white/40">
                  <span className="flex items-center gap-1"><Database size={10} /> {pipe.file_format}</span>
                  {pipe.notification_provider && <span>{pipe.notification_provider}</span>}
                  {pipe.dedup_lookback_period > 0 && <span>Dedup: {pipe.dedup_lookback_period}d</span>}
                  {pipe.last_triggered_at && <span className="flex items-center gap-1"><Clock size={10} /> Last: {new Date(pipe.last_triggered_at).toLocaleString()}</span>}
                  <span className={clsx('ml-auto font-medium', pipe.enabled ? 'text-green-400' : 'text-white/30')}>
                    {pipe.enabled ? 'Active' : 'Paused'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── File Upload tab ────────────────────────────────────────────────────────

interface ParsedRow { [k: string]: string }

function FileUploadTab() {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [tableName, setTableName] = useState('')
  const [targetTable, setTargetTable] = useState('')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const parseFile = (f: File) => {
    setFile(f)
    setResult(null)
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      if (f.name.endsWith('.json') || f.name.endsWith('.jsonl') || f.name.endsWith('.ndjson')) {
        parseJsonLines(text)
      } else {
        parseCsv(text)
      }
    }
    reader.readAsText(f)
    if (!tableName) setTableName(f.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_'))
  }

  const parseCsv = (text: string) => {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
    if (lines.length < 2) return
    const hdrs = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
    setHeaders(hdrs)
    setRows(lines.slice(1, 101).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      const row: ParsedRow = {}
      hdrs.forEach((h, i) => { row[h] = vals[i] ?? '' })
      return row
    }))
  }

  const parseJsonLines = (text: string) => {
    const parsed = text.trim().split('\n').map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    if (parsed.length === 0) return
    const hdrs = Object.keys(parsed[0])
    setHeaders(hdrs)
    setRows(parsed.slice(0, 100).map(r => {
      const row: ParsedRow = {}
      hdrs.forEach(h => { row[h] = String(r[h] ?? '') })
      return row
    }))
  }

  const handleUpload = async () => {
    if (!file || !targetTable) return
    setUploading(true)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('table_name', targetTable)
      const res = await fetch('/api/seeds', { method: 'POST', body: fd, headers: { Authorization: `Bearer ${localStorage.getItem('ts_token') ?? ''}` } })
      const data = await res.json()
      if (data.success) setResult({ ok: true, message: `Loaded ${data.rows_inserted} rows into ${data.table_name}` })
      else setResult({ ok: false, message: data.error || 'Upload failed' })
    } catch (e) {
      setResult({ ok: false, message: String(e) })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col h-full px-6 py-4 gap-4 overflow-y-auto">
      <div>
        <p className="text-sm font-semibold text-white mb-0.5">File Upload</p>
        <p className="text-xs text-white/50">Upload a CSV or JSON Lines file and load it directly into a Dremio table (up to 5,000 rows)</p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) parseFile(f) }}
        onClick={() => document.getElementById('ing-file-input')?.click()}
        className={clsx(
          'flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors',
          dragOver ? 'border-primary bg-primary/10' : 'border-white/15 hover:border-white/30 hover:bg-white/3'
        )}
      >
        <Upload size={28} className={clsx('transition-colors', dragOver ? 'text-primary' : 'text-white/30')} />
        <div className="text-center">
          <p className="text-sm text-white/70">{file ? file.name : 'Drop a file here or click to browse'}</p>
          <p className="text-xs text-white/40 mt-1">CSV · JSON Lines (.jsonl / .ndjson)</p>
        </div>
        <input id="ing-file-input" type="file" accept=".csv,.json,.jsonl,.ndjson" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f) }} />
      </div>

      {rows.length > 0 && (
        <>
          {/* Target table */}
          <div>
            <label className="block text-xs text-white/60 mb-1">Target Table <span className="text-white/30">(namespace.table_name)</span></label>
            <CatalogPicker value={targetTable || tableName} onChange={v => setTargetTable(v)} />
          </div>

          {/* Preview */}
          <div>
            <p className="text-xs text-white/50 mb-2">Preview — {rows.length} rows × {headers.length} columns (showing first 10)</p>
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="text-xs w-full">
                <thead className="bg-white/5">
                  <tr>{headers.map(h => <th key={h} className="px-3 py-2 text-left text-white/60 font-semibold whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {rows.slice(0, 10).map((row, i) => (
                    <tr key={i} className="hover:bg-white/3">
                      {headers.map(h => <td key={h} className="px-3 py-1.5 text-white/70 max-w-[120px] truncate whitespace-nowrap">{row[h]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {result && (
            <div className={clsx('flex items-center gap-2 text-xs px-3 py-2 rounded-lg', result.ok ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400')}>
              {result.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />} {result.message}
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={handleUpload} disabled={uploading || !targetTable}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {uploading ? <><Loader2 size={13} className="animate-spin" /> Uploading…</> : <><Upload size={13} /> Load into Dremio</>}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Dremio Load Tab ───────────────────────────────────────────────────────────

function DremioLoadTab({ url, jobId, onChange, pipelineName }: {
  url: string
  jobId: string
  onChange?: (url: string, jobId: string) => void
  pipelineName?: string
}) {
  const [localUrl, setLocalUrl] = useState(url)
  const [localJobId, setLocalJobId] = useState(jobId)
  const [triggering, setTriggering] = useState(false)
  const [triggerResult, setTriggerResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const isDirty = localUrl !== url || localJobId !== jobId

  function handleSave() {
    onChange?.(localUrl, localJobId)
    setTriggerResult(null)
  }

  async function handleTriggerNow() {
    if (!localUrl || !localJobId) return
    setTriggering(true)
    setTriggerResult(null)
    try {
      const res = await fetch(`${localUrl.replace(/\/$/, '')}/api/jobs/${encodeURIComponent(localJobId)}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        setTriggerResult({ ok: true, msg: 'Job triggered successfully.' })
      } else {
        const body = await res.json().catch(() => ({}))
        setTriggerResult({ ok: false, msg: body.error ?? `HTTP ${res.status}` })
      }
    } catch (e: unknown) {
      setTriggerResult({ ok: false, msg: e instanceof Error ? e.message : 'Network error' })
    } finally {
      setTriggering(false)
    }
  }

  return (
    <div className="p-8 max-w-xl">
      <div className="mb-6">
        <h2 className="text-white font-semibold text-sm mb-1">Dremio Load Trigger</h2>
        <p className="text-white/50 text-xs">
          Connect this pipeline to a <strong className="text-white/70">Dremio Load</strong> job. When you execute
          {pipelineName ? <> <span className="text-primary">{pipelineName}</span></> : ' this pipeline'}, Transform Studio
          will trigger the load job first and wait for it to complete before running the pipeline.
          If the load fails, execution is aborted.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-white/60 uppercase tracking-wider block mb-1.5">Dremio Load URL</label>
          <input
            className="w-full px-3 py-2 text-xs bg-navy-900 border border-white/15 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            placeholder="http://localhost:7071"
            value={localUrl}
            onChange={e => setLocalUrl(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-white/60 uppercase tracking-wider block mb-1.5">Load Job ID</label>
          <input
            className="w-full px-3 py-2 text-xs bg-navy-900 border border-white/15 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            placeholder="e.g. hubspot-contacts-load"
            value={localJobId}
            onChange={e => setLocalJobId(e.target.value)}
          />
          <p className="text-[10px] text-white/30 mt-1">The Job ID from your Dremio Load instance.</p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={!isDirty}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            Save to Pipeline
          </button>
          <button
            onClick={handleTriggerNow}
            disabled={!localUrl || !localJobId || triggering}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white text-xs font-semibold rounded-lg hover:bg-white/20 disabled:opacity-40 transition-colors"
          >
            {triggering ? <><Loader2 size={12} className="animate-spin" /> Triggering…</> : <><Play size={12} /> Trigger Now</>}
          </button>
        </div>

        {triggerResult && (
          <div className={clsx(
            'flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs',
            triggerResult.ok ? 'bg-emerald-950/60 text-emerald-300' : 'bg-red-950/60 text-red-300'
          )}>
            {triggerResult.ok ? <CheckCircle2 size={13} className="shrink-0 mt-0.5" /> : <AlertCircle size={13} className="shrink-0 mt-0.5" />}
            {triggerResult.msg}
          </div>
        )}

        {!localUrl && !localJobId && (
          <div className="mt-4 p-4 rounded-lg border border-white/10 bg-white/5 text-xs text-white/40">
            <p className="font-medium text-white/60 mb-1">Not configured</p>
            <p>Fill in the URL and Job ID above to link this pipeline to a Dremio Load job. The connection is saved per-pipeline.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Dremio CDC Tab ────────────────────────────────────────────────────────────

function DremioCdcTab({ url, onChange, pipelineName }: {
  url: string
  onChange?: (url: string) => void
  pipelineName?: string
}) {
  const [localUrl, setLocalUrl] = useState(url)
  const [checking, setChecking] = useState(false)
  const [starting, setStarting] = useState(false)
  const [status, setStatus] = useState<{ running: boolean; workers?: number } | null>(null)
  const [actionResult, setActionResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const isDirty = localUrl !== url

  function handleSave() {
    onChange?.(localUrl)
    setActionResult(null)
  }

  async function checkStatus() {
    if (!localUrl) return
    setChecking(true)
    setActionResult(null)
    try {
      const r = await fetch(`${localUrl.replace(/\/$/, '')}/api/status`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setStatus({ running: !!data.running, workers: data.workers?.length ?? 0 })
    } catch (e: unknown) {
      setActionResult({ ok: false, msg: e instanceof Error ? e.message : 'Connection failed' })
      setStatus(null)
    } finally {
      setChecking(false)
    }
  }

  async function handleStart() {
    if (!localUrl) return
    setStarting(true)
    setActionResult(null)
    try {
      const r = await fetch(`${localUrl.replace(/\/$/, '')}/api/engine/start`, { method: 'POST' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setActionResult({ ok: true, msg: 'CDC engine started.' })
      await checkStatus()
    } catch (e: unknown) {
      setActionResult({ ok: false, msg: e instanceof Error ? e.message : 'Failed to start engine' })
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="p-8 max-w-xl">
      <div className="mb-6">
        <h2 className="text-white font-semibold text-sm mb-1">Dremio CDC Pre-execution Check</h2>
        <p className="text-white/50 text-xs">
          Connect this pipeline to a <strong className="text-white/70">Dremio CDC</strong> instance.
          Before{pipelineName ? <> <span className="text-primary">{pipelineName}</span></> : ' this pipeline'} executes,
          Transform Studio will verify the CDC engine is running — and start it automatically if not.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-white/60 uppercase tracking-wider block mb-1.5">Dremio CDC URL</label>
          <input
            className="w-full px-3 py-2 text-xs bg-navy-900 border border-white/15 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            placeholder="http://localhost:8080"
            value={localUrl}
            onChange={e => { setLocalUrl(e.target.value); setStatus(null) }}
          />
          <p className="text-[10px] text-white/30 mt-1">The URL of your Dremio CDC instance.</p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleSave} disabled={!isDirty}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors">
            Save to Pipeline
          </button>
          <button onClick={checkStatus} disabled={!localUrl || checking}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white text-xs font-semibold rounded-lg hover:bg-white/20 disabled:opacity-40 transition-colors">
            {checking ? <><Loader2 size={12} className="animate-spin" /> Checking…</> : <><RefreshCw size={12} /> Check Status</>}
          </button>
          {status && !status.running && (
            <button onClick={handleStart} disabled={starting}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600/80 text-white text-xs font-semibold rounded-lg hover:bg-emerald-600 disabled:opacity-40 transition-colors">
              {starting ? <><Loader2 size={12} className="animate-spin" /> Starting…</> : <><Play size={12} /> Start Engine</>}
            </button>
          )}
        </div>

        {status && (
          <div className={clsx('flex items-start gap-3 px-4 py-3 rounded-lg text-xs', status.running ? 'bg-emerald-950/60 text-emerald-200' : 'bg-amber-950/60 text-amber-200')}>
            <div className={clsx('w-2 h-2 rounded-full mt-0.5 shrink-0', status.running ? 'bg-emerald-400' : 'bg-amber-400')} />
            <div>
              <p className="font-semibold">{status.running ? 'Engine running' : 'Engine stopped'}</p>
              {status.running && status.workers !== undefined && (
                <p className="text-white/50 mt-0.5">{status.workers} active worker{status.workers !== 1 ? 's' : ''}</p>
              )}
            </div>
          </div>
        )}

        {actionResult && (
          <div className={clsx('flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs', actionResult.ok ? 'bg-emerald-950/60 text-emerald-300' : 'bg-red-950/60 text-red-300')}>
            {actionResult.ok ? <CheckCircle2 size={13} className="shrink-0 mt-0.5" /> : <AlertCircle size={13} className="shrink-0 mt-0.5" />}
            {actionResult.msg}
          </div>
        )}

        {!localUrl && (
          <div className="mt-4 p-4 rounded-lg border border-white/10 bg-white/5 text-xs text-white/40">
            <p className="font-medium text-white/60 mb-1">Not configured</p>
            <p>Enter the CDC instance URL above. When set, Transform Studio will ensure the CDC engine is running before each execution.</p>
          </div>
        )}
      </div>
    </div>
  )
}
