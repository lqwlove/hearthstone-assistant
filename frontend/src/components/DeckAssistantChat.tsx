import { useEffect, useMemo, useState } from 'react'
import { Bubble, Sender, ThoughtChain, XProvider } from '@ant-design/x'
import { Button, Flex, Space, Tag, Typography } from 'antd'
import type { AssistantPhase, ChatMessage, Deck } from '../types'
import { getToken } from '../api'

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
  phase: AssistantPhase
  history: ChatMessage[]
  busy: boolean
  onBusyChange: (busy: boolean) => void
  onPhaseChange: (phase: AssistantPhase) => void
  onDeckUpdate: (deck: Deck) => void
  onStatus: (text: string) => void
  onError: (text: string) => void
  onStartBuilding: () => void
  onReturnToCoaching: () => void
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
  phase,
  history,
  busy,
  onBusyChange,
  onPhaseChange,
  onDeckUpdate,
  onStatus,
  onError,
  onStartBuilding,
  onReturnToCoaching,
  persistDraft,
}: Props) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<UiMessage[]>(() => historyToUi(history))

  useEffect(() => {
    setMessages(historyToUi(history))
  }, [history])

  const bubbleItems = useMemo(
    () =>
      messages.map((m) => ({
        key: m.key,
        role: m.role,
        content: (
          <div>
            {m.thoughts.length > 0 && (
              <ThoughtChain
                style={{ marginBottom: 8 }}
                items={m.thoughts.map((t) => ({
                  key: t.key,
                  title: t.title,
                  description: t.description,
                  content: t.content ? (
                    <Typography.Paragraph
                      style={{ marginBottom: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}
                    >
                      {t.content}
                    </Typography.Paragraph>
                  ) : undefined,
                  status: t.status,
                  collapsible: Boolean(t.content),
                }))}
              />
            )}
            <div style={{ whiteSpace: 'pre-wrap' }}>{m.content || (m.status === 'loading' ? '…' : '')}</div>
            {(m.patchApplied || m.patchError) && (
              <div style={{ marginTop: 6 }}>
                {m.patchApplied && <Tag color="success">已改套</Tag>}
                {m.patchError && <Tag color="error">改套失败：{m.patchError}</Tag>}
              </div>
            )}
          </div>
        ),
        loading: m.status === 'loading' && !m.content && m.thoughts.length === 0,
      })),
    [messages],
  )

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
            if (payload.phase === 'coaching' || payload.phase === 'building') {
              onPhaseChange(payload.phase)
            }
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

  return (
    <XProvider>
      <Flex vertical style={{ height: '100%', minHeight: 0 }} gap={8}>
        <Flex align="center" justify="space-between" wrap gap={8}>
          <Space>
            <Typography.Text strong>组牌助手</Typography.Text>
            <Tag color={phase === 'building' ? 'processing' : 'default'}>
              {phase === 'building' ? '组牌中' : '澄清中'}
            </Tag>
          </Space>
          {phase === 'coaching' ? (
            <Button type="primary" size="small" disabled={busy} onClick={onStartBuilding}>
              开始组牌
            </Button>
          ) : (
            <Button size="small" disabled={busy} onClick={onReturnToCoaching}>
              回到澄清
            </Button>
          )}
        </Flex>
        {phase === 'coaching' && (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
            当前为澄清阶段：先聊目标和约束。确认后点击「开始组牌」，助手才能改套。
          </Typography.Paragraph>
        )}
        <div className="antdx-chat-log">
          <Bubble.List
            autoScroll
            style={{ height: '100%' }}
            role={{
              user: { placement: 'end' },
              assistant: { placement: 'start' },
            }}
            items={bubbleItems}
          />
        </div>
        <Sender
          value={input}
          onChange={setInput}
          onSubmit={() => void send()}
          loading={busy}
          placeholder={
            phase === 'coaching'
              ? '先说明目标节奏、禁卡等…确认后点「开始组牌」'
              : '可以说「改套加入」让助手演示改牌…'
          }
          disabled={busy}
        />
      </Flex>
    </XProvider>
  )
}
