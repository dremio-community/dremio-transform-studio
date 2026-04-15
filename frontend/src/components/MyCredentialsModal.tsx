import React, { useState, useEffect } from 'react'
import { X, KeyRound, CheckCircle, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { fetchMyCredentials, updateMyCredentials } from '../api/client'

interface Props {
  onClose: () => void
}

export default function MyCredentialsModal({ onClose }: Props) {
  const [hasPat, setHasPat] = useState(false)
  const [patPreview, setPatPreview] = useState<string | null>(null)
  const [pat, setPat] = useState('')
  const [showPat, setShowPat] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchMyCredentials()
      .then((data) => {
        setHasPat(data.has_pat)
        setPatPreview(data.pat_preview)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    if (!pat.trim()) return
    setSaving(true)
    setMessage(null)
    try {
      await updateMyCredentials(pat.trim())
      setHasPat(true)
      setPatPreview(pat.trim().slice(0, 8) + '...')
      setPat('')
      setMessage({ type: 'success', text: 'Personal PAT saved. Your queries will now run under your Dremio identity.' })
    } catch (e: unknown) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Failed to save PAT' })
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await updateMyCredentials('')
      setHasPat(false)
      setPatPreview(null)
      setPat('')
      setMessage({ type: 'success', text: 'Personal PAT cleared. Queries will use the shared Dremio credentials.' })
    } catch (e: unknown) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Failed to clear PAT' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-navy-950 border border-navy-700 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-navy-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound size={15} className="text-dblue-400" />
            <span className="text-sm font-semibold text-white">My Dremio Credentials</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Explanation */}
          <p className="text-xs text-surface-400 leading-relaxed">
            Set your personal Dremio PAT (Personal Access Token) so your queries run under
            your Dremio identity instead of the shared service account. This applies to
            previews, executes, and all pipeline runs you trigger.
          </p>

          {/* Works for both Cloud and Software */}
          <div className="bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-xs text-surface-400">
            <span className="text-dblue-400 font-medium">Dremio Cloud:</span> Create a PAT under
            Account Settings → Personal Access Tokens.<br />
            <span className="text-dblue-400 font-medium">Dremio Software:</span> Create a PAT under
            your user profile → Personal Access Tokens (requires Dremio 25.x+). On older versions,
            leave this blank — the shared account will be used.
          </div>

          {/* Current status */}
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-surface-400">
              <Loader2 size={12} className="animate-spin" /> Loading...
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {hasPat ? (
                <>
                  <CheckCircle size={13} className="text-emerald-400 shrink-0" />
                  <span className="text-xs text-surface-300">
                    PAT set — <span className="font-mono text-surface-400">{patPreview}</span>
                  </span>
                  <button
                    onClick={handleClear}
                    disabled={saving}
                    className="ml-auto text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                  >
                    Clear PAT
                  </button>
                </>
              ) : (
                <>
                  <AlertCircle size={13} className="text-amber-400 shrink-0" />
                  <span className="text-xs text-surface-400">No personal PAT set — using shared credentials</span>
                </>
              )}
            </div>
          )}

          {/* PAT input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-surface-300">
              {hasPat ? 'Replace PAT' : 'Enter PAT'}
            </label>
            <div className="relative">
              <input
                type={showPat ? 'text' : 'password'}
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && pat.trim() && handleSave()}
                placeholder="dremio_pat_..."
                className="w-full bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 pr-9 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-dblue-500"
              />
              <button
                type="button"
                onClick={() => setShowPat((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
              >
                {showPat ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>

          {/* Message */}
          {message && (
            <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${
              message.type === 'success'
                ? 'bg-emerald-950 border border-emerald-800 text-emerald-300'
                : 'bg-red-950 border border-red-800 text-red-300'
            }`}>
              {message.type === 'success'
                ? <CheckCircle size={12} className="mt-0.5 shrink-0" />
                : <AlertCircle size={12} className="mt-0.5 shrink-0" />}
              {message.text}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-surface-400 hover:text-white transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={!pat.trim() || saving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-dblue-500 hover:bg-dblue-600 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
            >
              {saving && <Loader2 size={11} className="animate-spin" />}
              Save PAT
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
