import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { Card } from '../types'
import { CLASS_OPTIONS } from '../types'

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
        page_size: 40,
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
    <div>
      <div className="top-row">
        <div>
          <h1>牌库</h1>
          <p className="muted">全量卡池预览 · 共 {total} 张</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            style={{ maxWidth: 160 }}
            value={syncToken}
            onChange={(e) => setSyncToken(e.target.value)}
            placeholder="同步令牌"
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

      <div className="filters">
        <input placeholder="搜索名称" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cost} onChange={(e) => setCost(e.target.value)}>
          <option value="">费用</option>
          {Array.from({ length: 11 }, (_, i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
        <select value={classSlug} onChange={(e) => setClassSlug(e.target.value)}>
          <option value="">职业</option>
          <option value="neutral">中立</option>
          {CLASS_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <select value={rarity} onChange={(e) => setRarity(e.target.value)}>
          <option value="">稀有度</option>
          <option value="common">普通</option>
          <option value="rare">稀有</option>
          <option value="epic">史诗</option>
          <option value="legendary">传说</option>
          <option value="free">免费</option>
        </select>
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="">模式</option>
          <option value="standard">标准</option>
          <option value="wild">狂野</option>
        </select>
        <button type="button" onClick={() => void load(1)}>筛选</button>
      </div>

      {syncMsg && <p className={syncMsg.includes('失败') || syncMsg.includes('未配置') ? 'error' : 'ok'}>{syncMsg}</p>}
      {error && <p className="error">{error}</p>}

      <div className="grid-cards">
        {items.map((card) => (
          <Link key={card.id} to={`/cards/${card.id}`} className="card-tile">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="cost">{card.cost ?? '-'}</span>
              <span className="muted">{card.rarity_slug}</span>
            </div>
            <strong>{card.name}</strong>
            <div className="muted" style={{ fontSize: '0.85rem', marginTop: 6 }}>
              {card.class_slug} · {card.card_type}
            </div>
          </Link>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
        <button className="secondary" type="button" disabled={page <= 1} onClick={() => void load(page - 1)}>
          上一页
        </button>
        <span className="muted">第 {page} 页</span>
        <button
          className="secondary"
          type="button"
          disabled={page * 40 >= total}
          onClick={() => void load(page + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  )
}
