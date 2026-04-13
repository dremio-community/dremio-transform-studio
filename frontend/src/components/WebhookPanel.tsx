import { useState } from 'react'
import { Copy, RefreshCw, Check, AlertTriangle } from 'lucide-react'
import { regenerateWebhookToken } from '../api/client'

interface WebhookPanelProps {
  pipelineId: string
  webhookToken: string | undefined
  onTokenRegenerated: (newToken: string) => void
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }
  return (
    <button
      onClick={handleCopy}
      className="shrink-0 p-1.5 rounded text-surface-400 hover:text-dblue-500 hover:bg-dblue-50 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
    </button>
  )
}

export default function WebhookPanel({ pipelineId, webhookToken, onTokenRegenerated }: WebhookPanelProps) {
  const [regenerating, setRegenerating] = useState(false)
  const [confirmRegen, setConfirmRegen] = useState(false)

  const baseUrl = window.location.origin
  const webhookUrl = webhookToken
    ? `${baseUrl}/api/webhooks/${webhookToken}/trigger`
    : null

  const curlExample = webhookUrl
    ? `curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{"param_values": {"start_date": "2024-01-01"}}'`
    : ''

  const airflowExample = webhookUrl
    ? `# Airflow example (PythonOperator)
import requests

def trigger_pipeline():
    response = requests.post(
        "${webhookUrl}",
        json={"param_values": {"start_date": "{{ ds }}"}}
    )
    response.raise_for_status()
    return response.json()`
    : ''

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      const result = await regenerateWebhookToken(pipelineId)
      onTokenRegenerated(result.webhook_token)
    } finally {
      setRegenerating(false)
      setConfirmRegen(false)
    }
  }

  if (!webhookToken) {
    return (
      <div className="p-4 text-center text-surface-400 text-xs">
        Save the pipeline first to get a webhook URL.
      </div>
    )
  }

  return (
    <div className="p-4 space-y-5">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold text-surface-600 uppercase tracking-wider">Webhook Trigger</p>
        <p className="text-xs text-surface-400 mt-0.5">
          Use this URL to trigger this pipeline from any external system. The token is the authentication.
        </p>
      </div>

      {/* Webhook URL */}
      <div>
        <p className="text-xs font-medium text-surface-600 mb-1.5">Webhook URL</p>
        <div className="flex items-center gap-1 bg-surface-50 border border-surface-200 rounded-lg px-3 py-2">
          <code className="text-xs font-mono text-surface-700 flex-1 break-all min-w-0">{webhookUrl}</code>
          <CopyButton text={webhookUrl!} />
        </div>
      </div>

      {/* curl example */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-medium text-surface-600">cURL Example</p>
          <CopyButton text={curlExample} />
        </div>
        <pre className="text-xs font-mono bg-navy-950 text-surface-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
          {curlExample}
        </pre>
      </div>

      {/* Airflow/CI example */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-medium text-surface-600">Airflow / Python Example</p>
          <CopyButton text={airflowExample} />
        </div>
        <pre className="text-xs font-mono bg-navy-950 text-surface-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
          {airflowExample}
        </pre>
      </div>

      {/* Request body docs */}
      <div className="bg-surface-50 border border-surface-200 rounded-lg p-3">
        <p className="text-xs font-semibold text-surface-600 mb-2">Request Body (optional)</p>
        <div className="space-y-1.5 text-xs text-surface-600">
          <div>
            <code className="font-mono text-dblue-600">param_values</code>
            <span className="text-surface-400"> — dict of parameter values to substitute</span>
          </div>
          <div>
            <code className="font-mono text-dblue-600">async_run</code>
            <span className="text-surface-400"> — </span>
            <code className="font-mono">true</code>
            <span className="text-surface-400"> (default) returns job_id immediately, </span>
            <code className="font-mono">false</code>
            <span className="text-surface-400"> waits for completion</span>
          </div>
        </div>
      </div>

      {/* Regenerate */}
      <div className="border-t border-surface-200 pt-4">
        {!confirmRegen ? (
          <button
            onClick={() => setConfirmRegen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-surface-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors w-full"
          >
            <RefreshCw size={12} /> Regenerate Token
          </button>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={13} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">
                This will invalidate the current webhook URL. Any existing integrations using this URL will stop working.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmRegen(false)}
                className="flex-1 px-3 py-1.5 text-xs text-surface-500 hover:text-surface-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {regenerating ? (
                  <>Regenerating…</>
                ) : (
                  <><RefreshCw size={11} /> Regenerate</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
