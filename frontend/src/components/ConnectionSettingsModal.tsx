import { useState, useEffect } from 'react'
import { X, CheckCircle, XCircle, Loader2, Wifi, Bell, HardDrive, Download, Upload, Shield, Users, Lock, Unlock, KeyRound, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import clsx from 'clsx'
import {
  fetchConnectionSettings,
  updateConnectionSettings,
  testConnectionSettings,
  fetchNotificationSettings,
  updateNotificationSettings,
  testNotificationSettings,
  fetchStorageSettings,
  saveStorageSettings,
  downloadBackup,
  restoreBackup,
  fetchAuthSettings,
  updateAuthSettings,
  fetchUsers,
  fetchSsoConfigs,
  upsertSsoConfig,
  deleteSsoConfig,
  type ConnectionSettings,
  type NotificationSettings,
  type StorageSettings,
  type SsoConfig,
} from '../api/client'

interface Props {
  onClose: () => void
  onSaved?: () => void
}

type ModalTab = 'connection' | 'notifications' | 'storage' | 'security' | 'sso'

const CLOUD_HOSTS = [
  { label: 'Dremio Cloud (US)', value: 'api.dremio.cloud' },
  { label: 'Dremio Cloud (EU)', value: 'api.eu.dremio.cloud' },
]

const PRESETS = [
  { label: 'Self-hosted', host: '', port: 9047, ssl: false, auth_type: 'password' as const },
  { label: 'Dremio Cloud (US)', host: 'api.dremio.cloud', port: 443, ssl: true, auth_type: 'pat' as const },
  { label: 'Dremio Cloud (EU)', host: 'api.eu.dremio.cloud', port: 443, ssl: true, auth_type: 'pat' as const },
]

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  notify_email_enabled: false,
  notify_email_smtp_host: '',
  notify_email_smtp_port: '',
  notify_email_smtp_user: '',
  notify_email_smtp_pass: '',
  notify_email_from: '',
  notify_email_to: '',
  notify_slack_enabled: false,
  notify_slack_webhook_url: '',
}

export default function ConnectionSettingsModal({ onClose, onSaved }: Props) {
  const [activeTab, setActiveTab] = useState<ModalTab>('connection')

  const [form, setForm] = useState<ConnectionSettings>({
    host: 'localhost',
    port: 9047,
    ssl: false,
    auth_type: 'password',
    user: '',
    password: '',
    pat: '',
    project_id: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const [notifForm, setNotifForm] = useState<NotificationSettings>(DEFAULT_NOTIFICATIONS)
  const [notifLoading, setNotifLoading] = useState(true)
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifTesting, setNotifTesting] = useState(false)
  const [notifTestResult, setNotifTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const [storageInfo, setStorageInfo] = useState<StorageSettings | null>(null)
  const [storageLoading, setStorageLoading] = useState(true)
  const [customPath, setCustomPath] = useState('')
  const [storageSaving, setStorageSaving] = useState(false)
  const [storageSaved, setStorageSaved] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [restoreMsg, setRestoreMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Security tab state
  const [authEnabled, setAuthEnabled] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [authSaving, setAuthSaving] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [userCount, setUserCount] = useState<number | null>(null)

  // SSO tab state
  const [ssoConfigs, setSsoConfigs] = useState<SsoConfig[]>([])
  const [ssoLoading, setSsoLoading] = useState(false)
  const [ssoSaving, setSsoSaving] = useState(false)
  const [ssoError, setSsoError] = useState<string | null>(null)
  const [ssoForm, setSsoForm] = useState<Partial<SsoConfig> & { client_secret?: string }>({
    provider_name: 'okta',
    display_name: '',
    client_id: '',
    client_secret: '',
    discovery_url: '',
    default_role: 'editor',
    enabled: true,
  })
  const [ssoShowForm, setSsoShowForm] = useState(false)
  const [ssoEditName, setSsoEditName] = useState<string | null>(null)

  useEffect(() => {
    fetchConnectionSettings()
      .then((s) => setForm({ ...s, password: '', pat: '' }))
      .catch(() => {})
      .finally(() => setLoading(false))

    fetchNotificationSettings()
      .then((s) => setNotifForm(s))
      .catch(() => {})
      .finally(() => setNotifLoading(false))

    fetchStorageSettings()
      .then((s) => { setStorageInfo(s); setCustomPath(s.db_path) })
      .catch(() => {})
      .finally(() => setStorageLoading(false))

    fetchAuthSettings()
      .then((s) => setAuthEnabled(s.auth_enabled))
      .catch(() => {})
      .finally(() => setAuthLoading(false))

    fetchUsers()
      .then((users) => setUserCount(users.length))
      .catch(() => setUserCount(null))
  }, [])

  const loadSsoConfigs = () => {
    setSsoLoading(true)
    fetchSsoConfigs()
      .then(setSsoConfigs)
      .catch(() => {})
      .finally(() => setSsoLoading(false))
  }

  useEffect(() => {
    if (activeTab === 'sso') loadSsoConfigs()
  }, [activeTab])

  const handleAuthToggle = async (enable: boolean) => {
    setAuthSaving(true)
    setAuthError(null)
    try {
      const result = await updateAuthSettings(enable)
      setAuthEnabled(result.auth_enabled)
      // If just enabled auth, reload the page so the login flow kicks in properly
      if (result.auth_enabled) {
        window.location.reload()
      }
    } catch (e: unknown) {
      setAuthError(e instanceof Error ? e.message : 'Failed to update auth settings')
    } finally {
      setAuthSaving(false)
    }
  }

  const set = (key: keyof ConnectionSettings, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const setNotif = (key: keyof NotificationSettings, value: unknown) =>
    setNotifForm((prev) => ({ ...prev, [key]: value }))

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setForm((prev) => ({
      ...prev,
      host: preset.host,
      port: preset.port,
      ssl: preset.ssl,
      auth_type: preset.auth_type,
    }))
    setTestResult(null)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    // Save first so the backend tests the new config
    await updateConnectionSettings(form).catch(() => {})
    const result = await testConnectionSettings().catch((e) => ({
      ok: false,
      message: String(e),
    }))
    setTestResult(result)
    setTesting(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateConnectionSettings(form)
      onSaved?.()
      onClose()
    } catch {
      setSaving(false)
    }
  }

  const handleNotifSave = async () => {
    setNotifSaving(true)
    try {
      await updateNotificationSettings(notifForm)
      setNotifSaving(false)
    } catch {
      setNotifSaving(false)
    }
  }

  const handleNotifTest = async () => {
    setNotifTesting(true)
    setNotifTestResult(null)
    // Save first so the backend uses the current settings
    await updateNotificationSettings(notifForm).catch(() => {})
    const result = await testNotificationSettings().catch((e: Error) => ({
      ok: false,
      message: String(e),
    }))
    setNotifTestResult(result)
    setNotifTesting(false)
  }

  const isCloud = CLOUD_HOSTS.some((h) => h.value === form.host)

  if (loading || notifLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-xl p-8 flex items-center gap-3 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-navy-950">
          <div className="flex items-center gap-2.5">
            <Wifi size={16} className="text-dblue-400" />
            <span className="font-semibold text-white text-sm">Settings</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setActiveTab('connection')}
            className={clsx(
              'flex items-center gap-2 px-5 py-3 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 -mb-px',
              activeTab === 'connection'
                ? 'text-dblue-600 border-dblue-500'
                : 'text-gray-400 border-transparent hover:text-gray-600'
            )}
          >
            <Wifi size={13} /> Connection
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={clsx(
              'flex items-center gap-2 px-5 py-3 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 -mb-px',
              activeTab === 'notifications'
                ? 'text-dblue-600 border-dblue-500'
                : 'text-gray-400 border-transparent hover:text-gray-600'
            )}
          >
            <Bell size={13} /> Notifications
          </button>
          <button
            onClick={() => setActiveTab('storage')}
            className={clsx(
              'flex items-center gap-2 px-5 py-3 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 -mb-px',
              activeTab === 'storage'
                ? 'text-dblue-600 border-dblue-500'
                : 'text-gray-400 border-transparent hover:text-gray-600'
            )}
          >
            <HardDrive size={13} /> Storage
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={clsx(
              'flex items-center gap-2 px-5 py-3 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 -mb-px',
              activeTab === 'security'
                ? 'text-dblue-600 border-dblue-500'
                : 'text-gray-400 border-transparent hover:text-gray-600'
            )}
          >
            <Shield size={13} /> Security
          </button>
          <button
            onClick={() => setActiveTab('sso')}
            className={clsx(
              'flex items-center gap-2 px-5 py-3 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 -mb-px',
              activeTab === 'sso'
                ? 'text-dblue-600 border-dblue-500'
                : 'text-gray-400 border-transparent hover:text-gray-600'
            )}
          >
            <KeyRound size={13} /> SSO
          </button>
        </div>

        {/* ── Connection Tab ── */}
        {activeTab === 'connection' && (
        <div className="p-5 space-y-4">
          {/* Presets */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Quick Setup
            </label>
            <div className="flex gap-2 flex-wrap">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  className={clsx(
                    'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                    form.host === p.host
                      ? 'bg-dblue-500 text-white border-dblue-500'
                      : 'border-gray-200 text-gray-600 hover:border-dblue-400 hover:text-dblue-600'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Host + Port + SSL */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Host</label>
              <input
                value={form.host}
                onChange={(e) => set('host', e.target.value)}
                placeholder="localhost or api.dremio.cloud"
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-dblue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Port</label>
              <input
                type="number"
                value={form.port}
                onChange={(e) => set('port', Number(e.target.value))}
                disabled={isCloud}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-dblue-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.ssl}
              onChange={(e) => set('ssl', e.target.checked)}
              className="rounded border-gray-300 text-dblue-500 focus:ring-dblue-400"
            />
            <span className="text-sm text-gray-700">Use HTTPS / SSL</span>
          </label>

          {/* Auth type toggle */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Authentication
            </label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
              <button
                onClick={() => set('auth_type', 'password')}
                className={clsx(
                  'flex-1 py-2 transition-colors',
                  form.auth_type === 'password'
                    ? 'bg-navy-900 text-white'
                    : 'text-gray-500 hover:bg-gray-50'
                )}
              >
                Username / Password
              </button>
              <button
                onClick={() => set('auth_type', 'pat')}
                className={clsx(
                  'flex-1 py-2 transition-colors border-l border-gray-200',
                  form.auth_type === 'pat'
                    ? 'bg-navy-900 text-white'
                    : 'text-gray-500 hover:bg-gray-50'
                )}
              >
                Personal Access Token
              </button>
            </div>
          </div>

          {/* Auth fields */}
          {/* Project ID — Dremio Cloud only */}
          {form.auth_type === 'pat' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Project ID
                <span className="ml-1 font-normal text-gray-400">(from your Cloud project URL)</span>
              </label>
              <input
                value={form.project_id}
                onChange={(e) => set('project_id', e.target.value)}
                placeholder="e.g. 918f7fbf-e0e3-47db-aa5b-1257353011c0"
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-dblue-500 font-mono text-xs"
              />
              <p className="mt-1 text-xs text-gray-400">
                Found in your browser URL: app.dremio.cloud/project/<strong>{'<project-id>'}</strong>/…
              </p>
            </div>
          )}

          {form.auth_type === 'password' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Username</label>
                <input
                  value={form.user}
                  onChange={(e) => set('user', e.target.value)}
                  placeholder="admin"
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-dblue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-dblue-500"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Personal Access Token (PAT)
              </label>
              <input
                type="password"
                value={form.pat}
                onChange={(e) => set('pat', e.target.value)}
                placeholder="Paste your PAT here"
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-dblue-500 font-mono"
              />
              <p className="mt-1 text-xs text-gray-400">
                In Dremio Cloud: Account → Personal Access Tokens → New Token
              </p>
            </div>
          )}

          {/* Test result */}
          {testResult && (
            <div className={clsx(
              'flex items-start gap-2 p-3 rounded-lg text-sm',
              testResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
            )}>
              {testResult.ok
                ? <CheckCircle size={15} className="shrink-0 mt-0.5" />
                : <XCircle size={15} className="shrink-0 mt-0.5" />
              }
              <span>{testResult.message}</span>
            </div>
          )}
        </div>
        )}

        {/* ── Notifications Tab ── */}
        {activeTab === 'notifications' && (
        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">

          {/* Email section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Email Notifications</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifForm.notify_email_enabled}
                  onChange={(e) => setNotif('notify_email_enabled', e.target.checked)}
                  className="rounded border-gray-300 text-dblue-500 focus:ring-dblue-400"
                />
                <span className="text-xs text-gray-600">Enable</span>
              </label>
            </div>

            {notifForm.notify_email_enabled && (
              <div className="space-y-3 pl-1">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">SMTP Host</label>
                    <input
                      value={notifForm.notify_email_smtp_host}
                      onChange={(e) => setNotif('notify_email_smtp_host', e.target.value)}
                      placeholder="smtp.gmail.com"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-dblue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Port</label>
                    <input
                      value={notifForm.notify_email_smtp_port}
                      onChange={(e) => setNotif('notify_email_smtp_port', e.target.value)}
                      placeholder="587"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-dblue-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">SMTP User</label>
                    <input
                      value={notifForm.notify_email_smtp_user}
                      onChange={(e) => setNotif('notify_email_smtp_user', e.target.value)}
                      placeholder="user@example.com"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-dblue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">SMTP Password</label>
                    <input
                      type="password"
                      value={notifForm.notify_email_smtp_pass}
                      onChange={(e) => setNotif('notify_email_smtp_pass', e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-dblue-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">From Address</label>
                    <input
                      value={notifForm.notify_email_from}
                      onChange={(e) => setNotif('notify_email_from', e.target.value)}
                      placeholder="alerts@example.com"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-dblue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">To Address</label>
                    <input
                      value={notifForm.notify_email_to}
                      onChange={(e) => setNotif('notify_email_to', e.target.value)}
                      placeholder="team@example.com"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-dblue-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100" />

          {/* Slack section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Slack Notifications</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifForm.notify_slack_enabled}
                  onChange={(e) => setNotif('notify_slack_enabled', e.target.checked)}
                  className="rounded border-gray-300 text-dblue-500 focus:ring-dblue-400"
                />
                <span className="text-xs text-gray-600">Enable</span>
              </label>
            </div>

            {notifForm.notify_slack_enabled && (
              <div className="pl-1 space-y-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Webhook URL</label>
                  <input
                    value={notifForm.notify_slack_webhook_url}
                    onChange={(e) => setNotif('notify_slack_webhook_url', e.target.value)}
                    placeholder="https://hooks.slack.com/services/..."
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-dblue-500 font-mono text-xs"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    <a
                      href="https://api.slack.com/messaging/webhooks"
                      target="_blank"
                      rel="noreferrer"
                      className="text-dblue-500 hover:underline"
                    >
                      How to create a Slack webhook
                    </a>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Test notification result */}
          {notifTestResult && (
            <div className={clsx(
              'flex items-start gap-2 p-3 rounded-lg text-sm',
              notifTestResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
            )}>
              {notifTestResult.ok
                ? <CheckCircle size={15} className="shrink-0 mt-0.5" />
                : <XCircle size={15} className="shrink-0 mt-0.5" />
              }
              <span>{notifTestResult.message}</span>
            </div>
          )}
        </div>
        )}

        {/* Footer */}
        {activeTab === 'connection' && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:border-dblue-400 hover:text-dblue-600 transition-colors disabled:opacity-50"
          >
            {testing ? <Loader2 size={12} className="animate-spin" /> : <Wifi size={12} />}
            Test Connection
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-dblue-500 text-white rounded hover:bg-dblue-600 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : null}
              Save & Connect
            </button>
          </div>
        </div>
        )}

        {activeTab === 'notifications' && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button
            onClick={handleNotifTest}
            disabled={notifTesting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded hover:border-dblue-400 hover:text-dblue-600 transition-colors disabled:opacity-50"
          >
            {notifTesting ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
            Send Test Notification
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleNotifSave}
              disabled={notifSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-dblue-500 text-white rounded hover:bg-dblue-600 transition-colors disabled:opacity-50"
            >
              {notifSaving ? <Loader2 size={12} className="animate-spin" /> : null}
              Save Settings
            </button>
          </div>
        </div>
        )}

        {/* ── Storage Tab ── */}
        {activeTab === 'storage' && (
        <div className="p-5 space-y-5">
          {storageLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : storageInfo && !storageInfo.is_desktop ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 text-sm text-blue-700 space-y-2">
                <p className="font-semibold">Storage location is managed by Docker.</p>
                <p className="text-xs text-blue-600">Your data is stored at <code className="bg-blue-100 px-1 rounded">/data/transforms.db</code> inside the container.</p>
                <p className="text-xs text-blue-600">
                  To persist data across container restarts, start Docker with a volume mount:
                </p>
                <code className="block bg-blue-100 text-blue-800 text-[11px] rounded px-2 py-1.5 font-mono break-all">
                  docker run -d -p 8000:8000 -v ~/transform-studio-data:/data mshainman/transform-studio:latest
                </code>
                <p className="text-xs text-blue-600">If you don't use a volume mount, use <strong>Download Backup</strong> below before stopping the container.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Current Database File</label>
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <HardDrive size={13} className="text-gray-400 shrink-0" />
                  <span className="text-xs text-gray-700 font-mono break-all">{storageInfo?.db_path}</span>
                  {storageInfo?.is_custom && (
                    <span className="ml-auto shrink-0 text-[10px] font-semibold text-dblue-600 bg-dblue-50 px-1.5 py-0.5 rounded">Custom</span>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Custom Database Path
                </label>
                <input
                  type="text"
                  value={customPath}
                  onChange={(e) => { setCustomPath(e.target.value); setStorageSaved(false) }}
                  placeholder={storageInfo?.default_db_path ?? '~/.transform_studio/transforms.db'}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-dblue-400"
                />
                <p className="text-[11px] text-gray-400">Enter a full path, e.g. <code>/Users/you/Documents/my-pipelines.db</code></p>
              </div>

              {storageInfo?.is_custom && (
                <button
                  onClick={() => { setCustomPath(storageInfo.default_db_path); setStorageSaved(false) }}
                  className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
                >
                  Reset to default location
                </button>
              )}

              <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-xs text-amber-700">
                <strong>Note:</strong> A restart is required for the new location to take effect. Your existing data stays at the old path — copy the <code className="bg-amber-100 px-1 rounded">.db</code> file manually if you want to keep it.
              </div>

              {storageSaved && (
                <div className="flex items-center gap-2 text-xs text-green-600">
                  <CheckCircle size={13} /> Saved — restart the app to apply
                </div>
              )}
            </>
          )}

          {/* ── Backup & Restore (all modes) ── */}
          {!storageLoading && (
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Backup &amp; Restore</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={async () => {
                    setBackupBusy(true)
                    setRestoreMsg(null)
                    try { await downloadBackup() } catch (_) {}
                    setBackupBusy(false)
                  }}
                  disabled={backupBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {backupBusy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  Download Backup
                </button>
                <label className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer ${restoreBusy ? 'opacity-50 pointer-events-none' : ''}`}>
                  {restoreBusy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  Restore from Backup
                  <input
                    type="file"
                    accept=".db"
                    className="hidden"
                    disabled={restoreBusy}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setRestoreBusy(true)
                      setRestoreMsg(null)
                      try {
                        await restoreBackup(file)
                        setRestoreMsg({ ok: true, text: 'Restored — restart the app to apply the new database.' })
                      } catch (_) {
                        setRestoreMsg({ ok: false, text: 'Restore failed. Make sure the file is a valid Transform Studio backup (.db).' })
                      }
                      setRestoreBusy(false)
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>
              {restoreMsg && (
                <div className={`flex items-start gap-2 text-xs rounded-lg p-2 ${restoreMsg.ok ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
                  {restoreMsg.ok ? <CheckCircle size={13} className="mt-0.5 shrink-0" /> : <XCircle size={13} className="mt-0.5 shrink-0" />}
                  {restoreMsg.text}
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {activeTab === 'storage' && storageInfo?.is_desktop && (
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors">
            Cancel
          </button>
          <button
            onClick={async () => {
              setStorageSaving(true)
              try {
                const target = customPath.trim() || (storageInfo?.default_db_path ?? '')
                await saveStorageSettings(target)
                setStorageSaved(true)
                setStorageInfo(prev => prev ? { ...prev, db_path: target, is_custom: target !== (storageInfo?.default_db_path ?? '') } : prev)
              } catch (_) {}
              setStorageSaving(false)
            }}
            disabled={storageSaving || !customPath.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-dblue-500 text-white rounded hover:bg-dblue-600 transition-colors disabled:opacity-50"
          >
            {storageSaving ? <Loader2 size={12} className="animate-spin" /> : <HardDrive size={12} />}
            Save Path
          </button>
        </div>
        )}

        {/* ── Security Tab ── */}
        {activeTab === 'security' && (
        <div className="p-5 space-y-5">
          {authLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={16} className="animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              {/* Auth toggle card */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                  <div className="flex items-center gap-2.5">
                    {authEnabled ? (
                      <Lock size={15} className="text-dblue-600" />
                    ) : (
                      <Unlock size={15} className="text-gray-400" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Require Login</p>
                      <p className="text-xs text-gray-500">
                        {authEnabled
                          ? 'Users must log in with a username and password.'
                          : 'Anyone with access to this URL can use the app.'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAuthToggle(!authEnabled)}
                    disabled={authSaving}
                    className={clsx(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
                      authEnabled ? 'bg-dblue-500' : 'bg-gray-300'
                    )}
                  >
                    <span
                      className={clsx(
                        'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                        authEnabled ? 'translate-x-6' : 'translate-x-1'
                      )}
                    />
                  </button>
                </div>
                {authEnabled && (
                  <div className="px-4 py-3 border-t border-gray-100 bg-blue-50/50">
                    <div className="flex items-start gap-2 text-xs text-blue-700">
                      <Shield size={13} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium mb-0.5">Auth is ON</p>
                        <p>
                          {userCount !== null
                            ? `${userCount} user${userCount === 1 ? '' : 's'} registered. `
                            : ''}
                          Manage users via the Users button in the toolbar. Default admin credentials: <code className="bg-blue-100 px-1 rounded">admin / admin</code>.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {!authEnabled && (
                  <div className="px-4 py-3 border-t border-gray-100 bg-amber-50/50">
                    <div className="flex items-start gap-2 text-xs text-amber-700">
                      <Unlock size={13} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium mb-0.5">Auth is OFF</p>
                        <p>All visitors have full admin access. Enable login for multi-user deployments or shared servers.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {authError && (
                <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{authError}</p>
              )}

              {/* Roles explanation */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">User Roles</p>
                <div className="space-y-2">
                  {[
                    { role: 'Admin', color: 'text-purple-600 bg-purple-50 border-purple-200', desc: 'Sees all pipelines. Can manage users, change roles, and delete anything.' },
                    { role: 'Editor', color: 'text-dblue-600 bg-blue-50 border-blue-200', desc: 'Owns their own pipelines (full control). Can be granted view or edit access to others.' },
                    { role: 'Viewer', color: 'text-gray-600 bg-gray-50 border-gray-200', desc: 'Read-only. Can run pipelines. Must submit for approval on pipelines with approval required.' },
                  ].map(({ role, color, desc }) => (
                    <div key={role} className="flex items-start gap-3 px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-lg">
                      <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded border shrink-0', color)}>{role}</span>
                      <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sharing explanation */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Pipeline Sharing</p>
                <div className="text-xs text-gray-500 space-y-1.5 bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
                  <p>• Pipeline owners and admins can share pipelines via the <strong className="text-gray-700">Share</strong> button (⬡ icon) on any pipeline.</p>
                  <p>• Shared pipelines appear in the recipient's list with a <em>(shared)</em> label.</p>
                  <p>• <strong className="text-gray-700">Editor</strong> access — can view and save changes but cannot delete.</p>
                  <p>• <strong className="text-gray-700">Viewer</strong> access — can view and run only.</p>
                </div>
              </div>
            </>
          )}
        </div>
        )}

        {/* ── SSO Tab ── */}
        {activeTab === 'sso' && (
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
            <KeyRound size={13} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold mb-0.5">Single Sign-On (OIDC)</p>
              <p>Connect Okta, Azure AD, Google Workspace, or any OIDC-compatible identity provider. Users will see "Sign in with …" buttons on the login screen.</p>
            </div>
          </div>

          {/* Existing providers */}
          {ssoLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={16} className="animate-spin text-gray-400" />
            </div>
          ) : ssoConfigs.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Configured Providers</p>
              {ssoConfigs.map((cfg) => (
                <div key={cfg.provider_name} className="flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50">
                  <div className="flex items-center gap-2.5">
                    <span className={clsx('w-2 h-2 rounded-full shrink-0', cfg.enabled ? 'bg-emerald-500' : 'bg-gray-300')} />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{cfg.display_name}</p>
                      <p className="text-xs text-gray-400">{cfg.provider_name} · default role: {cfg.default_role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSsoForm({ ...cfg, client_secret: '' })
                        setSsoEditName(cfg.provider_name)
                        setSsoShowForm(true)
                      }}
                      className="text-xs text-dblue-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Remove ${cfg.display_name}?`)) return
                        await deleteSsoConfig(cfg.provider_name).catch(() => {})
                        loadSsoConfigs()
                      }}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center py-4">No SSO providers configured yet.</p>
          )}

          {/* Add / Edit form */}
          <div>
            <button
              onClick={() => {
                if (ssoShowForm && !ssoEditName) { setSsoShowForm(false); return }
                setSsoForm({ provider_name: 'okta', display_name: '', client_id: '', client_secret: '', discovery_url: '', default_role: 'editor', enabled: true })
                setSsoEditName(null)
                setSsoShowForm(true)
              }}
              className="flex items-center gap-1.5 text-xs font-medium text-dblue-600 hover:text-dblue-700"
            >
              {ssoShowForm && !ssoEditName ? <ChevronUp size={13} /> : <Plus size={13} />}
              {ssoShowForm && !ssoEditName ? 'Cancel' : 'Add Provider'}
            </button>

            {ssoShowForm && (
              <div className="mt-3 space-y-3 border border-gray-200 rounded-lg p-4 bg-gray-50">
                <p className="text-xs font-semibold text-gray-700">{ssoEditName ? `Edit — ${ssoEditName}` : 'New Provider'}</p>

                {/* Provider type */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Provider Type</label>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { value: 'okta', label: 'Okta', hint: 'https://{domain}/.well-known/openid-configuration' },
                      { value: 'azure', label: 'Azure AD', hint: 'https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration' },
                      { value: 'google', label: 'Google', hint: 'https://accounts.google.com/.well-known/openid-configuration' },
                      { value: 'custom', label: 'Custom', hint: '' },
                    ].map(({ value, label, hint }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSsoForm(f => ({
                          ...f,
                          provider_name: value,
                          display_name: f.display_name || label,
                          discovery_url: hint || f.discovery_url || '',
                        }))}
                        className={clsx(
                          'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                          ssoForm.provider_name === value
                            ? 'bg-dblue-500 text-white border-dblue-500'
                            : 'border-gray-200 text-gray-600 hover:border-dblue-400'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Display name */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Display Name <span className="text-red-400">*</span></label>
                  <input
                    value={ssoForm.display_name ?? ''}
                    onChange={e => setSsoForm(f => ({ ...f, display_name: e.target.value }))}
                    placeholder="e.g. Okta, Company SSO"
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-dblue-500"
                  />
                </div>

                {/* Client ID + Secret */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Client ID <span className="text-red-400">*</span></label>
                    <input
                      value={ssoForm.client_id ?? ''}
                      onChange={e => setSsoForm(f => ({ ...f, client_id: e.target.value }))}
                      placeholder="0oabc123..."
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-dblue-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">
                      Client Secret {ssoEditName && <span className="font-normal text-gray-400">(leave blank to keep)</span>}
                    </label>
                    <input
                      type="password"
                      value={ssoForm.client_secret ?? ''}
                      onChange={e => setSsoForm(f => ({ ...f, client_secret: e.target.value }))}
                      placeholder="••••••••"
                      className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-dblue-500"
                    />
                  </div>
                </div>

                {/* Discovery URL */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">OIDC Discovery URL <span className="text-red-400">*</span></label>
                  <input
                    value={ssoForm.discovery_url ?? ''}
                    onChange={e => setSsoForm(f => ({ ...f, discovery_url: e.target.value }))}
                    placeholder="https://…/.well-known/openid-configuration"
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-dblue-500 font-mono text-xs"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Okta: <code>https://&#123;domain&#125;/oauth2/default/.well-known/openid-configuration</code>
                  </p>
                </div>

                {/* Default role */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Default Role for New SSO Users</label>
                  <select
                    value={ssoForm.default_role ?? 'editor'}
                    onChange={e => setSsoForm(f => ({ ...f, default_role: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-dblue-500 bg-white"
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                {/* Enabled toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Enable this provider</span>
                  <button
                    type="button"
                    onClick={() => setSsoForm(f => ({ ...f, enabled: !f.enabled }))}
                    className={clsx(
                      'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                      ssoForm.enabled ? 'bg-dblue-500' : 'bg-gray-300'
                    )}
                  >
                    <span className={clsx(
                      'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
                      ssoForm.enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                    )} />
                  </button>
                </div>

                {ssoError && (
                  <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{ssoError}</p>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={() => { setSsoShowForm(false); setSsoEditName(null); setSsoError(null) }}
                    className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={ssoSaving || !ssoForm.display_name?.trim() || !ssoForm.client_id?.trim() || !ssoForm.discovery_url?.trim()}
                    onClick={async () => {
                      setSsoSaving(true)
                      setSsoError(null)
                      try {
                        await upsertSsoConfig({
                          provider_name: ssoForm.provider_name ?? 'custom',
                          display_name: ssoForm.display_name ?? '',
                          client_id: ssoForm.client_id ?? '',
                          client_secret: ssoForm.client_secret,
                          discovery_url: ssoForm.discovery_url ?? '',
                          default_role: ssoForm.default_role ?? 'editor',
                          enabled: ssoForm.enabled ?? true,
                        })
                        setSsoShowForm(false)
                        setSsoEditName(null)
                        loadSsoConfigs()
                      } catch (e: unknown) {
                        setSsoError(e instanceof Error ? e.message : 'Failed to save SSO config')
                      } finally {
                        setSsoSaving(false)
                      }
                    }}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-dblue-500 text-white rounded hover:bg-dblue-600 transition-colors disabled:opacity-50"
                  >
                    {ssoSaving ? <Loader2 size={12} className="animate-spin" /> : null}
                    {ssoEditName ? 'Save Changes' : 'Add Provider'}
                  </button>
                </div>

                {/* Redirect URI hint */}
                <div className="border-t border-gray-200 pt-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Redirect URI to configure in your IdP</p>
                  <code className="block text-[11px] text-gray-600 bg-white border border-gray-200 rounded px-2 py-1.5 break-all font-mono">
                    {window.location.origin}/api/auth/sso/{ssoForm.provider_name ?? 'provider'}/callback
                  </code>
                </div>
              </div>
            )}
          </div>
        </div>
        )}

      </div>
    </div>
  )
}
