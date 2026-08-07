import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { DeckAssistantChat } from '../components/DeckAssistantChat'
import searchIcon from '../assets/figma/search.svg'
import trashIcon from '../assets/figma/trash.svg'
import type { Card, ChatMessage, Deck, ValidationResult } from '../types'
import { CLASS_OPTIONS, formatSetLabel } from '../types'

type LocalCount = Record<string, number>

const TYPE_FILTERS = [
  { value: '', label: '全部类型' },
  { value: 'minion', label: '随从' },
  { value: 'spell', label: '法术' },
  { value: 'weapon', label: '武器' },
] as const

const RARITY_FILTERS = [
  { value: '', label: '全部稀有度' },
  { value: 'common', label: '普通' },
  { value: 'rare', label: '稀有' },
  { value: 'epic', label: '史诗' },
  { value: 'legendary', label: '传说' },
] as const

const TYPE_LABEL: Record<string, string> = {
  minion: '随从',
  spell: '法术',
  weapon: '武器',
  hero: '英雄牌',
  location: '地标',
}

function rarityStrip(slug?: string) {
  const key = (slug || '').toLowerCase()
  if (key === 'legendary') return 'strip-legendary'
  if (key === 'epic') return 'strip-epic'
  if (key === 'rare') return 'strip-rare'
  if (key === 'common' || key === 'free') return 'strip-common'
  return 'strip-common'
}

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
  const [classScope, setClassScope] = useState<'all' | 'class' | 'neutral'>('all')
  const [cardType, setCardType] = useState('')
  const [rarity, setRarity] = useState('')
  const [manaCost, setManaCost] = useState<number | '7+' | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
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
    const cards = await loadBuilderPool(d.class_slug, d.format)
    setPool(cards)
  }

  useEffect(() => {
    void loadAll().catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId])

  const filteredPool = useMemo(() => {
    return pool.filter((c) => {
      if (q && !c.name.includes(q)) return false
      if (classScope === 'class' && c.class_slug === 'neutral') return false
      if (classScope === 'neutral' && c.class_slug !== 'neutral') return false
      if (cardType && c.card_type !== cardType) return false
      if (rarity && c.rarity_slug !== rarity) return false
      if (manaCost === '7+') {
        if ((c.cost ?? 0) < 7) return false
      } else if (manaCost !== null && c.cost !== manaCost) {
        return false
      }
      return true
    })
  }, [pool, q, classScope, cardType, rarity, manaCost])

  const deckLines = useMemo(() => {
    return Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([cardId, count]) => {
        const card = pool.find((p) => p.id === cardId) || deck?.cards.find((c) => c.card_id === cardId)?.card
        return { cardId, count, card }
      })
      .sort((a, b) => (a.card?.cost ?? 99) - (b.card?.cost ?? 99))
  }, [counts, pool, deck])

  const manaCurve = useMemo(() => {
    const buckets = Array.from({ length: 8 }, () => 0)
    for (const { count, card } of deckLines) {
      const cost = card?.cost
      if (cost == null) continue
      const idx = cost >= 7 ? 7 : Math.max(0, cost)
      buckets[idx] += count
    }
    const max = Math.max(1, ...buckets)
    const weighted = deckLines.reduce((sum, { count, card }) => sum + (card?.cost ?? 0) * count, 0)
    const avg = total > 0 ? weighted / total : 0
    return { buckets, max, avg }
  }, [deckLines, total])

  function setCount(cardId: string, count: number) {
    setCounts((prev) => {
      const next = { ...prev }
      if (count <= 0) delete next[cardId]
      else next[cardId] = count
      return next
    })
  }

  function resetFilters() {
    setQ('')
    setClassScope('all')
    setCardType('')
    setRarity('')
    setManaCost(null)
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

  async function clearDeck() {
    if (!window.confirm('确认清空当前编辑的卡组？')) return
    setCounts({})
    setStatus('已清空卡组（尚未保存）')
    setValidation(null)
  }

  if (!deck) {
    return (
      <div className="builder-page">
        <div className="builder-loading">
          <Link to="/decks">← 返回卡组</Link>
          <span className="muted">{error || '加载中…'}</span>
        </div>
      </div>
    )
  }

  const classLabel = CLASS_OPTIONS.find((c) => c.value === deck.class_slug)?.label || deck.class_slug
  const formatLabel = deck.format === 'standard' ? '标准' : '狂野'
  const filtersActive = Boolean(q || classScope !== 'all' || cardType || rarity || manaCost !== null)

  return (
    <div className="builder-page forge-builder">
      <div className="builder-body">
        <section className="builder-col builder-pool">
          <h2>卡牌库</h2>
          <div className="forge-search">
            <img src={searchIcon} alt="" width={16} height={16} />
            <input
              placeholder="搜索法术、随从名称…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="filter-chips">
            <button
              type="button"
              className={`chip ${classScope === 'all' ? 'chip-purple' : ''}`}
              onClick={() => setClassScope('all')}
            >
              全部
            </button>
            <button
              type="button"
              className={`chip ${classScope === 'class' ? 'chip-purple' : ''}`}
              onClick={() => setClassScope('class')}
            >
              {classLabel}
            </button>
            <button
              type="button"
              className={`chip ${classScope === 'neutral' ? 'chip-purple' : ''}`}
              onClick={() => setClassScope('neutral')}
            >
              中立
            </button>
          </div>

          <div className="filter-chips">
            {TYPE_FILTERS.map((t) => (
              <button
                key={t.value || 'all-type'}
                type="button"
                className={`chip ${cardType === t.value ? 'chip-amber' : ''}`}
                onClick={() => setCardType(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="filter-chips">
            {RARITY_FILTERS.map((r) => (
              <button
                key={r.value || 'all-rarity'}
                type="button"
                className={`chip ${rarity === r.value ? 'chip-amber' : ''}`}
                onClick={() => setRarity(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="mana-filters">
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                type="button"
                className={`mana-btn ${manaCost === n ? 'active' : ''}`}
                onClick={() => setManaCost(manaCost === n ? null : n)}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              className={`mana-btn ${manaCost === '7+' ? 'active' : ''}`}
              onClick={() => setManaCost(manaCost === '7+' ? null : '7+')}
            >
              7+
            </button>
          </div>

          <div className="pool-summary">
            <span>
              显示 {filteredPool.length} 张 · {classLabel} · {formatLabel}
            </span>
            {filtersActive && (
              <button type="button" className="linkish" onClick={resetFilters}>
                重置筛选
              </button>
            )}
          </div>

          <div className="builder-pool-grid">
            {filteredPool.map((card) => {
              const n = counts[card.id] || 0
              const max = card.rarity_slug === 'legendary' ? 1 : 2
              return (
                <button
                  key={card.id}
                  type="button"
                  className={`pool-card ${n > 0 ? 'in-deck' : ''}`}
                  disabled={n >= max}
                  onClick={() => setCount(card.id, Math.min(max, n + 1))}
                  title={`${card.name} · ${formatSetLabel(card.set_slug)}`}
                >
                  <div className="pool-card-art">
                    {card.image_url ? (
                      <img src={card.image_url} alt={card.name} loading="lazy" />
                    ) : (
                      <div className="pool-card-fallback">{card.name}</div>
                    )}
                    <div className="pool-card-shade" />
                  </div>
                  <div className="pool-card-mana">{card.cost ?? '-'}</div>
                  <div className="pool-card-info">
                    <strong>{card.name}</strong>
                    <span>{TYPE_LABEL[card.card_type] || card.card_type}</span>
                  </div>
                  {n > 0 && <span className="pool-card-count">{n}x</span>}
                </button>
              )
            })}
          </div>
          {filteredPool.length === 0 && (
            <p className="muted">无匹配卡牌。可重置筛选，或先在牌库页同步官方数据。</p>
          )}
        </section>

        <section className="builder-col builder-deck">
          <div className="deck-header-block">
            <div className="deck-title-row">
              <div className="deck-title-left">
                <h2>{deck.name}</h2>
                <span className="badge-purple">{formatLabel}</span>
              </div>
              <span className="deck-count">
                {total} / 30
              </span>
            </div>
            <p className="deck-sub muted">
              {classLabel} · {deck.status === 'completed' ? '已完成' : '草稿'}
              {status ? ` · ${status}` : ''}
            </p>
          </div>

          <div className="deck-actions">
            <button type="button" className="forge-btn" disabled={busy} onClick={() => void saveDraft()}>
              保存草稿
            </button>
            <button type="button" className="forge-btn forge-btn-primary" disabled={busy} onClick={() => void finalize()}>
              最终保存
            </button>
            <button type="button" className="forge-btn" disabled={busy} onClick={() => void clearDeck()}>
              <img src={trashIcon} alt="" width={14} height={14} />
              清空卡组
            </button>
          </div>

          {error && <p className="error">{error}</p>}
          {validation && !validation.valid && (
            <ul className="violations">
              {validation.violations.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          )}

          <div className="deck-list-panel">
            {deckLines.map(({ cardId, count, card }) => (
              <div key={cardId} className="deck-row">
                <span className="deck-row-mana">{card?.cost ?? '-'}</span>
                <span className={`deck-row-strip ${rarityStrip(card?.rarity_slug)}`} />
                <span className="deck-row-name">{card?.name || cardId}</span>
                <button
                  type="button"
                  className="deck-row-count"
                  onClick={() => setCount(cardId, count - 1)}
                  title="减少一张"
                >
                  {count}x
                </button>
              </div>
            ))}
            {deckLines.length === 0 && (
              <p className="muted deck-empty">从左侧加入卡牌，或让右侧织咒师协助构筑。</p>
            )}
          </div>

          <div className="mana-curve-panel">
            <div className="mana-curve-head">
              <span>法力曲线</span>
              <span className="muted">平均费用 {manaCurve.avg.toFixed(1)}</span>
            </div>
            <div className="mana-curve-bars">
              {manaCurve.buckets.map((n, i) => (
                <div key={i} className="mana-curve-col">
                  <div className="mana-curve-track">
                    <div
                      className="mana-curve-bar"
                      style={{ height: `${(n / manaCurve.max) * 100}%` }}
                      title={`${n} 张`}
                    />
                  </div>
                  <span>{i === 7 ? '7+' : i}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="builder-col builder-chat-col">
          <DeckAssistantChat
            deckId={deckId}
            history={messages}
            busy={busy}
            onBusyChange={setBusy}
            onDeckUpdate={applyDeck}
            onStatus={setStatus}
            onError={setError}
            persistDraft={persistDraft}
          />
        </section>
      </div>
    </div>
  )
}
