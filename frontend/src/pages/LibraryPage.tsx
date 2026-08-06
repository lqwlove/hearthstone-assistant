import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { ForgeSelect } from '../components/ForgeSelect'
import searchIcon from '../assets/figma/search.svg'
import type { Card, Deck } from '../types'
import { CLASS_OPTIONS } from '../types'

const RARITY_LABEL: Record<string, string> = {
  free: '免费',
  common: '普通',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说',
}

const TYPE_LABEL: Record<string, string> = {
  minion: '随从',
  spell: '法术',
  weapon: '武器',
  hero: '英雄牌',
  location: '地标',
}

const RARITY_PILLS = [
  { value: 'common', label: '普通' },
  { value: 'rare', label: '稀有' },
  { value: 'epic', label: '史诗' },
  { value: 'legendary', label: '传说' },
] as const

const TYPE_PILLS = [
  { value: 'minion', label: '随从' },
  { value: 'spell', label: '法术' },
  { value: 'weapon', label: '武器' },
] as const

const PAGE_SIZE = 12

function rarityClass(slug: string) {
  const key = slug?.toLowerCase?.() || 'common'
  if (key in RARITY_LABEL) return `rarity-${key}`
  return 'rarity-common'
}

function stripCardText(text: string) {
  return (text || '')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
}

export function LibraryPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Card[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [manaCost, setManaCost] = useState<number | '7+' | null>(null)
  const [classSlug, setClassSlug] = useState('')
  const [rarity, setRarity] = useState('')
  const [cardType, setCardType] = useState('')
  const [format, setFormat] = useState<'standard' | 'wild' | ''>('standard')
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [decks, setDecks] = useState<Deck[]>([])
  const [targetDeckId, setTargetDeckId] = useState<number | ''>('')
  const [addMsg, setAddMsg] = useState('')
  const [syncToken, setSyncToken] = useState('dev-sync-token')
  const [syncMsg, setSyncMsg] = useState('')
  const [gotoPage, setGotoPage] = useState('')

  const selected = useMemo(
    () => items.find((c) => c.id === selectedId) || items[0] || null,
    [items, selectedId],
  )

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, total)

  const compatibleDecks = useMemo(() => {
    if (!selected) return decks.filter((d) => d.status === 'draft')
    return decks.filter(
      (d) =>
        d.status === 'draft' &&
        (selected.class_slug === 'neutral' || d.class_slug === selected.class_slug),
    )
  }, [decks, selected])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 280)
    return () => window.clearTimeout(t)
  }, [q])

  useEffect(() => {
    void api
      .listDecks()
      .then((list) => {
        setDecks(list)
        const draft = list.find((d) => d.status === 'draft')
        if (draft) setTargetDeckId(draft.id)
      })
      .catch(() => setDecks([]))
  }, [])

  async function load(p = 1) {
    setError('')
    setBusy(true)
    try {
      const res = await api.listCards({
        q: debouncedQ || undefined,
        cost: manaCost === null || manaCost === '7+' ? undefined : manaCost,
        cost_min: manaCost === '7+' ? 7 : undefined,
        class_slug: classSlug || undefined,
        rarity_slug: rarity || undefined,
        card_type: cardType || undefined,
        format: format || undefined,
        page: p,
        page_size: PAGE_SIZE,
      })
      setItems(res.items)
      setTotal(res.total)
      setPage(res.page)
      setSelectedId((prev) => {
        if (prev && res.items.some((c) => c.id === prev)) return prev
        return res.items[0]?.id ?? null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, manaCost, classSlug, rarity, cardType, format])

  useEffect(() => {
    if (!targetDeckId && compatibleDecks[0]) {
      setTargetDeckId(compatibleDecks[0].id)
    } else if (
      targetDeckId &&
      compatibleDecks.length > 0 &&
      !compatibleDecks.some((d) => d.id === targetDeckId)
    ) {
      setTargetDeckId(compatibleDecks[0].id)
    }
  }, [compatibleDecks, targetDeckId])

  function toggleMana(value: number | '7+') {
    setManaCost((prev) => (prev === value ? null : value))
  }

  function toggleRarity(value: string) {
    setRarity((prev) => (prev === value ? '' : value))
  }

  function toggleType(value: string) {
    setCardType((prev) => (prev === value ? '' : value))
  }

  function pageButtons() {
    const maxButtons = 5
    if (pageCount <= maxButtons) {
      return Array.from({ length: pageCount }, (_, i) => i + 1)
    }
    let start = Math.max(1, page - 2)
    let end = start + maxButtons - 1
    if (end > pageCount) {
      end = pageCount
      start = Math.max(1, end - maxButtons + 1)
    }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i)
  }

  async function addToDeck() {
    if (!selected || !targetDeckId) {
      setAddMsg('请先选择一张卡和草稿卡组')
      return
    }
    setAddMsg('')
    setBusy(true)
    try {
      const deck = await api.getDeck(targetDeckId)
      const next = new Map(deck.cards.map((c) => [c.card_id, c.count]))
      const cur = next.get(selected.id) || 0
      const max = selected.rarity_slug === 'legendary' ? 1 : 2
      if (cur >= max) {
        setAddMsg(`已达上限（最多 ${max} 张）`)
        return
      }
      next.set(selected.id, cur + 1)
      const cards = Array.from(next.entries()).map(([card_id, count]) => ({ card_id, count }))
      await api.saveDraft(deck.id, { cards })
      setAddMsg(`已加入「${deck.name}」`)
      setDecks((prev) =>
        prev.map((d) => (d.id === deck.id ? { ...d, card_count: cards.reduce((a, c) => a + c.count, 0) } : d)),
      )
    } catch (err) {
      setAddMsg(err instanceof Error ? err.message : '加入失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lib-page">
      <section className="lib-filters">
        <div className="lib-filters-left">
          <ForgeSelect
            className="lib-select"
            aria-label="职业"
            value={classSlug}
            onChange={setClassSlug}
            options={[
              { value: '', label: '全部职业' },
              { value: 'neutral', label: '中立' },
              ...CLASS_OPTIONS.map((c) => ({ value: c.value, label: c.label })),
            ]}
          />

          <div className="mana-filters lib-mana">
            {Array.from({ length: 7 }, (_, n) => (
              <button
                key={n}
                type="button"
                className={`mana-btn ${manaCost === n ? 'active' : ''}`}
                onClick={() => toggleMana(n)}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              className={`mana-btn ${manaCost === '7+' ? 'active' : ''}`}
              onClick={() => toggleMana('7+')}
            >
              7+
            </button>
          </div>

          <div className="lib-pills">
            {RARITY_PILLS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`lib-pill ${rarity === p.value ? 'active' : ''} rarity-${p.value}`}
                onClick={() => toggleRarity(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="lib-pills">
            {TYPE_PILLS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`lib-pill ${cardType === p.value ? 'active' : ''}`}
                onClick={() => toggleType(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="lib-pills">
            <button
              type="button"
              className={`lib-pill ${format === 'standard' ? 'active' : ''}`}
              onClick={() => setFormat(format === 'standard' ? '' : 'standard')}
            >
              标准
            </button>
            <button
              type="button"
              className={`lib-pill ${format === 'wild' ? 'active' : ''}`}
              onClick={() => setFormat(format === 'wild' ? '' : 'wild')}
            >
              狂野
            </button>
          </div>
        </div>

        <label className="lib-search">
          <img src={searchIcon} alt="" width={14} height={14} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索卡牌名称或效果…"
            aria-label="搜索卡牌"
          />
        </label>
      </section>

      {(error || syncMsg) && (
        <div className="lib-alerts">
          {error && <p className="error">{error}</p>}
          {syncMsg && (
            <p className={syncMsg.includes('失败') || syncMsg.includes('无效') ? 'error' : 'ok'}>
              {syncMsg}
            </p>
          )}
        </div>
      )}

      <div className="lib-main">
        <section className="lib-left">
          <div className="lib-grid">
            {items.map((card, index) => (
              <button
                key={card.id}
                type="button"
                className={`lib-card ${rarityClass(card.rarity_slug)} ${
                  selected?.id === card.id ? 'selected' : ''
                }`}
                style={{ animationDelay: `${Math.min(index, 11) * 24}ms` }}
                onClick={() => setSelectedId(card.id)}
              >
                <div className="lib-card-art">
                  {card.image_url ? (
                    <img src={card.image_url} alt={card.name} loading="lazy" />
                  ) : (
                    <div className="lib-card-fallback">
                      <span className="lib-card-cost">{card.cost ?? '-'}</span>
                      <strong>{card.name}</strong>
                    </div>
                  )}
                </div>
                <div className="lib-card-meta">
                  <strong>{card.name}</strong>
                  <span>
                    {TYPE_LABEL[card.card_type] || card.card_type}
                    {' · '}
                    {RARITY_LABEL[card.rarity_slug] || card.rarity_slug}
                  </span>
                </div>
              </button>
            ))}
            {items.length === 0 && !busy && <p className="lib-empty">没有匹配的卡牌</p>}
          </div>
        </section>

        <aside className="lib-inspector">
          {selected ? (
            <>
              <div className={`lib-preview ${rarityClass(selected.rarity_slug)}`}>
                {selected.image_url ? (
                  <img src={selected.image_url} alt={selected.name} />
                ) : (
                  <div className="lib-preview-fallback">
                    <span>{selected.cost ?? '-'}</span>
                    <strong>{selected.name}</strong>
                  </div>
                )}
              </div>

              <div className="lib-inspect-title">
                <strong>{selected.name}</strong>
                <span>
                  {TYPE_LABEL[selected.card_type] || selected.card_type}
                  {' · '}
                  {RARITY_LABEL[selected.rarity_slug] || selected.rarity_slug}
                </span>
              </div>

              <div className="lib-stat-row">
                <div className="lib-stat-box">
                  <span>费用</span>
                  <strong>{selected.cost ?? '-'}</strong>
                </div>
                <div className="lib-stat-box">
                  <span>稀有度</span>
                  <strong className={rarityClass(selected.rarity_slug)}>
                    {RARITY_LABEL[selected.rarity_slug] || selected.rarity_slug}
                  </strong>
                </div>
              </div>

              <div className="lib-effect">
                <span>卡牌效果</span>
                <p>{stripCardText(selected.text) || '（无效果文本）'}</p>
              </div>

              <label className="lib-deck-pick">
                <span>目标草稿卡组</span>
                <ForgeSelect
                  aria-label="目标草稿卡组"
                  value={targetDeckId === '' ? '' : String(targetDeckId)}
                  onChange={(v) => setTargetDeckId(v ? Number(v) : '')}
                  options={[
                    { value: '', label: '选择卡组…' },
                    ...compatibleDecks.map((d) => ({
                      value: String(d.id),
                      label: `${d.name}（${d.card_count}/30）`,
                    })),
                  ]}
                />
              </label>

              <button
                type="button"
                className="lib-add-btn"
                disabled={busy || !targetDeckId}
                onClick={() => void addToDeck()}
              >
                <span aria-hidden>+</span>
                加入卡组
              </button>
              {addMsg && <p className="lib-add-msg">{addMsg}</p>}
              {targetDeckId && (
                <button
                  type="button"
                  className="lib-goto-builder"
                  onClick={() => navigate(`/decks/${targetDeckId}/build`)}
                >
                  打开组牌台 →
                </button>
              )}
              <Link className="lib-detail-link" to={`/cards/${selected.id}`}>
                查看详情
              </Link>
            </>
          ) : (
            <p className="lib-empty">选择左侧卡牌查看详情</p>
          )}

          <details className="lib-sync">
            <summary>同步官方数据</summary>
            <div className="lib-sync-row">
              <input
                value={syncToken}
                onChange={(e) => setSyncToken(e.target.value)}
                placeholder="同步令牌"
                aria-label="同步令牌"
              />
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={async () => {
                  setSyncMsg('')
                  try {
                    const res = await api.syncCards(syncToken)
                    setSyncMsg(res.message)
                    if (res.ok) void load(1)
                  } catch (err) {
                    setSyncMsg(err instanceof Error ? err.message : '同步失败')
                  }
                }}
              >
                同步
              </button>
            </div>
          </details>
        </aside>
      </div>

      <footer className="lib-footer">
        <span>
          显示 {rangeStart} - {rangeEnd} / 共 {total} 张
        </span>
        <div className="lib-pagination">
          <button
            type="button"
            className="lib-page-nav"
            disabled={page <= 1 || busy}
            onClick={() => void load(page - 1)}
            aria-label="上一页"
          >
            ‹
          </button>
          {pageButtons().map((n) => (
            <button
              key={n}
              type="button"
              className={`lib-page-num ${n === page ? 'active' : ''}`}
              disabled={busy}
              onClick={() => void load(n)}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            className="lib-page-nav"
            disabled={page >= pageCount || busy}
            onClick={() => void load(page + 1)}
            aria-label="下一页"
          >
            ›
          </button>
        </div>
        <form
          className="lib-goto"
          onSubmit={(e) => {
            e.preventDefault()
            const n = Number(gotoPage)
            if (!Number.isFinite(n) || n < 1 || n > pageCount) return
            void load(n)
            setGotoPage('')
          }}
        >
          <input
            value={gotoPage}
            onChange={(e) => setGotoPage(e.target.value)}
            placeholder="跳转页码…"
            inputMode="numeric"
            aria-label="跳转页码"
          />
        </form>
      </footer>
    </div>
  )
}
