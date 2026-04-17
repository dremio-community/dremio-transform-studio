import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { IconCheckCircle, IconClose, IconErrorCircle } from './icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createIcebergCatalog, testIcebergCatalog } from '../api/client'
import type { IcebergCatalog } from '../types'
import clsx from 'clsx'

interface Props {
  onClose: () => void
}

const EMPTY: Omit<IcebergCatalog, 'id' | 'created_at' | 'updated_at'> = {
  name: '',
  url: '',
  warehouse: '',
  auth_type: 'none',
  token: '',
  client_id: '',
  client_secret: '',
  oauth_scope: 'PRINCIPAL_ROLE:ALL',
  prefix: 'v1',
  aws_access_key_id: '',
  aws_secret_access_key: '',
  aws_region: '',
  aws_session_token: '',
}

export default function AddCatalogModal({ onClose }: Props) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ ...EMPTY })
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const createMut = useMutation({
    mutationFn: createIcebergCatalog,
    onSuccess: async (conn) => {
      // Test immediately after creation
      setTestingId(conn.id)
      try {
        const result = await testIcebergCatalog(conn.id)
        setTestResult(result)
      } catch {
        setTestResult({ ok: false, error: 'Connection test failed' })
      }
      setTestingId(null)
      qc.invalidateQueries({ queryKey: ['iceberg-catalogs'] })
      if (testResult?.ok !== false) {
        setTimeout(onClose, 1500)
      }
    },
  })

  const handleSave = () => {
    if (!form.name || !form.url) return
    createMut.mutate(form)
  }

  const authHint: Record<string, string> = {
    none: 'No authentication — open catalog.',
    bearer: 'Static Bearer token (e.g. Dremio PAT or Polaris token).',
    dremio_pat: 'Dremio Personal Access Token — sent as Bearer header.',
    oauth2: 'OAuth2 client_credentials flow — fetches a short-lived token automatically.',
    sigv4: 'AWS SigV4 — for AWS Glue Iceberg catalogs. Signs every request with your AWS credentials.',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-navy-900 border border-navy-700 rounded-xl shadow-2xl w-[520px] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-700">
          <div>
            <h2 className="text-white font-semibold text-sm">Add Iceberg REST Catalog</h2>
            <p className="text-white/60 text-xs mt-0.5">Connect to Polaris, Unity Catalog, AWS Glue, or any Iceberg REST endpoint</p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
            <IconClose size={16} />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          {/* Name */}
          <Field label="Connection name" required>
            <Input
              placeholder="e.g. Polaris Production"
              value={form.name}
              onChange={(v) => set('name', v)}
            />
          </Field>

          {/* URL */}
          <Field label="Catalog URL" required hint="Base URL of the Iceberg REST catalog (without /v1)">
            <Input
              placeholder="https://polaris.example.com/api/catalog"
              value={form.url}
              onChange={(v) => set('url', v)}
              mono
            />
          </Field>

          {/* Warehouse + Prefix row */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Warehouse" hint="Optional warehouse name">
              <Input
                placeholder="my_warehouse"
                value={form.warehouse ?? ''}
                onChange={(v) => set('warehouse', v)}
                mono
              />
            </Field>
            <Field label="API prefix" hint='Usually "v1"'>
              <Input
                placeholder="v1"
                value={form.prefix ?? 'v1'}
                onChange={(v) => set('prefix', v)}
                mono
              />
            </Field>
          </div>

          {/* Auth type */}
          <Field label="Authentication" hint={authHint[form.auth_type]}>
            <select
              value={form.auth_type}
              onChange={(e) => set('auth_type', e.target.value as IcebergCatalog['auth_type'])}
              className="w-full bg-navy-800 border border-white/15 text-white text-xs rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-dblue-500"
            >
              <option value="none">None</option>
              <option value="bearer">Bearer token</option>
              <option value="dremio_pat">Dremio PAT</option>
              <option value="oauth2">OAuth2 (client credentials)</option>
              <option value="sigv4">AWS SigV4 (Glue)</option>
            </select>
          </Field>

          {/* Auth fields */}
          {(form.auth_type === 'bearer' || form.auth_type === 'dremio_pat') && (
            <Field label="Token">
              <Input
                placeholder="your-access-token"
                value={form.token ?? ''}
                onChange={(v) => set('token', v)}
                mono
                password
              />
            </Field>
          )}

          {form.auth_type === 'oauth2' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Client ID">
                  <Input
                    placeholder="client_id"
                    value={form.client_id ?? ''}
                    onChange={(v) => set('client_id', v)}
                    mono
                  />
                </Field>
                <Field label="Client secret">
                  <Input
                    placeholder="client_secret"
                    value={form.client_secret ?? ''}
                    onChange={(v) => set('client_secret', v)}
                    mono
                    password
                  />
                </Field>
              </div>
              <Field label="OAuth scope" hint='Default: "PRINCIPAL_ROLE:ALL"'>
                <Input
                  placeholder="PRINCIPAL_ROLE:ALL"
                  value={form.oauth_scope ?? 'PRINCIPAL_ROLE:ALL'}
                  onChange={(v) => set('oauth_scope', v)}
                  mono
                />
              </Field>
            </>
          )}

          {form.auth_type === 'sigv4' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Access Key ID">
                  <Input
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                    value={form.aws_access_key_id ?? ''}
                    onChange={(v) => set('aws_access_key_id', v)}
                    mono
                  />
                </Field>
                <Field label="Region" hint="e.g. us-east-1">
                  <Input
                    placeholder="us-east-1"
                    value={form.aws_region ?? ''}
                    onChange={(v) => set('aws_region', v)}
                    mono
                  />
                </Field>
              </div>
              <Field label="Secret Access Key">
                <Input
                  placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                  value={form.aws_secret_access_key ?? ''}
                  onChange={(v) => set('aws_secret_access_key', v)}
                  mono
                  password
                />
              </Field>
              <Field label="Session Token" hint="Optional — only needed for temporary credentials (IAM role / STS)">
                <Input
                  placeholder="Leave blank for long-term credentials"
                  value={form.aws_session_token ?? ''}
                  onChange={(v) => set('aws_session_token', v)}
                  mono
                  password
                />
              </Field>
            </>
          )}

          {/* Test result */}
          {testResult && (
            <div className={clsx(
              'flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs',
              testResult.ok ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-red-950 text-red-400 border border-red-800'
            )}>
              {testResult.ok
                ? <IconCheckCircle size={13} className="shrink-0 mt-0.5" />
                : <IconErrorCircle size={13} className="shrink-0 mt-0.5" />
              }
              <span>{testResult.ok ? 'Connection successful!' : testResult.error ?? 'Connection failed'}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-navy-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-white/60 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!form.name || !form.url || createMut.isPending || !!testingId}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-primary hover:bg-sidebar-primary disabled:opacity-40 rounded-lg transition-colors"
          >
            {(createMut.isPending || testingId) && <Loader2 size={12} className="animate-spin" />}
            {createMut.isPending ? 'Saving…' : testingId ? 'Testing…' : 'Save & test'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, required, hint, children }: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1 text-xs font-medium text-white/70">
        {label}
        {required && <span className="text-red-400">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-white/40">{hint}</p>}
    </div>
  )
}

function Input({ value, onChange, placeholder, mono, password }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
  password?: boolean
}) {
  return (
    <input
      type={password ? 'password' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={clsx(
        'w-full bg-navy-800 border border-white/15 text-white text-xs rounded px-3 py-2',
        'placeholder-surface-600 focus:outline-none focus:ring-1 focus:ring-dblue-500 focus:border-dblue-500',
        mono && 'font-mono'
      )}
    />
  )
}
