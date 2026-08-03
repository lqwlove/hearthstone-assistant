import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { Card } from '../types'
import { CLASS_OPTIONS, formatSetLabel } from '../types'

const RARITY_LABEL: Record<string, string> = {
  free: '免费',
  common: '普通',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说',
}

function rarityClass(slug: string) {
  const key = slug?.toLowerCase?.() || 'common'
  if (key in RARITY_LABEL) return `rarity-${key}`
  return 'rarity-common'
}

const PAGE_SIZE = 20
const PREVIEW_MAX_WIDTH = 520
const PREVIEW_ASPECT = 680 / 512
const PREVIEW_PAD = 8
const PREVIEW_GAP = 14

function previewLayout(clientX: number, clientY: number) {
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Fit both width and height into the viewport so clamping won't fling it away.
  const maxWidthByViewport = vw - PREVIEW_PAD * 2
  const maxWidthByHeight = (vh - PREVIEW_PAD * 2) / PREVIEW_ASPECT
  const width = Math.max(160, Math.min(PREVIEW_MAX_WIDTH, maxWidthByViewport, maxWidthByHeight))
  const height = width * PREVIEW_ASPECT

  const spaceRight = vw - clientX - PREVIEW_GAP - PREVIEW_PAD
  const spaceLeft = clientX - PREVIEW_GAP - PREVIEW_PAD

  let left: number
  if (spaceRight >= width) {
    left = clientX + PREVIEW_GAP
  } else if (spaceLeft >= width) {
    left = clientX - PREVIEW_GAP - width
  } else {
    // Keep horizontal center as close to the cursor as possible.
    left = clientX - width / 2
  }

  // Keep the cursor roughly on the upper third of the preview.
  let top = clientY - height * 0.28

  left = Math.min(Math.max(PREVIEW_PAD, left), vw - width - PREVIEW_PAD)
  top = Math.min(Math.max(PREVIEW_PAD, top), vh - height - PREVIEW_PAD)
  return { left, top, width }
}

export function LibraryPage() {
  const [items, setItems] = useState<Card[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [cost, setCost] = useState('')
  const [classSlug, setClassSlug] = useState('')
  const [rarity, setRarity] = useState('')
  const [format, setFormat] = useState('')
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [syncToken, setSyncToken] = useState('dev-sync-token')
  const [syncMsg, setSyncMsg] = useState('')
  const [hoverCard, setHoverCard] = useState<Card | null>(null)
  const [hoverPos, setHoverPos] = useState({ left: 0, top: 0, width: PREVIEW_MAX_WIDTH })

  function showPreview(card: Card, e: MouseEvent) {
    if (!card.image_url) {
      setHoverCard(null)
      return
    }
    setHoverCard(card)
    setHoverPos(previewLayout(e.clientX, e.clientY))
  }

  function movePreview(e: MouseEvent) {
    setHoverPos(previewLayout(e.clientX, e.clientY))
  }

  function hidePreview() {
    setHoverCard(null)
  }

  async function load(p = page) {
    setError('')
    try {
      const res = await api.listCards({
        q: q || undefined,
        cost: cost === '' ? undefined : Number(cost),
        class_slug: classSlug || undefined,
        rarity_slug: rarity || undefined,
        format: format || undefined,
        page: p,
        page_size: PAGE_SIZE,
      })
      setItems(res.items)
      setTotal(res.total)
      setPage(res.page)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    }
  }

  useEffect(() => {
    void load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="library-page">
      <section className="library-hero">
        <div className="library-hero-top">
          <div>
            <h1>牌库</h1>
            <p className="lede">在余烬光晕中翻阅全量卡池——按费用、职业与稀有度精准筛选，找到下一张构筑核心。</p>
            <div className="stat-pills">
              <span className="stat-pill">
                收录 <strong>{total}</strong> 张
              </span>
              <span className="stat-pill">
                本页 <strong>{items.length}</strong>
              </span>
              {format && (
                <span className="stat-pill">
                  模式 <strong>{format === 'standard' ? '标准' : '狂野'}</strong>
                </span>
              )}
            </div>
          </div>
          <div className="sync-panel">
            <input
              value={syncToken}
              onChange={(e) => setSyncToken(e.target.value)}
              placeholder="同步令牌"
              aria-label="同步令牌"
            />
            <button
              type="button"
              className="secondary"
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
              同步官方数据
            </button>
          </div>
        </div>
      </section>

      <div className="filter-bar">
        <input placeholder="搜索名称" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cost} onChange={(e) => setCost(e.target.value)} aria-label="费用">
          <option value="">费用</option>
          {Array.from({ length: 11 }, (_, i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
        <select value={classSlug} onChange={(e) => setClassSlug(e.target.value)} aria-label="职业">
          <option value="">职业</option>
          <option value="neutral">中立</option>
          {CLASS_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select value={rarity} onChange={(e) => setRarity(e.target.value)} aria-label="稀有度">
          <option value="">稀有度</option>
          <option value="common">普通</option>
          <option value="rare">稀有</option>
          <option value="epic">史诗</option>
          <option value="legendary">传说</option>
          <option value="free">免费</option>
        </select>
        <select value={format} onChange={(e) => setFormat(e.target.value)} aria-label="模式">
          <option value="">模式</option>
          <option value="standard">标准</option>
          <option value="wild">狂野</option>
        </select>
        <button type="button" onClick={() => void load(1)}>
          筛选
        </button>
      </div>

      {syncMsg && (
        <p className={syncMsg.includes('失败') || syncMsg.includes('未配置') ? 'error' : 'ok'}>{syncMsg}</p>
      )}
      {error && <p className="error">{error}</p>}

      <div className="grid-cards">
        {items.map((card, index) => (
          <Link
            key={card.id}
            to={`/cards/${card.id}`}
            className={`card-tile has-art ${rarityClass(card.rarity_slug)}`}
            style={{ animationDelay: `${Math.min(index, 16) * 28}ms` }}
            onMouseEnter={(e) => showPreview(card, e)}
            onMouseMove={movePreview}
            onMouseLeave={hidePreview}
          >
            <div className="card-art">
              {card.image_url ? (
                <img src={card.image_url} alt={card.name} loading="lazy" />
              ) : (
                <div className="card-art-fallback">
                  <span className="cost">{card.cost ?? '-'}</span>
                  <strong>{card.name}</strong>
                  <span className="muted">{RARITY_LABEL[card.rarity_slug] ?? card.rarity_slug}</span>
                </div>
              )}
            </div>
            <div className="card-set" title={`卡牌 ID ${card.id}`}>
              {formatSetLabel(card.set_slug)}
              <span className="card-id">#{card.id}</span>
            </div>
          </Link>
        ))}
      </div>

      {hoverCard?.image_url &&
        createPortal(
          <div
            className={`card-hover-preview ${rarityClass(hoverCard.rarity_slug)}`}
            style={{ left: hoverPos.left, top: hoverPos.top, width: hoverPos.width }}
            aria-hidden
          >
            <img src={hoverCard.image_url} alt="" />
          </div>,
          document.body,
        )}

      <div className="pager">
        <button className="secondary" type="button" disabled={page <= 1} onClick={() => void load(page - 1)}>
          上一页
        </button>
        <span className="muted">
          第 {page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))} 页
        </span>
        <button
          className="secondary"
          type="button"
          disabled={page * PAGE_SIZE >= total}
          onClick={() => void load(page + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  )
}
