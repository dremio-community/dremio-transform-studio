import { useState } from 'react'
import { Layers, AlertCircle, Loader2 } from 'lucide-react'
import { login, setToken } from '../api/client'

interface LoginModalProps {
  onLogin: (user: { id: string; username: string; is_admin: boolean }) => void
}

export default function LoginModal({ onLogin }: LoginModalProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault()
    if (!username.trim() || !password) return
    setError(null)
    setLoading(true)
    try {
      const result = await login(username.trim(), password)
      setToken(result.token)
      onLogin(result.user)
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Login failed'
      setError(typeof msg === 'string' ? msg : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950">
      <div className="w-full max-w-sm mx-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-dblue-500 flex items-center justify-center mb-4 shadow-lg">
            <Layers size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Transform Studio</h1>
          <p className="text-surface-400 text-sm mt-1">for Dremio</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-navy-900 rounded-xl border border-navy-700 shadow-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-navy-800">
            <h2 className="text-sm font-semibold text-white">Sign In</h2>
            <p className="text-xs text-surface-400 mt-0.5">Enter your credentials to continue</p>
          </div>
          <div className="px-6 py-5 space-y-4">
            {error && (
              <div className="flex items-center gap-2 bg-red-950/60 border border-red-800/50 rounded-lg px-3 py-2.5 text-xs text-red-400">
                <AlertCircle size={13} className="shrink-0" />
                {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1.5">Username</label>
              <input
                autoFocus
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full px-3 py-2 text-sm bg-navy-800 border border-navy-700 rounded-lg text-white placeholder-surface-600 focus:outline-none focus:ring-2 focus:ring-dblue-500 focus:border-transparent transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-sm bg-navy-800 border border-navy-700 rounded-lg text-white placeholder-surface-600 focus:outline-none focus:ring-2 focus:ring-dblue-500 focus:border-transparent transition-colors"
              />
            </div>
          </div>
          <div className="px-6 pb-5">
            <button
              type="submit"
              disabled={loading || !username.trim() || !password}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-dblue-500 hover:bg-dblue-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </div>
        </form>

        <p className="text-center text-xs text-surface-600 mt-4">
          Default credentials: admin / admin
        </p>
      </div>
    </div>
  )
}
