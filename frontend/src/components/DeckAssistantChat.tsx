import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage, Deck } from '../types'
import { getToken } from '../api'
import {
  ASSISTANT_DISPLAY_NAME,
  formatAgentActionDetail,
  formatAgentActionTitle,
} from '../agentLabels'
import sparklesIcon from '../assets/figma/sparkles.svg'
import sendIcon from '../assets/figma/send.svg'
import gemIcon from '../assets/figma/gem.svg'

type ThoughtItem = {
  key: string
  title: string
  description?: string
  content?: string
  status?: 'loading' | 'success' | 'error' | 'abort'
  toolName?: string
  toolArgs?: unknown
}

type UiMessage = {
  key: string
  role: 'user' | 'assistant'
  content: string
  thoughts: ThoughtItem[]
  status?: 'loading' | 'success' | 'error'
  patchApplied?: boolean
  patchError?: string | null
}

type Props = {
  deckId: number
  history: ChatMessage[]
  busy: boolean
  onBusyChange: (busy: boolean) => void
  onDeckUpdate: (deck: Deck) => void
  onStatus: (text: string) => void
  onError: (text: string) => void
  persistDraft: () => Promise<unknown>
}

function historyToUi(history: ChatMessage[]): UiMessage[] {
  return history.map((m) => ({
    key: `h-${m.id}-${m.role}`,
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
    thoughts: [],
    status: 'success',
    patchApplied: m.patch_applied,
    patchError: m.patch_error,
  }))
}

function MessageBody({ role, content, loading }: { role: string; content: string; loading?: boolean }) {
  if (!content) {
    return <>{loading ? '…' : ''}</>
  }
  if (role === 'user') {
    return <>{content}</>
  }
  return (
    <div className="forge-md">
      <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
    </div>
  )
}

export function DeckAssistantChat({
  deckId,
  history,
  busy,
  onBusyChange,
  onDeckUpdate,
  onStatus,
  onError,
  persistDraft,
}: Props) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<UiMessage[]>(() => historyToUi(history))
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({})
  const logRef = useRef<HTMLDivElement>(null)
  const historySig = useMemo(
    () => history.map((m) => `${m.id}:${m.role}:${m.content}`).join('\n'),
    [history],
  )

  useEffect(() => {
    if (!historySig && messages.some((m) => !m.key.startsWith('h-'))) return
    setMessages(historyToUi(history))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historySig, deckId])

  useEffect(() => {
    const el = logRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    onBusyChange(true)
    onError('')
    setInput('')

    const userKey = `u-${Date.now()}`
    const asstKey = `a-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { key: userKey, role: 'user', content: text, thoughts: [], status: 'success' },
      {
        key: asstKey,
        role: 'assistant',
        content: '',
        thoughts: [
          {
            key: 'think',
            title: '构思中',
            status: 'loading',
            description: `${ASSISTANT_DISPLAY_NAME} 正在理解你的意图`,
          },
        ],
        status: 'loading',
      },
    ])

    try {
      await persistDraft()
      const token = getToken()
      const res = await fetch(`/api/decks/${deckId}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content: text }),
      })
      if (!res.ok || !res.body) {
        let detail = res.statusText
        try {
          const data = await res.json()
          detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
        } catch {
          /* ignore */
        }
        throw new Error(detail || `HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let eventName = 'message'

      const updateAssistant = (fn: (m: UiMessage) => UiMessage) => {
        setMessages((prev) => prev.map((m) => (m.key === asstKey ? fn(m) : m)))
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const part of parts) {
          const lines = part.split('\n')
          let dataLine = ''
          for (const line of lines) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim()
            if (line.startsWith('data:')) dataLine += line.slice(5).trim()
          }
          if (!dataLine) continue
          let payload: Record<string, unknown> = {}
          try {
            payload = JSON.parse(dataLine) as Record<string, unknown>
          } catch {
            continue
          }

          if (eventName === 'status') {
            updateAssistant((m) => ({
              ...m,
              thoughts: m.thoughts.map((t) =>
                t.key === 'think'
                  ? {
                      ...t,
                      description: String(payload.message || '构思中'),
                      status: 'loading',
                    }
                  : t,
              ),
            }))
          } else if (eventName === 'token') {
            const piece = String(payload.text || '')
            updateAssistant((m) => ({
              ...m,
              content: m.content + piece,
              thoughts: m.thoughts.map((t) =>
                t.key === 'think' ? { ...t, title: '构思完成', status: 'success' } : t,
              ),
            }))
          } else if (eventName === 'tool_call') {
            const id = String(payload.id || payload.name || Date.now())
            const name = String(payload.name || 'tool')
            const args = payload.args
            const title = formatAgentActionTitle(name, args, 'call')
            const description = formatAgentActionDetail(name, args)
            updateAssistant((m) => {
              const key = `tool-${id}`
              const exists = m.thoughts.some((t) => t.key === key)
              const item: ThoughtItem = {
                key,
                title,
                description,
                status: 'loading',
                toolName: name,
                toolArgs: args,
              }
              return {
                ...m,
                thoughts: exists
                  ? m.thoughts.map((t) => (t.key === key ? { ...t, ...item } : t))
                  : [...m.thoughts, item],
              }
            })
          } else if (eventName === 'tool_result') {
            const id = String(payload.id || payload.name || '')
            const name = String(payload.name || 'tool')
            const output = String(payload.output || '')
            const status = payload.status === 'error' ? 'error' : 'success'
            updateAssistant((m) => {
              const key = `tool-${id}`
              const prev = m.thoughts.find((t) => t.key === key)
              const args = prev?.toolArgs
              const toolName = prev?.toolName || name
              const item: ThoughtItem = {
                key,
                title: formatAgentActionTitle(toolName, args, 'result'),
                description: prev?.description || formatAgentActionDetail(toolName, args),
                content: output,
                status: status as ThoughtItem['status'],
                toolName,
                toolArgs: args,
              }
              return {
                ...m,
                thoughts: prev
                  ? m.thoughts.map((t) => (t.key === key ? { ...t, ...item } : t))
                  : [...m.thoughts, item],
              }
            })
          } else if (eventName === 'done') {
            if (payload.deck && typeof payload.deck === 'object') {
              onDeckUpdate(payload.deck as Deck)
            }
            if (payload.patch_applied) onStatus(`${ASSISTANT_DISPLAY_NAME}已更新卡组草稿`)
            else if (payload.patch_error)
              onStatus(`回复已保存，但改套未应用：${payload.patch_error}`)
            updateAssistant((m) => ({
              ...m,
              status: 'success',
              patchApplied: Boolean(payload.patch_applied),
              patchError: (payload.patch_error as string | null) || null,
              thoughts: m.thoughts.map((t) =>
                t.status === 'loading' ? { ...t, status: 'success' } : t,
              ),
            }))
          } else if (eventName === 'error') {
            throw new Error(String(payload.message || '流式对话失败'))
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '对话失败'
      onError(msg)
      setMessages((prev) =>
        prev.map((m) =>
          m.key.startsWith('a-') && m.status === 'loading'
            ? {
                ...m,
                status: 'error',
                content: m.content || msg,
                thoughts: m.thoughts.map((t) =>
                  t.status === 'loading' ? { ...t, status: 'error' } : t,
                ),
              }
            : m,
        ),
      )
    } finally {
      onBusyChange(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void send()
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <div className="forge-chat">
      <div className="forge-chat-head">
        <div className="forge-chat-title">
          <div className="forge-chat-icon" aria-hidden>
            <img src={sparklesIcon} alt="" width={16} height={16} />
          </div>
          <h2>{ASSISTANT_DISPLAY_NAME}</h2>
        </div>
      </div>

      <div className="forge-chat-log" ref={logRef}>
        {messages.length === 0 && (
          <div className="forge-msg assistant">
            <div className="forge-msg-role">
              <img src={gemIcon} alt="" width={12} height={12} />
              {ASSISTANT_DISPLAY_NAME}
            </div>
            <div className="forge-msg-bubble">
              <MessageBody
                role="assistant"
                content="你好。说出你想编织的节奏与流派，我会为你织入卡牌。"
              />
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.key} className={`forge-msg ${m.role}`}>
            <div className="forge-msg-role">
              {m.role === 'assistant' ? (
                <>
                  <img src={gemIcon} alt="" width={12} height={12} />
                  {ASSISTANT_DISPLAY_NAME}
                </>
              ) : (
                '你'
              )}
            </div>
            {m.thoughts.length > 0 && (
              <div className="forge-thoughts">
                {m.thoughts.map((t) => {
                  const open = expandedThoughts[`${m.key}-${t.key}`]
                  return (
                    <button
                      key={t.key}
                      type="button"
                      className={`forge-thought ${t.status || ''}`}
                      onClick={() =>
                        setExpandedThoughts((prev) => ({
                          ...prev,
                          [`${m.key}-${t.key}`]: !prev[`${m.key}-${t.key}`],
                        }))
                      }
                    >
                      <strong>{t.title}</strong>
                      {t.description && <span>{t.description}</span>}
                      {open && t.content && <pre>{t.content}</pre>}
                    </button>
                  )
                })}
              </div>
            )}
            <div className={`forge-msg-bubble${m.role === 'assistant' ? ' forge-msg-bubble-md' : ''}`}>
              <MessageBody
                role={m.role}
                content={m.content}
                loading={m.status === 'loading'}
              />
            </div>
            {(m.patchApplied || m.patchError) && (
              <div className="forge-msg-tags">
                {m.patchApplied && <span className="tag-ok">已改套</span>}
                {m.patchError && <span className="tag-err">改套失败：{m.patchError}</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      <form className="forge-chat-composer" onSubmit={onSubmit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
          rows={2}
          placeholder="例如：织一套虚空瞎 / 把火球改成 1 张…"
        />
        <button type="submit" className="forge-ask" disabled={busy || !input.trim()} aria-label="发送">
          <img src={sendIcon} alt="" width={14} height={14} />
          发送
        </button>
      </form>
    </div>
  )
}
