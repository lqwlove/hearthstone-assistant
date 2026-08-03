import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import type { Card, ChatMessage, Deck, ValidationResult } from '../types'
import { formatSetLabel } from '../types'

type LocalCount = Record<string, number>

export function BuilderPage() {
  const { id = '' } = useParams()
  const deckId = Number(id)
  const [deck, setDeck] = useState<Deck | null>(null)
  const [counts, setCounts] = useState<LocalCount>({})
  const [pool, setPool] = useState<Card[]>([])
  const [q, setQ] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const total = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts])

  function applyDeck(d: Deck) {
    setDeck(d)
    const next: LocalCount = {}
    d.cards.forEach((c) => {
      next[c.card_id] = c.count
    })
    setCounts(next)
  }

  async function loadAll() {
    const [d, chat, cards] = await Promise.all([
      api.getDeck(deckId),
      api.getChat(deckId),
      api.listCards({
        format: undefined,
        page: 1,
        page_size: 100,
      }),
    ])
    applyDeck(d)
    setMessages(chat.messages)
    // Prefer class + neutral for builder pool
    const classPool = await api.listCards({
      class_slug: d.class_slug,
      format: d.format,
      page: 1,
      page_size: 80,
    })
    const neutralPool = await api.listCards({
      class_slug: 'neutral',
      format: d.format,
      page: 1,
      page_size: 80,
    })
    const map = new Map<string, Card>()
    ;[...classPool.items, ...neutralPool.items, ...cards.items].forEach((c) => map.set(c.id, c))
    setPool([...map.values()].sort((a, b) => (a.cost ?? 99) - (b.cost ?? 99)))
  }

  useEffect(() => {
    void loadAll().catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId])

  const filteredPool = pool.filter((c) => !q || c.name.includes(q))

  const deckLines = useMemo(() => {
    return Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([cardId, count]) => {
        const card = pool.find((p) => p.id === cardId) || deck?.cards.find((c) => c.card_id === cardId)?.card
        return { cardId, count, card }
      })
      .sort((a, b) => (a.card?.cost ?? 99) - (b.card?.cost ?? 99))
  }, [counts, pool, deck])

  function setCount(cardId: string, count: number) {
    setCounts((prev) => {
      const next = { ...prev }
      if (count <= 0) delete next[cardId]
      else next[cardId] = count
      return next
    })
  }

  async function persistDraft() {
    const cards = Object.entries(counts).map(([card_id, count]) => ({ card_id, count }))
    const d = await api.saveDraft(deckId, { cards })
    applyDeck(d)
    const v = await api.validateDeck(deckId)
    setValidation(v)
    return d
  }

  async function saveDraft() {
    setBusy(true)
    setError('')
    setStatus('')
    try {
      await persistDraft()
      setStatus('草稿已保存')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function finalize() {
    setBusy(true)
    setError('')
    setStatus('')
    try {
      await persistDraft()
      const res = await api.finalizeDeck(deckId)
      applyDeck(res.deck)
      setValidation(res.validation)
      setStatus('最终保存成功')
    } catch (err) {
      setError(err instanceof Error ? err.message : '最终保存失败')
      try {
        setValidation(await api.validateDeck(deckId))
      } catch {
        /* ignore */
      }
    } finally {
      setBusy(false)
    }
  }

  async function onChat(e: FormEvent) {
    e.preventDefault()
    if (!chatInput.trim()) return
    setBusy(true)
    setError('')
    try {
      // persist current draft first so assistant sees latest
      const cards = Object.entries(counts).map(([card_id, count]) => ({ card_id, count }))
      await api.saveDraft(deckId, { cards })
      const res = await api.sendChat(deckId, chatInput.trim())
      setMessages((prev) => [...prev, ...res.messages])
      setChatInput('')
      if (res.deck) applyDeck(res.deck)
      if (res.patch_error) setStatus(`助手回复已保存，但改套未应用：${res.patch_error}`)
      else if (res.patch_applied) setStatus('助手已更新卡组草稿')
    } catch (err) {
      setError(err instanceof Error ? err.message : '对话失败')
    } finally {
      setBusy(false)
    }
  }

  if (!deck) {
    return (
      <div className="builder-page">
        <div className="builder-top">
          <Link to="/decks">← 返回</Link>
          <span className="muted">{error || '加载中…'}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="builder-page">
      <header className="builder-top">
        <Link to="/decks">← 返回</Link>
        <strong>{deck.name}</strong>
        <div className="meta">
          <span>{deck.class_slug}</span>
          <span>{deck.format === 'standard' ? '标准' : '狂野'}</span>
          <span>{total}/30</span>
          <span>{deck.status === 'completed' ? '已完成' : '草稿'}</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="secondary" disabled={busy} onClick={() => void saveDraft()}>
            保存草稿
          </button>
          <button type="button" disabled={busy} onClick={() => void finalize()}>
            最终保存
          </button>
        </div>
      </header>

      <div className="builder-body">
        <section className="builder-col">
          <h2>可选牌池</h2>
          <input placeholder="搜索牌池" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
          {filteredPool.map((card) => {
            const n = counts[card.id] || 0
            const max = card.rarity_slug === 'legendary' ? 1 : 2
            return (
              <div key={card.id} className="pool-item">
                <div>
                  <strong>{card.cost ?? '-'} {card.name}</strong>
                  <div className="muted" style={{ fontSize: '0.8rem' }}>
                    {formatSetLabel(card.set_slug)} · {card.rarity_slug} · #{card.id}
                  </div>
                </div>
                <button
                  type="button"
                  className="secondary"
                  disabled={n >= max}
                  onClick={() => setCount(card.id, Math.min(max, n + 1))}
                >
                  +{n > 0 ? ` (${n})` : ''}
                </button>
              </div>
            )
          })}
          {filteredPool.length === 0 && <p className="muted">牌池为空。请先在牌库页同步或导入卡牌数据。</p>}
        </section>

        <section className="builder-col">
          <h2>组牌操作区</h2>
          {status && <p className="ok">{status}</p>}
          {error && <p className="error">{error}</p>}
          {validation && !validation.valid && (
            <ul className="violations">
              {validation.violations.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          )}
          {deckLines.map(({ cardId, count, card }) => (
            <div key={cardId} className="deck-line">
              <span>
                {card?.cost ?? '-'} {card?.name || cardId} ×{count}
              </span>
              <span style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="ghost" onClick={() => setCount(cardId, count - 1)}>-</button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setCount(cardId, count + 1)}
                  disabled={count >= (card?.rarity_slug === 'legendary' ? 1 : 2)}
                >
                  +
                </button>
              </span>
            </div>
          ))}
          {deckLines.length === 0 && <p className="muted">从左侧加入卡牌，或让右侧助手协助构筑。</p>}
        </section>

        <section className="builder-col">
          <h2>组牌助手</h2>
          <div className="chat-log">
            {messages.map((m) => (
              <div key={m.id} className={`bubble ${m.role === 'user' ? 'user' : ''}`}>
                <div className="muted" style={{ fontSize: '0.75rem', marginBottom: 4 }}>
                  {m.role === 'user' ? '你' : '助手'}
                  {m.patch_applied ? ' · 已改套' : ''}
                  {m.patch_error ? ` · 改套失败: ${m.patch_error}` : ''}
                </div>
                {m.content}
              </div>
            ))}
          </div>
          <form className="chat-form" onSubmit={onChat}>
            <textarea
              rows={3}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="聊聊构筑方向，或说「加入改套」让 mock 助手演示改牌…"
            />
            <button type="submit" disabled={busy || !chatInput.trim()}>发送</button>
          </form>
        </section>
      </div>
    </div>
  )
}
