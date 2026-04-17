import { useState, useEffect } from 'react'
import { Layers, Loader2, KeyRound } from 'lucide-react'
import { IconErrorCircle } from './icons'
import { login, setToken, fetchSsoProviders, type SsoProvider } from '../api/client'

interface LoginModalProps {
  onLogin: (user: { id: string; username: string; is_admin: boolean }) => void
}

export default function LoginModal({ onLogin }: LoginModalProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ssoProviders, setSsoProviders] = useState<SsoProvider[]>([])

  useEffect(() => {
    fetchSsoProviders()
      .then(setSsoProviders)
      .catch(() => {})
  }, [])

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

  const handleSsoLogin = (providerName: string) => {
    // Redirect browser to SSO auth URL; callback will redirect back with sso_token
    window.location.href = `/api/auth/sso/${providerName}/login`
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
          <p className="text-white/60 text-sm mt-1">for Dremio</p>
        </div>

        {/* SSO Buttons */}
        {ssoProviders.length > 0 && (
          <div className="mb-4 space-y-2">
            {ssoProviders.map((p) => (
              <button
                key={p.provider_name}
                onClick={() => handleSsoLogin(p.provider_name)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-navy-800 hover:bg-navy-700 border border-navy-700 text-white text-sm font-medium rounded-xl transition-colors"
              >
                <KeyRound size={14} className="text-primary" />
                Sign in with {p.display_name}
              </button>
            ))}

            {/* Divider */}
            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-navy-700" />
              <span className="mx-3 text-xs text-white/40">or</span>
              <div className="flex-grow border-t border-navy-700" />
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-navy-900 rounded-xl border border-navy-700 shadow-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-navy-800">
            <h2 className="text-sm font-semibold text-white">Sign In</h2>
            <p className="text-xs text-white/60 mt-0.5">Enter your credentials to continue</p>
          </div>
          <div className="px-6 py-5 space-y-4">
            {error && (
              <div className="flex items-center gap-2 bg-red-950/60 border border-red-800/50 rounded-lg px-3 py-2.5 text-xs text-red-400">
                <IconErrorCircle size={13} className="shrink-0" />
                {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1.5">Username</label>
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
              <label className="block text-xs font-medium text-white/70 mb-1.5">Password</label>
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
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-sidebar-primary text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

        <p className="text-center text-xs text-white/30 mt-4">
          Default credentials: admin / admin
        </p>
      </div>
    </div>
  )
}
