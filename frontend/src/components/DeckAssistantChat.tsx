import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import type { ChatMessage, Deck } from '../types'
import { getToken } from '../api'
import sparklesIcon from '../assets/figma/sparkles.svg'
import sendIcon from '../assets/figma/send.svg'
import gemIcon from '../assets/figma/gem.svg'

type ThoughtItem = {
  key: string
  title: string
  description?: string
  content?: string
  status?: 'loading' | 'success' | 'error' | 'abort'
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
        thoughts: [{ key: 'think', title: '思考中', status: 'loading', description: '准备调用教练 Agent' }],
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
                  ? { ...t, description: String(payload.message || '思考中'), status: 'loading' }
                  : t,
              ),
            }))
          } else if (eventName === 'token') {
            const piece = String(payload.text || '')
            updateAssistant((m) => ({
              ...m,
              content: m.content + piece,
              thoughts: m.thoughts.map((t) =>
                t.key === 'think' ? { ...t, title: '思考完成', status: 'success' } : t,
              ),
            }))
          } else if (eventName === 'tool_call') {
            const id = String(payload.id || payload.name || Date.now())
            const name = String(payload.name || 'tool')
            const args = payload.args ? JSON.stringify(payload.args, null, 0) : ''
            updateAssistant((m) => {
              const exists = m.thoughts.some((t) => t.key === `tool-${id}`)
              const nextThoughts = exists
                ? m.thoughts.map((t) =>
                    t.key === `tool-${id}`
                      ? { ...t, title: `调用工具：${name}`, description: args, status: 'loading' as const }
                      : t,
                  )
                : [
                    ...m.thoughts,
                    {
                      key: `tool-${id}`,
                      title: `调用工具：${name}`,
                      description: args,
                      status: 'loading' as const,
                    },
                  ]
              return { ...m, thoughts: nextThoughts }
            })
          } else if (eventName === 'tool_result') {
            const id = String(payload.id || payload.name || '')
            const name = String(payload.name || 'tool')
            const output = String(payload.output || '')
            const status = payload.status === 'error' ? 'error' : 'success'
            updateAssistant((m) => {
              const key = `tool-${id}`
              const has = m.thoughts.some((t) => t.key === key)
              const item: ThoughtItem = {
                key,
                title: `工具结果：${name}`,
                content: output,
                status: status as ThoughtItem['status'],
              }
              return {
                ...m,
                thoughts: has
                  ? m.thoughts.map((t) => (t.key === key ? { ...t, ...item } : t))
                  : [...m.thoughts, item],
              }
            })
          } else if (eventName === 'done') {
            if (payload.deck && typeof payload.deck === 'object') {
              onDeckUpdate(payload.deck as Deck)
            }
            if (payload.patch_applied) onStatus('助手已更新卡组草稿')
            else if (payload.patch_error) onStatus(`助手回复已保存，但改套未应用：${payload.patch_error}`)
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
          <div>
            <h2>组牌助手</h2>
            <p className="forge-chat-status">在线 · 协作组牌</p>
          </div>
        </div>
      </div>

      <p className="forge-chat-hint">
        说清节奏或流派后，助手会直接往卡组里加减牌；你可以随时要求改某一张。
      </p>

      <div className="forge-chat-log" ref={logRef}>
        {messages.length === 0 && (
          <div className="forge-msg assistant">
            <div className="forge-msg-role">
              <img src={gemIcon} alt="" width={12} height={12} />
              助手
            </div>
            <div className="forge-msg-bubble">
              你好，我是组牌助手。告诉我你想打的节奏、流派、禁卡和预算，定下来我就会直接往卡组里加牌。
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.key} className={`forge-msg ${m.role}`}>
            <div className="forge-msg-role">
              {m.role === 'assistant' ? (
                <>
                  <img src={gemIcon} alt="" width={12} height={12} />
                  助手
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
            <div className="forge-msg-bubble">
              {m.content || (m.status === 'loading' ? '…' : '')}
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
          placeholder="例如：组一套虚空瞎 / 把火球改成 1 张 / 删掉凯恩…"
        />
        <button type="submit" className="forge-ask" disabled={busy || !input.trim()}>
          <img src={sendIcon} alt="" width={16} height={16} />
          提问
        </button>
      </form>
    </div>
  )
}
