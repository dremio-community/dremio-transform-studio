import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  GitPullRequest, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp,
  AlertTriangle, User, Calendar, MessageSquare, Plus, Minus,
} from 'lucide-react'
import {
  fetchApprovals,
  approveApproval,
  rejectApproval,
  submitPipelineReview,
} from '../api/client'
import type { PipelineApproval, TransformStep } from '../types'

interface Props {
  isAdmin: boolean
  currentPipelineId?: string
  currentPipelineName?: string
  currentSteps?: TransformStep[]
  pendingApprovalId?: string
  approvalRequired?: boolean
  onApproved?: () => void  // called when an approval is applied — triggers pipeline reload
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function StepDiff({
  proposed,
  current,
}: {
  proposed: TransformStep[]
  current: TransformStep[]
}) {
  // Simple diff: match by step id, flag added/removed/changed
  const currentById = new Map(current.map(s => [s.id, s]))
  const proposedById = new Map(proposed.map(s => [s.id, s]))

  const rows: { step: TransformStep; status: 'added' | 'removed' | 'changed' | 'unchanged' }[] = []

  for (const s of proposed) {
    const old = currentById.get(s.id)
    if (!old) {
      rows.push({ step: s, status: 'added' })
    } else if (JSON.stringify(s) !== JSON.stringify(old)) {
      rows.push({ step: s, status: 'changed' })
    } else {
      rows.push({ step: s, status: 'unchanged' })
    }
  }
  for (const s of current) {
    if (!proposedById.has(s.id)) {
      rows.push({ step: s, status: 'removed' })
    }
  }

  const changed = rows.filter(r => r.status !== 'unchanged')
  if (changed.length === 0) {
    return <p className="text-xs text-surface-500 italic">No step changes detected (metadata only)</p>
  }

  return (
    <div className="space-y-1">
      {rows.map((r, i) => {
        const label = r.step.label || r.step.transform_type
        const cfg = {
          added:     { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: <Plus size={10} className="text-emerald-400" />, text: 'text-emerald-300' },
          removed:   { bg: 'bg-red-500/10',     border: 'border-red-500/30',     icon: <Minus size={10} className="text-red-400" />,    text: 'text-red-300' },
          changed:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   icon: <AlertTriangle size={10} className="text-amber-400" />, text: 'text-amber-300' },
          unchanged: { bg: 'bg-transparent',    border: 'border-transparent',    icon: null,                                             text: 'text-surface-500' },
        }[r.status]

        return (
          <div key={r.step.id + i} className={`flex items-center gap-2 px-2 py-1.5 rounded border ${cfg.bg} ${cfg.border}`}>
            {cfg.icon && <span>{cfg.icon}</span>}
            <span className={`text-xs ${cfg.text} font-mono`}>{label}</span>
            {r.status !== 'unchanged' && (
              <span className="text-xs text-surface-500 ml-auto capitalize">{r.status}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ApprovalCard({
  approval,
  isAdmin,
  onApproved,
}: {
  approval: PipelineApproval
  isAdmin: boolean
  onApproved?: () => void
}) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [comments, setComments] = useState('')
  const [showComments, setShowComments] = useState(false)

  const approveMut = useMutation({
    mutationFn: () => approveApproval(approval.id, comments || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals'] })
      qc.invalidateQueries({ queryKey: ['pipelines'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onApproved?.()
    },
  })

  const rejectMut = useMutation({
    mutationFn: () => rejectApproval(approval.id, comments || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals'] })
    },
  })

  const isPending = approval.status === 'pending'
  const statusCfg = {
    pending:  { color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   icon: Clock },
    approved: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: CheckCircle2 },
    rejected: { color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     icon: XCircle },
  }[approval.status]

  const StatusIcon = statusCfg.icon

  return (
    <div className={`border rounded-xl overflow-hidden ${statusCfg.border} bg-navy-800`}>
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-navy-700/50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <StatusIcon size={15} className={statusCfg.color} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white text-sm font-medium truncate">{approval.pipeline_name}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusCfg.bg} ${statusCfg.color} shrink-0 capitalize`}>
              {approval.status}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-surface-500">
            <span className="flex items-center gap-1">
              <User size={10} /> {approval.submitted_by}
            </span>
            <span className="flex items-center gap-1">
              <Calendar size={10} /> {relativeTime(approval.submitted_at)}
            </span>
            <span>
              {approval.proposed_steps.length} step{approval.proposed_steps.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        {expanded ? <ChevronUp size={14} className="text-surface-500 shrink-0" /> : <ChevronDown size={14} className="text-surface-500 shrink-0" />}
      </div>

      {/* Expanded diff view */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-navy-700 pt-3 space-y-3">
          <div>
            <p className="text-xs font-medium text-surface-300 mb-2">Step Changes</p>
            <StepDiff proposed={approval.proposed_steps} current={approval.current_steps} />
          </div>

          {/* Reviewer notes (if resolved) */}
          {approval.comments && (
            <div className="p-2 bg-navy-700/50 rounded border border-navy-600">
              <p className="text-xs text-surface-400 mb-0.5 flex items-center gap-1">
                <MessageSquare size={10} /> {approval.reviewed_by} commented:
              </p>
              <p className="text-xs text-surface-300">{approval.comments}</p>
            </div>
          )}

          {/* Admin actions for pending approvals */}
          {isAdmin && isPending && (
            <div className="space-y-2 pt-1">
              {showComments && (
                <textarea
                  value={comments}
                  onChange={e => setComments(e.target.value)}
                  placeholder="Optional comments…"
                  className="w-full text-xs bg-navy-700 border border-navy-600 rounded-lg px-3 py-2 text-white placeholder-surface-500 resize-none focus:outline-none focus:border-dblue-500"
                  rows={2}
                />
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => approveMut.mutate()}
                  disabled={approveMut.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 size={12} />
                  {approveMut.isPending ? 'Approving…' : 'Approve'}
                </button>
                <button
                  onClick={() => rejectMut.mutate()}
                  disabled={rejectMut.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <XCircle size={12} />
                  {rejectMut.isPending ? 'Rejecting…' : 'Reject'}
                </button>
                <button
                  onClick={() => setShowComments(v => !v)}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-navy-700 hover:bg-navy-600 text-surface-400 hover:text-white text-xs transition-colors"
                >
                  <MessageSquare size={11} />
                  Comment
                </button>
              </div>
              {(approveMut.isError || rejectMut.isError) && (
                <p className="text-xs text-red-400">Action failed — try again</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Submit-for-review widget (shown in pipeline builder for non-admins) ────────

export function SubmitReviewButton({
  pipelineId,
  pipelineName,
  steps,
  pendingApprovalId,
  onSubmitted,
}: {
  pipelineId: string
  pipelineName: string
  steps: TransformStep[]
  pendingApprovalId?: string
  onSubmitted?: () => void
}) {
  const qc = useQueryClient()
  const [message, setMessage] = useState('')
  const [showMessage, setShowMessage] = useState(false)

  const submitMut = useMutation({
    mutationFn: () => submitPipelineReview(pipelineId, steps, message || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipelines'] })
      qc.invalidateQueries({ queryKey: ['approvals'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setMessage('')
      setShowMessage(false)
      onSubmitted?.()
    },
  })

  if (pendingApprovalId) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
        <Clock size={13} className="text-amber-400" />
        <span className="text-xs text-amber-300 font-medium">Review Pending</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {showMessage && (
        <input
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="What changed? (optional)"
          className="text-xs bg-navy-700 border border-navy-600 rounded px-2 py-1 text-white placeholder-surface-500 focus:outline-none focus:border-dblue-500 w-44"
          onKeyDown={e => e.key === 'Enter' && submitMut.mutate()}
        />
      )}
      <button
        onClick={() => (showMessage ? submitMut.mutate() : setShowMessage(true))}
        disabled={submitMut.isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
      >
        <GitPullRequest size={12} />
        {submitMut.isPending ? 'Submitting…' : showMessage ? 'Submit' : 'Submit for Review'}
      </button>
    </div>
  )
}

// ── Main panel (used in the right-panel tab) ──────────────────────────────────

export default function ApprovalPanel({ isAdmin, onApproved }: Props) {
  const [filter, setFilter] = useState<string | undefined>('pending')

  const { data: approvals = [], isLoading } = useQuery({
    queryKey: ['approvals', filter],
    queryFn: () => fetchApprovals(filter),
    refetchInterval: 15000,
  })

  const tabs: { label: string; value?: string }[] = [
    { label: 'Pending', value: 'pending' },
    { label: 'Approved', value: 'approved' },
    { label: 'Rejected', value: 'rejected' },
    { label: 'All', value: undefined },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Tab strip */}
      <div className="flex gap-1 px-3 pt-3 pb-2 border-b border-navy-700 shrink-0">
        {tabs.map(t => (
          <button
            key={t.label}
            onClick={() => setFilter(t.value)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              filter === t.value
                ? 'bg-dblue-500/20 text-dblue-400'
                : 'text-surface-400 hover:text-white hover:bg-navy-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <p className="text-xs text-surface-500 text-center mt-6">Loading…</p>
        ) : approvals.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-10 text-surface-500">
            <GitPullRequest size={22} className="mb-2 opacity-40" />
            <p className="text-xs">No {filter ?? ''} approvals</p>
          </div>
        ) : (
          approvals.map(a => (
            <ApprovalCard key={a.id} approval={a} isAdmin={isAdmin} onApproved={onApproved} />
          ))
        )}
      </div>
    </div>
  )
}
