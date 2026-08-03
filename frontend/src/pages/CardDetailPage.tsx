import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import type { Card } from '../types'
import { formatSetLabel } from '../types'

export function CardDetailPage() {
  const { id = '' } = useParams()
  const [card, setCard] = useState<Card | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void api
      .getCard(id)
      .then(setCard)
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
  }, [id])

  if (error) {
    return (
      <div>
        <Link to="/library">← 返回牌库</Link>
        <p className="error">{error}</p>
      </div>
    )
  }
  if (!card) return <p className="muted">加载中…</p>

  return (
    <div>
      <Link to="/library">← 返回牌库</Link>
      <div className="top-row" style={{ marginTop: '1rem' }}>
        <div>
          <h1>{card.name}</h1>
          <p className="muted">
            {card.class_slug} · {card.rarity_slug} · {card.card_type}
          </p>
          <p className="card-set-detail">
            系列 <strong>{formatSetLabel(card.set_slug)}</strong>
            <span className="card-id">ID #{card.id}</span>
          </p>
        </div>
        <div className="cost" style={{ width: 48, height: 48, fontSize: '1.2rem' }}>{card.cost ?? '-'}</div>
      </div>
      <div
        style={{
          maxWidth: 720,
          background: 'var(--bg-panel)',
          border: '1px solid var(--line)',
          borderRadius: 16,
          padding: '1.25rem',
        }}
      >
        <p style={{ whiteSpace: 'pre-wrap' }}>{card.text || '（无效果文本）'}</p>
        <p className="muted">
          标准：{card.is_standard ? '可用' : '不可用'} · 狂野：{card.is_wild ? '可用' : '不可用'}
        </p>
        {card.image_url && (
          <img src={card.image_url} alt={card.name} style={{ maxWidth: '100%', marginTop: 12, borderRadius: 8 }} />
        )}
      </div>
    </div>
  )
}
