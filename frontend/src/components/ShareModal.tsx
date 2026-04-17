import React, { useState, useEffect } from 'react'
import { Share2, UserPlus, Loader2, Shield } from 'lucide-react'
import { IconCaretDown, IconClose, IconDelete, IconEdit, IconEyeShow } from './icons'
import clsx from 'clsx'
import {
  fetchPipelinePermissions,
  addPipelinePermission,
  removePipelinePermission,
  fetchUsers,
} from '../api/client'
import type { PipelinePermission, PipelinePermissionsResponse } from '../api/client'
import type { Pipeline } from '../types'

interface Props {
  pipeline: Pipeline
  currentUserId: string
  onClose: () => void
}

const ACCESS_LABELS: Record<string, { label: string; icon: React.ReactNode; description: string }> = {
  editor: {
    label: 'Editor',
    icon: <IconEdit size={13} />,
    description: 'Can view and edit the pipeline',
  },
  viewer: {
    label: 'Viewer',
    icon: <IconEyeShow size={13} />,
    description: 'Can view and run the pipeline',
  },
}

export default function ShareModal({ pipeline, currentUserId, onClose }: Props) {
  const [data, setData] = useState<PipelinePermissionsResponse | null>(null)
  const [allUsers, setAllUsers] = useState<{ id: string; username: string; role: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  // Add-user form state
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedAccess, setSelectedAccess] = useState<'viewer' | 'editor'>('viewer')
  const [addError, setAddError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [pipeline.id])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [perms, users] = await Promise.all([
        fetchPipelinePermissions(pipeline.id),
        fetchUsers(),
      ])
      setData(perms)
      setAllUsers(users)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load sharing info')
    } finally {
      setLoading(false)
    }
  }

  // Users that can still be added (not owner, not already granted)
  const grantedIds = new Set(data?.permissions.map((p) => p.user_id) ?? [])
  const addableUsers = allUsers.filter(
    (u) => u.id !== (data?.owner_id ?? currentUserId) && !grantedIds.has(u.id)
  )

  async function handleAdd() {
    if (!selectedUserId) return
    setAdding(true)
    setAddError(null)
    try {
      await addPipelinePermission(pipeline.id, selectedUserId, selectedAccess)
      setSelectedUserId('')
      setSelectedAccess('viewer')
      await load()
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : 'Failed to add user')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(perm: PipelinePermission) {
    setRemovingId(perm.user_id)
    try {
      await removePipelinePermission(pipeline.id, perm.user_id)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to remove user')
    } finally {
      setRemovingId(null)
    }
  }

  async function handleChangeAccess(perm: PipelinePermission, newLevel: 'viewer' | 'editor') {
    try {
      await addPipelinePermission(pipeline.id, perm.user_id, newLevel)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update access')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-navy-900 border border-white/10 rounded-xl shadow-2xl w-[520px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Share2 size={16} className="text-dblue-400" />
            <span className="font-semibold text-white text-sm">Share Pipeline</span>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80 transition-colors"
          >
            <IconClose size={16} />
          </button>
        </div>

        {/* Pipeline name */}
        <div className="px-5 py-3 border-b border-white/5 bg-white/[0.02]">
          <p className="text-xs text-white/40 mb-0.5">Pipeline</p>
          <p className="text-sm font-medium text-white">{pipeline.name}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-dblue-400" />
            </div>
          ) : error ? (
            <div className="text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2">{error}</div>
          ) : (
            <>
              {/* Owner */}
              <div>
                <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Owner</p>
                <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03]">
                  <div className="w-7 h-7 rounded-full bg-dblue-500/30 flex items-center justify-center text-dblue-400 text-xs font-bold">
                    {(data?.owner_username ?? 'O')[0].toUpperCase()}
                  </div>
                  <span className="text-sm text-white flex-1">{data?.owner_username ?? 'Unknown'}</span>
                  <span className="text-xs text-white/30 flex items-center gap-1">
                    <Shield size={11} /> Owner
                  </span>
                </div>
              </div>

              {/* Shared with */}
              <div>
                <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
                  Shared with ({data?.permissions.length ?? 0})
                </p>
                {data?.permissions.length === 0 ? (
                  <p className="text-xs text-white/30 italic px-3">
                    Not shared with anyone yet.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {data?.permissions.map((perm) => (
                      <div
                        key={perm.user_id}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.05] transition-colors group"
                      >
                        <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/60 text-xs font-bold">
                          {(perm.username ?? '?')[0].toUpperCase()}
                        </div>
                        <span className="text-sm text-white flex-1">{perm.username}</span>

                        {/* Access level selector */}
                        <div className="relative">
                          <select
                            value={perm.access_level}
                            onChange={(e) => handleChangeAccess(perm, e.target.value as 'viewer' | 'editor')}
                            className="text-xs bg-white/10 border border-white/10 rounded px-2 py-1 text-white/80 cursor-pointer appearance-none pr-5 focus:outline-none focus:border-dblue-500/50"
                          >
                            <option value="viewer">Viewer</option>
                            <option value="editor">Editor</option>
                          </select>
                          <IconCaretDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                        </div>

                        {/* Revoke */}
                        <button
                          onClick={() => handleRemove(perm)}
                          disabled={removingId === perm.user_id}
                          className="text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                          title="Revoke access"
                        >
                          {removingId === perm.user_id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <IconDelete size={14} />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add user */}
              <div>
                <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
                  Add people
                </p>
                <div className="flex gap-2">
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="flex-1 text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-dblue-500/50"
                  >
                    <option value="">Select user…</option>
                    {addableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.username}
                      </option>
                    ))}
                  </select>

                  <select
                    value={selectedAccess}
                    onChange={(e) => setSelectedAccess(e.target.value as 'viewer' | 'editor')}
                    className="text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-dblue-500/50"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>

                  <button
                    onClick={handleAdd}
                    disabled={!selectedUserId || adding}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      selectedUserId && !adding
                        ? 'bg-dblue-500 hover:bg-dblue-600 text-white'
                        : 'bg-white/5 text-white/30 cursor-not-allowed'
                    )}
                  >
                    {adding ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                    Share
                  </button>
                </div>
                {addError && (
                  <p className="text-red-400 text-xs mt-1.5">{addError}</p>
                )}
              </div>

              {/* Access level legend */}
              <div className="border-t border-white/5 pt-3">
                <p className="text-xs font-medium text-white/30 mb-2">Access levels</p>
                <div className="space-y-1">
                  {Object.entries(ACCESS_LABELS).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2 text-xs text-white/40">
                      <span className="text-white/50">{val.icon}</span>
                      <span className="font-medium text-white/50">{val.label}</span>
                      <span>— {val.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-white/60 hover:text-white transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
