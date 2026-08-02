import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { Deck } from '../types'
import { CLASS_OPTIONS } from '../types'

export function DecksPage() {
  const [decks, setDecks] = useState<Deck[]>([])
  const [name, setName] = useState('新卡组')
  const [classSlug, setClassSlug] = useState('mage')
  const [format, setFormat] = useState<'standard' | 'wild'>('standard')
  const [error, setError] = useState('')

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
    try {
      const deck = await api.createDeck({ name, class_slug: classSlug, format })
      setDecks((prev) => [deck, ...prev])
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    }
  }

  return (
    <div>
      <div className="top-row">
        <div>
          <h1>我的卡组</h1>
          <p className="muted">草稿可随时保存，最终保存需通过规则校验</p>
        </div>
      </div>

      <form
        onSubmit={onCreate}
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr auto',
          gap: '0.6rem',
          marginBottom: '1.25rem',
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="卡组名称" required />
        <select value={classSlug} onChange={(e) => setClassSlug(e.target.value)}>
          {CLASS_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <select value={format} onChange={(e) => setFormat(e.target.value as 'standard' | 'wild')}>
          <option value="standard">标准</option>
          <option value="wild">狂野</option>
        </select>
        <button type="submit">创建</button>
      </form>

      {error && <p className="error">{error}</p>}

      <div className="deck-list">
        {decks.map((d) => (
          <div key={d.id} className="deck-item">
            <div>
              <strong>{d.name}</strong>
              <div className="muted">
                {d.class_slug} · {d.format === 'standard' ? '标准' : '狂野'} · {d.status} · {d.card_count}/30
              </div>
            </div>
            <Link to={`/decks/${d.id}/build`}>
              <button type="button">进入组牌</button>
            </Link>
          </div>
        ))}
        {decks.length === 0 && <p className="muted">还没有卡组，先创建一个吧。</p>}
      </div>
    </div>
  )
}
