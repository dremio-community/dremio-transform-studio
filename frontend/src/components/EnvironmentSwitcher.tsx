import React, { useState, useEffect, useRef } from 'react'
import { Server, Plus, Check, Pencil, Trash2, X, Loader2, ChevronDown } from 'lucide-react'
import type { Environment } from '../types'
import {
  fetchEnvironments,
  createEnvironment,
  updateEnvironment,
  deleteEnvironment,
  activateEnvironment,
} from '../api/client'

interface EnvironmentSwitcherProps {
  /** Called after activating an environment so the app can re-test the connection */
  onActivated?: () => void
}

const EMPTY_FORM: Omit<Environment, 'id' | 'is_active' | 'created_at'> = {
  name: '', host: '', port: 9047, ssl: false,
  auth_type: 'password', user: '', password: '', pat: '', project_id: '',
}

export default function EnvironmentSwitcher({ onActivated }: EnvironmentSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [showManage, setShowManage] = useState(false)
  const [envs, setEnvs] = useState<Environment[]>([])
  const [editing, setEditing] = useState<Environment | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [activating, setActivating] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const active = envs.find(e => e.is_active)

  useEffect(() => {
    fetchEnvironments().then(setEnvs).catch(() => {})
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const refresh = () => fetchEnvironments().then(setEnvs).catch(() => {})

  const handleActivate = async (env: Environment) => {
    setActivating(env.id)
    try {
      await activateEnvironment(env.id)
      await refresh()
      setOpen(false)
      onActivated?.()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setActivating(null)
    }
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.host.trim()) return
    setSaving(true)
    try {
      if (editing) {
        await updateEnvironment(editing.id, form)
      } else {
        await createEnvironment(form)
      }
      await refresh()
      setEditing(null)
      setForm({ ...EMPTY_FORM })
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (env: Environment) => {
    if (!confirm(`Delete environment "${env.name}"?`)) return
    await deleteEnvironment(env.id)
    await refresh()
  }

  const startEdit = (env: Environment) => {
    setEditing(env)
    setForm({
      name: env.name, host: env.host, port: env.port, ssl: env.ssl,
      auth_type: env.auth_type, user: env.user, password: env.password,
      pat: env.pat, project_id: env.project_id,
    })
  }

  const cancelEdit = () => { setEditing(null); setForm({ ...EMPTY_FORM }) }

  if (showManage) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-navy-900 border border-navy-700 rounded-xl shadow-2xl w-[560px] max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800">
            <div className="flex items-center gap-2">
              <Server size={15} className="text-dblue-400" />
              <h2 className="text-sm font-semibold text-white">Manage Environments</h2>
            </div>
            <button onClick={() => { setShowManage(false); cancelEdit() }} className="text-surface-400 hover:text-white">
              <X size={15} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {/* Environment list */}
            {envs.map(env => (
              <div key={env.id} className={`flex items-center justify-between p-3 rounded-lg border ${env.is_active ? 'border-dblue-500 bg-dblue-900/20' : 'border-navy-700 bg-navy-800'}`}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white font-medium">{env.name}</span>
                    {env.is_active && <span className="text-xs text-dblue-400 font-semibold">ACTIVE</span>}
                  </div>
                  <p className="text-xs text-surface-400">{env.host}:{env.port} · {env.auth_type}</p>
                </div>
                <div className="flex items-center gap-1">
                  {!env.is_active && (
                    <button
                      onClick={() => handleActivate(env)}
                      disabled={activating === env.id}
                      className="px-2 py-1 text-xs text-dblue-400 hover:text-white hover:bg-dblue-600 rounded transition-colors disabled:opacity-50"
                    >
                      {activating === env.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    </button>
                  )}
                  <button onClick={() => startEdit(env)} className="p-1 text-surface-400 hover:text-white rounded transition-colors">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => handleDelete(env)} className="p-1 text-surface-400 hover:text-red-400 rounded transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}

            {envs.length === 0 && !editing && (
              <p className="text-xs text-surface-400 text-center py-4">No environments saved. Add one below.</p>
            )}

            {/* Add/Edit form */}
            <div className="border border-navy-700 rounded-lg p-4 space-y-3">
              <h3 className="text-xs font-semibold text-surface-300">{editing ? `Edit: ${editing.name}` : 'Add Environment'}</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-surface-400 mb-1">Name</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="production"
                    className="w-full bg-navy-800 border border-navy-700 rounded px-2 py-1.5 text-xs text-white placeholder-surface-500 focus:outline-none focus:border-dblue-400" />
                </div>
                <div>
                  <label className="block text-xs text-surface-400 mb-1">Host</label>
                  <input value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
                    placeholder="dremio.mycompany.com"
                    className="w-full bg-navy-800 border border-navy-700 rounded px-2 py-1.5 text-xs text-white placeholder-surface-500 focus:outline-none focus:border-dblue-400" />
                </div>
                <div>
                  <label className="block text-xs text-surface-400 mb-1">Port</label>
                  <input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: parseInt(e.target.value) || 9047 }))}
                    className="w-full bg-navy-800 border border-navy-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-dblue-400" />
                </div>
                <div>
                  <label className="block text-xs text-surface-400 mb-1">Auth Type</label>
                  <select value={form.auth_type} onChange={e => setForm(f => ({ ...f, auth_type: e.target.value as 'password' | 'pat' }))}
                    className="w-full bg-navy-800 border border-navy-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-dblue-400">
                    <option value="password">Username / Password</option>
                    <option value="pat">Personal Access Token</option>
                  </select>
                </div>
                {form.auth_type === 'password' ? (
                  <>
                    <div>
                      <label className="block text-xs text-surface-400 mb-1">Username</label>
                      <input value={form.user} onChange={e => setForm(f => ({ ...f, user: e.target.value }))}
                        className="w-full bg-navy-800 border border-navy-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-dblue-400" />
                    </div>
                    <div>
                      <label className="block text-xs text-surface-400 mb-1">Password</label>
                      <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        className="w-full bg-navy-800 border border-navy-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-dblue-400" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="col-span-2">
                      <label className="block text-xs text-surface-400 mb-1">Personal Access Token</label>
                      <input type="password" value={form.pat} onChange={e => setForm(f => ({ ...f, pat: e.target.value }))}
                        className="w-full bg-navy-800 border border-navy-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-dblue-400" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-surface-400 mb-1">Project ID (Cloud only)</label>
                      <input value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        className="w-full bg-navy-800 border border-navy-700 rounded px-2 py-1.5 text-xs text-white placeholder-surface-500 focus:outline-none focus:border-dblue-400" />
                    </div>
                  </>
                )}
                <div className="col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="ssl" checked={form.ssl} onChange={e => setForm(f => ({ ...f, ssl: e.target.checked }))} className="rounded" />
                  <label htmlFor="ssl" className="text-xs text-surface-300">Use SSL/HTTPS</label>
                </div>
              </div>
              <div className="flex gap-2">
                {editing && (
                  <button onClick={cancelEdit} className="px-3 py-1.5 text-xs text-surface-400 hover:text-white rounded border border-navy-700 transition-colors">
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving || !form.name.trim() || !form.host.trim()}
                  className="px-4 py-1.5 text-xs font-semibold bg-dblue-500 hover:bg-dblue-400 text-white rounded disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                >
                  {saving && <Loader2 size={12} className="animate-spin" />}
                  {editing ? 'Save Changes' : 'Add Environment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Switch Environment"
        className="flex items-center gap-1.5 px-2 py-1 rounded text-surface-400 hover:text-white hover:bg-navy-700 transition-colors text-xs"
      >
        <Server size={13} />
        <span className="max-w-[80px] truncate">{active?.name ?? 'Default'}</span>
        <ChevronDown size={11} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-navy-900 border border-navy-700 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-navy-800">
            <p className="text-xs font-semibold text-surface-300">Environments</p>
          </div>
          {envs.length === 0 && (
            <p className="px-3 py-3 text-xs text-surface-500">No environments saved</p>
          )}
          {envs.map(env => (
            <button
              key={env.id}
              onClick={() => !env.is_active && handleActivate(env)}
              disabled={env.is_active || activating === env.id}
              className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-navy-800 transition-colors disabled:cursor-default"
            >
              <span className={env.is_active ? 'text-dblue-400 font-semibold' : 'text-surface-300'}>{env.name}</span>
              <span className="text-surface-500">{env.host}</span>
            </button>
          ))}
          <div className="border-t border-navy-800">
            <button
              onClick={() => { setOpen(false); setShowManage(true) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-surface-400 hover:text-white hover:bg-navy-800 transition-colors"
            >
              <Plus size={12} /> Manage Environments
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
