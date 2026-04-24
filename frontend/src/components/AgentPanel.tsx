import { useState, useRef, useEffect, useCallback, FormEvent } from 'react'
import { Bot, Send, X, Loader2, ChevronDown, Wrench, AlertCircle, RefreshCw, Settings } from 'lucide-react'
import { getToken } from '../api/client'
import clsx from 'clsx'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface AgentEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'pipeline_state' | 'error'
  text?: string
  tool?: string
  args?: Record<string, unknown>
  result?: unknown
  state?: Record<string, unknown>
  message?: string
}

interface PipelineState {
  source_table?: string
  output_table?: string
  steps?: Array<{ id?: string; type?: string; label?: string; config?: Record<string, unknown> }>
  dirty?: boolean
}

interface Props {
  onClose: () => void
  pipelineState: PipelineState
  onPipelineStateChange: (state: PipelineState) => void
  onOpenSettings?: () => void
}

export default function AgentPanel({ onClose, pipelineState, onPipelineStateChange, onOpenSettings }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [toolActivity, setToolActivity] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set())
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Tool call log for display
  const [toolLog, setToolLog] = useState<Array<{ tool: string; args: unknown; result: unknown; msgIdx: number }>>([])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, toolActivity])

  const sendMessage = useCallback(async (userText: string) => {
    if (!userText.trim() || streaming) return

    const userMsg: Message = { role: 'user', content: userText.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setStreaming(true)
    setError(null)
    setToolActivity(null)

    // Placeholder for assistant message we'll build up
    const assistantIdx = newMessages.length
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    const token = getToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          pipeline_state: pipelineState,
        }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || 'Agent request failed')
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let assistantText = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') break
          try {
            const event: AgentEvent = JSON.parse(raw)
            if (event.type === 'text' && event.text) {
              assistantText += event.text
              setMessages(prev => {
                const updated = [...prev]
                updated[assistantIdx] = { role: 'assistant', content: assistantText }
                return updated
              })
            } else if (event.type === 'tool_call') {
              setToolActivity(`Calling ${event.tool}…`)
            } else if (event.type === 'tool_result') {
              setToolActivity(null)
              setToolLog(prev => [...prev, {
                tool: event.tool!,
                args: event.args,
                result: event.result,
                msgIdx: assistantIdx,
              }])
            } else if (event.type === 'pipeline_state' && event.state) {
              onPipelineStateChange(event.state as PipelineState)
            } else if (event.type === 'error') {
              setError(event.message || 'Unknown agent error')
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      if (!assistantText) {
        setMessages(prev => {
          const updated = [...prev]
          updated[assistantIdx] = { role: 'assistant', content: '(no response)' }
          return updated
        })
      }
    } catch (e: unknown) {
      if ((e as Error).name === 'AbortError') {
        setMessages(prev => {
          const updated = [...prev]
          updated[assistantIdx] = { role: 'assistant', content: '(cancelled)' }
          return updated
        })
      } else {
        setError(e instanceof Error ? e.message : 'Request failed')
        setMessages(prev => prev.slice(0, assistantIdx))
      }
    } finally {
      setStreaming(false)
      setToolActivity(null)
    }
  }, [messages, pipelineState, streaming, onPipelineStateChange])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleCancel = () => {
    abortRef.current?.abort()
  }

  const clearChat = () => {
    setMessages([])
    setToolLog([])
    setError(null)
  }

  const toolsForMsg = (idx: number) => toolLog.filter(t => t.msgIdx === idx)

  return (
    <div className="fixed right-0 top-0 h-full w-[420px] bg-white border-l border-gray-200 shadow-2xl flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-navy-800">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-dblue-400" />
          <span className="text-sm font-semibold text-white">AI Agent</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearChat}
            className="p-1.5 rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title="Clear chat"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
            <Bot size={32} className="text-gray-300" />
            <p className="text-sm text-gray-500 max-w-[280px]">
              Ask me to build or modify your pipeline. I can browse the catalog, add transform steps, and run previews.
            </p>
            <div className="flex flex-col gap-2 w-full max-w-[280px]">
              {[
                'Show me what tables are available',
                'Filter orders to only rows from 2024',
                'Group by customer_id and sum revenue',
              ].map(s => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-left text-xs text-dblue-600 bg-dblue-50 border border-dblue-200 rounded-lg px-3 py-2 hover:bg-dblue-100 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={clsx('flex flex-col gap-1', msg.role === 'user' ? 'items-end' : 'items-start')}>
            {/* Tool calls for this assistant message */}
            {msg.role === 'assistant' && toolsForMsg(i).length > 0 && (
              <div className="w-full space-y-1 mb-1">
                {toolsForMsg(i).map((t, ti) => (
                  <div key={ti} className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden text-xs">
                    <button
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-amber-800 font-medium"
                      onClick={() => setExpandedTools(prev => {
                        const next = new Set(prev)
                        const key = i * 1000 + ti
                        next.has(key) ? next.delete(key) : next.add(key)
                        return next
                      })}
                    >
                      <Wrench size={11} className="text-amber-600 shrink-0" />
                      <span className="flex-1 text-left">{t.tool}</span>
                      <ChevronDown size={11} className={clsx('transition-transform', expandedTools.has(i * 1000 + ti) && 'rotate-180')} />
                    </button>
                    {expandedTools.has(i * 1000 + ti) && (
                      <div className="px-3 pb-2 space-y-1 border-t border-amber-200">
                        <p className="text-amber-700 font-medium mt-1">Input:</p>
                        <pre className="text-[10px] text-amber-800 bg-amber-100 rounded p-1.5 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(t.args, null, 2)}</pre>
                        <p className="text-amber-700 font-medium">Output:</p>
                        <pre className="text-[10px] text-amber-800 bg-amber-100 rounded p-1.5 overflow-x-auto whitespace-pre-wrap max-h-32">{JSON.stringify(t.result, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className={clsx(
              'max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
              msg.role === 'user'
                ? 'bg-dblue-500 text-white rounded-tr-sm'
                : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
            )}>
              {msg.content || (streaming && i === messages.length - 1 ? (
                <span className="flex items-center gap-1 text-gray-400 text-xs">
                  <Loader2 size={12} className="animate-spin" /> Thinking…
                </span>
              ) : '')}
            </div>
          </div>
        ))}

        {toolActivity && (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Loader2 size={12} className="animate-spin" />
            {toolActivity}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            <span>
              {error.includes('Settings') && onOpenSettings
                ? <>
                    {error.split('Settings')[0]}
                    <button
                      onClick={onOpenSettings}
                      className="inline-flex items-center gap-0.5 font-semibold underline underline-offset-2 hover:text-red-900"
                    >
                      Settings <Settings size={11} className="inline" />
                    </button>
                    {error.split('Settings')[1]}
                  </>
                : error}
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 p-3 border-t border-gray-200 bg-white">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={streaming}
          placeholder="Ask the agent…"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dblue-400 disabled:opacity-50"
          autoFocus
        />
        {streaming ? (
          <button
            type="button"
            onClick={handleCancel}
            className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm transition-colors"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-3 py-2 bg-dblue-500 hover:bg-dblue-600 text-white rounded-lg transition-colors disabled:opacity-40"
          >
            <Send size={14} />
          </button>
        )}
      </form>
    </div>
  )
}
