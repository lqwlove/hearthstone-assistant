import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { api } from '../api'
import { DeckAssistantChat } from '../components/DeckAssistantChat'
import type { AssistantPhase, Card, ChatMessage, Deck, ValidationResult } from '../types'
import { CLASS_OPTIONS, formatSetLabel } from '../types'

type LocalCount = Record<string, number>

async function loadBuilderPool(classSlug: string, format: string): Promise<Card[]> {
  const pageSize = 100
  const all: Card[] = []
  let page = 1
  let total = Infinity
  while (all.length < total) {
    const res = await api.listCards({
      class_slug: classSlug,
      include_neutral: true,
      format,
      page,
      page_size: pageSize,
    })
    total = res.total
    all.push(...res.items)
    if (res.items.length === 0) break
    page += 1
    if (page > 50) break
  }
  return all.sort((a, b) => (a.cost ?? 99) - (b.cost ?? 99) || a.name.localeCompare(b.name, 'zh'))
}

export function BuilderPage() {
  const { id = '' } = useParams()
  const deckId = Number(id)
  const [deck, setDeck] = useState<Deck | null>(null)
  const [counts, setCounts] = useState<LocalCount>({})
  const [pool, setPool] = useState<Card[]>([])
  const [q, setQ] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [phase, setPhase] = useState<AssistantPhase>('coaching')
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
    const [d, chat] = await Promise.all([api.getDeck(deckId), api.getChat(deckId)])
    applyDeck(d)
    setMessages(chat.messages)
    setPhase(chat.phase || (d.assistant_phase as AssistantPhase) || 'coaching')
    const cards = await loadBuilderPool(d.class_slug, d.format)
    setPool(cards)
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

  async function startBuilding() {
    setBusy(true)
    setError('')
    try {
      const res = await api.startBuilding(deckId)
      setPhase(res.phase)
      setStatus('已进入组牌阶段，助手可以改套了')
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换失败')
    } finally {
      setBusy(false)
    }
  }

  async function returnToCoaching() {
    setBusy(true)
    setError('')
    try {
      const res = await api.returnToCoaching(deckId)
      setPhase(res.phase)
      setStatus('已回到澄清阶段，改套已禁用')
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换失败')
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

  const classLabel = CLASS_OPTIONS.find((c) => c.value === deck.class_slug)?.label || deck.class_slug

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: { colorPrimary: '#b45309', borderRadius: 8 },
      }}
    >
      <div className="builder-page">
        <header className="builder-top">
          <Link to="/decks">← 返回</Link>
          <strong>{deck.name}</strong>
          <div className="meta">
            <span>{classLabel}</span>
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
            <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
              {classLabel} + 中立 · {deck.format === 'standard' ? '标准' : '狂野'}（共 {pool.length} 张）
            </p>
            <input
              placeholder="搜索牌池"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ marginBottom: 12 }}
            />
            <div className="builder-pool-list">
              {filteredPool.map((card) => {
                const n = counts[card.id] || 0
                const max = card.rarity_slug === 'legendary' ? 1 : 2
                return (
                  <div key={card.id} className="pool-item">
                    <div className="pool-item-art">
                      {card.image_url ? (
                        <img src={card.image_url} alt={card.name} loading="lazy" />
                      ) : (
                        <span className="pool-item-cost">{card.cost ?? '-'}</span>
                      )}
                    </div>
                    <div className="pool-item-meta">
                      <strong>
                        {card.cost ?? '-'} {card.name}
                      </strong>
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
            </div>
            {filteredPool.length === 0 && (
              <p className="muted">当前英雄/模式下牌池为空。请先在牌库页同步官方卡牌。</p>
            )}
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
                  <button type="button" className="ghost" onClick={() => setCount(cardId, count - 1)}>
                    -
                  </button>
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

          <section className="builder-col builder-chat-col">
            <DeckAssistantChat
              deckId={deckId}
              phase={phase}
              history={messages}
              busy={busy}
              onBusyChange={setBusy}
              onPhaseChange={setPhase}
              onDeckUpdate={applyDeck}
              onStatus={setStatus}
              onError={setError}
              onStartBuilding={() => void startBuilding()}
              onReturnToCoaching={() => void returnToCoaching()}
              persistDraft={persistDraft}
            />
          </section>
        </div>
      </div>
    </ConfigProvider>
  )
}
