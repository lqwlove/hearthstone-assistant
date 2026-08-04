import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { Deck } from '../types'
import { CLASS_OPTIONS } from '../types'

export function DecksPage() {
  const navigate = useNavigate()
  const [decks, setDecks] = useState<Deck[]>([])
  const [name, setName] = useState('新卡组')
  const [classSlug, setClassSlug] = useState('mage')
  const [format, setFormat] = useState<'standard' | 'wild'>('standard')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  async function refresh() {
    const list = await api.listDecks()
    setDecks(list)
  }

  useEffect(() => {
    void refresh().catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
  }, [])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setError('')
    setCreating(true)
    try {
      const deck = await api.createDeck({ name, class_slug: classSlug, format })
      // 先选英雄+模式后直接进入对应牌池的组牌页
      navigate(`/decks/${deck.id}/build`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
      setCreating(false)
    }
  }

  const classLabel = CLASS_OPTIONS.find((c) => c.value === classSlug)?.label || classSlug

  return (
    <div>
      <div className="top-row">
        <div>
          <h1>我的卡组</h1>
          <p className="muted">新建时先选择英雄与模式，进入组牌页后牌池会按该组合过滤</p>
        </div>
      </div>

      <form className="deck-create-card" onSubmit={onCreate}>
        <h2>新建牌组</h2>
        <p className="muted" style={{ marginTop: 0 }}>步骤：选择英雄与模式 → 命名 → 进入组牌</p>
        <div className="deck-create-grid">
          <label>
            英雄
            <select value={classSlug} onChange={(e) => setClassSlug(e.target.value)} required>
              {CLASS_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            模式
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as 'standard' | 'wild')}
              required
            >
              <option value="standard">标准</option>
              <option value="wild">狂野</option>
            </select>
          </label>
          <label className="deck-create-name">
            卡组名称
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="卡组名称" required />
          </label>
        </div>
        <div className="deck-create-preview muted">
          将进入：{classLabel} · {format === 'standard' ? '标准' : '狂野'} 牌池
        </div>
        <button type="submit" disabled={creating}>
          {creating ? '创建中…' : '创建并进入组牌'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      <h2 style={{ marginTop: '1.5rem' }}>已有卡组</h2>
      <div className="deck-list">
        {decks.map((d) => (
          <div key={d.id} className="deck-item">
            <div>
              <strong>{d.name}</strong>
              <div className="muted">
                {CLASS_OPTIONS.find((c) => c.value === d.class_slug)?.label || d.class_slug}
                {' · '}
                {d.format === 'standard' ? '标准' : '狂野'} · {d.status} · {d.card_count}/30
              </div>
            </div>
            <Link to={`/decks/${d.id}/build`}>
              <button type="button">进入组牌</button>
            </Link>
          </div>
        ))}
        {decks.length === 0 && <p className="muted">还没有卡组，先在上方创建吧。</p>}
      </div>
    </div>
  )
}
