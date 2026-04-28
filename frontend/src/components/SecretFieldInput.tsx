import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import clsx from 'clsx'

type SecretMode = 'direct' | 'env' | 'vault'

function detectMode(value: string): SecretMode {
  if (value.startsWith('vault:')) return 'vault'
  if (value.startsWith('${')) return 'env'
  return 'direct'
}

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  hint?: string
  className?: string
}

export default function SecretFieldInput({ value, onChange, placeholder, label, hint, className }: Props) {
  const [show, setShow] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  const mode = detectMode(value)

  const switchMode = (next: SecretMode) => {
    setShowMenu(false)
    if (next === mode) return
    if (next === 'env') onChange('${')
    else if (next === 'vault') onChange('vault:secret/myapp#field')
    else onChange('')
  }

  const modeLabel: Record<SecretMode, string> = { direct: 'Direct', env: 'Env Var', vault: 'Vault' }
  const modeBadgeClass: Record<SecretMode, string> = {
    direct: 'text-gray-400 hover:text-gray-600',
    env: 'text-amber-600 hover:text-amber-700',
    vault: 'text-purple-600 hover:text-purple-700',
  }

  const isObscured = mode === 'direct'

  return (
    <div className={className}>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-semibold text-gray-500">{label}</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMenu(v => !v)}
              className={clsx('text-[10px] font-semibold flex items-center gap-0.5 transition-colors', modeBadgeClass[mode])}
            >
              ● {modeLabel[mode]} ▾
            </button>
            {showMenu && (
              <div className="absolute z-50 right-0 top-full mt-0.5 bg-white border border-gray-200 rounded shadow-lg min-w-[140px]">
                {(['direct', 'env', 'vault'] as SecretMode[]).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchMode(m)}
                    className={clsx(
                      'block w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors',
                      m === mode ? 'font-semibold' : '',
                      modeBadgeClass[m]
                    )}
                  >
                    {modeLabel[m]}
                    <span className="block text-gray-400 font-normal text-[10px] mt-0.5">
                      {m === 'direct' && 'Store value directly'}
                      {m === 'env' && '${MY_ENV_VAR}'}
                      {m === 'vault' && 'vault:secret/path#field'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="relative">
        <input
          type={isObscured && !show ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={
            mode === 'env' ? '${MY_SECRET_VAR}' :
            mode === 'vault' ? 'vault:secret/myapp#password' :
            placeholder ?? '••••••••'
          }
          className={clsx(
            'w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1',
            mode === 'direct' ? 'pr-8 focus:ring-dblue-500' :
            mode === 'env' ? 'font-mono focus:ring-amber-400 border-amber-200 bg-amber-50' :
            'font-mono focus:ring-purple-400 border-purple-200 bg-purple-50'
          )}
        />
        {isObscured && (
          <button
            type="button"
            onClick={() => setShow(v => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {show ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
      </div>

      {hint && mode === 'direct' && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
      {mode === 'env' && <p className="mt-1 text-xs text-amber-600">Resolved from environment variable at startup</p>}
      {mode === 'vault' && <p className="mt-1 text-xs text-purple-600">Fetched from HashiCorp Vault at startup</p>}
    </div>
  )
}
