import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { ForgeSelect } from '../components/ForgeSelect'
import sparkIcon from '../assets/figma/decks-spark.svg'
import starIcon from '../assets/figma/decks-star.svg'
import editIcon from '../assets/figma/decks-edit.svg'
import cloneIcon from '../assets/figma/decks-clone.svg'
import trashIcon from '../assets/figma/decks-trash.svg'
import plusIcon from '../assets/figma/decks-plus.svg'
import dustIcon from '../assets/figma/decks-dust.svg'
import type { Deck } from '../types'
import { CLASS_OPTIONS } from '../types'

const DECK_CAP = 27
const FAV_KEY = 'arcane-forge-deck-favorites'

const CLASS_COLORS: Record<string, string> = {
  mage: '#3fc7eb',
  warrior: '#c79c6e',
  hunter: '#abd473',
  warlock: '#9482c9',
  paladin: '#f58cba',
  deathknight: '#628299',
  priest: '#c0c0c0',
  rogue: '#fff468',
  shaman: '#0070de',
  druid: '#ff7d0a',
  demonhunter: '#a330c9',
}

const CLASS_EN: Record<string, string> = {
  mage: 'Mage',
  warrior: 'Warrior',
  hunter: 'Hunter',
  warlock: 'Warlock',
  paladin: 'Paladin',
  deathknight: 'Death Knight',
  priest: 'Priest',
  rogue: 'Rogue',
  shaman: 'Shaman',
  druid: 'Druid',
  demonhunter: 'Demon Hunter',
}

const DUST_COST: Record<string, number> = {
  free: 0,
  common: 40,
  rare: 100,
  epic: 400,
  legendary: 1600,
}

const SORT_OPTIONS = [
  { value: 'updated', label: '最近修改' },
  { value: 'name', label: '名称' },
  { value: 'cards', label: '卡牌数' },
] as const

type SortKey = (typeof SORT_OPTIONS)[number]['value']

function classLabel(slug: string) {
  return CLASS_OPTIONS.find((c) => c.value === slug)?.label || slug
}

function classColor(slug: string) {
  return CLASS_COLORS[slug] || '#9e958e'
}

function formatRelative(iso?: string | null) {
  if (!iso) return '刚刚'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '刚刚'
  const diff = Date.now() - t
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min}分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}小时前`
  const day = Math.floor(hr / 24)
  if (day === 1) return '昨天'
  if (day < 7) return `${day}天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

function estimateDust(deck: Deck) {
  return deck.cards.reduce((sum, row) => {
    const rarity = (row.card?.rarity_slug || 'common').toLowerCase()
    return sum + (DUST_COST[rarity] ?? 40) * row.count
  }, 0)
}

function manaCurve(deck: Deck) {
  const buckets = [0, 0, 0, 0, 0, 0, 0, 0]
  for (const row of deck.cards) {
    const cost = row.card?.cost
    const idx = cost == null ? 0 : Math.min(7, Math.max(0, cost))
    buckets[idx] += row.count
  }
  return buckets
}

function loadFavorites(): Set<number> {
  try {
    const raw = localStorage.getItem(FAV_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as number[]
    return new Set(arr)
  } catch {
    return new Set()
  }
}

function saveFavorites(ids: Set<number>) {
  localStorage.setItem(FAV_KEY, JSON.stringify([...ids]))
}

export function DecksPage() {
  const navigate = useNavigate()
  const [decks, setDecks] = useState<Deck[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [cloningId, setCloningId] = useState<number | null>(null)

  const [format, setFormat] = useState<'standard' | 'wild' | ''>('standard')
  const [classSlug, setClassSlug] = useState('')
  const [sort, setSort] = useState<SortKey>('updated')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [favorites, setFavorites] = useState<Set<number>>(() => loadFavorites())

  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('新卡组')
  const [createClass, setCreateClass] = useState('mage')
  const [createFormat, setCreateFormat] = useState<'standard' | 'wild'>('standard')

  async function refresh() {
    const list = await api.listDecks()
    setDecks(list)
    setSelectedId((prev) => {
      if (prev && list.some((d) => d.id === prev)) return prev
      return list[0]?.id ?? null
    })
  }

  useEffect(() => {
    void refresh().catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
  }, [])

  const filtered = useMemo(() => {
    let list = decks.filter((d) => {
      if (format && d.format !== format) return false
      if (classSlug && d.class_slug !== classSlug) return false
      return true
    })
    list = [...list].sort((a, b) => {
      if (favorites.has(a.id) !== favorites.has(b.id)) {
        return favorites.has(a.id) ? -1 : 1
      }
      if (sort === 'name') return a.name.localeCompare(b.name, 'zh-CN')
      if (sort === 'cards') return b.card_count - a.card_count
      const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0
      const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0
      return tb - ta
    })
    return list
  }, [decks, format, classSlug, sort, favorites])

  const selected = useMemo(
    () => decks.find((d) => d.id === selectedId) || filtered[0] || null,
    [decks, selectedId, filtered],
  )

  const selectedCurve = useMemo(() => (selected ? manaCurve(selected) : []), [selected])
  const selectedDust = useMemo(() => (selected ? estimateDust(selected) : 0), [selected])
  const curveMax = Math.max(1, ...selectedCurve)

  function toggleFavorite(id: number, e: MouseEvent) {
    e.stopPropagation()
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveFavorites(next)
      return next
    })
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (decks.length >= DECK_CAP) {
      setError(`卡组数量已达上限 ${DECK_CAP}`)
      return
    }
    setError('')
    setBusy(true)
    try {
      const deck = await api.createDeck({
        name: createName.trim() || '新卡组',
        class_slug: createClass,
        format: createFormat,
      })
      navigate(`/decks/${deck.id}/build`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
      setBusy(false)
    }
  }

  async function onAiGenerate() {
    if (decks.length >= DECK_CAP) {
      setError(`卡组数量已达上限 ${DECK_CAP}`)
      return
    }
    setError('')
    setBusy(true)
    try {
      const deck = await api.createDeck({
        name: 'AI 智能卡组',
        class_slug: createClass || classSlug || 'mage',
        format: format === 'wild' ? 'wild' : 'standard',
      })
      navigate(`/decks/${deck.id}/build`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
      setBusy(false)
    }
  }

  async function onDelete(deck: Deck, e?: MouseEvent) {
    e?.stopPropagation()
    if (!window.confirm(`确认删除卡组「${deck.name}」？此操作不可恢复。`)) return
    setError('')
    setDeletingId(deck.id)
    try {
      await api.deleteDeck(deck.id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeletingId(null)
    }
  }

  async function onClone(deck: Deck, e: MouseEvent) {
    e.stopPropagation()
    if (decks.length >= DECK_CAP) {
      setError(`卡组数量已达上限 ${DECK_CAP}`)
      return
    }
    setError('')
    setCloningId(deck.id)
    try {
      const copy = await api.createDeck({
        name: `${deck.name} 副本`.slice(0, 128),
        class_slug: deck.class_slug,
        format: deck.format === 'wild' ? 'wild' : 'standard',
      })
      if (deck.cards.length) {
        await api.saveDraft(copy.id, {
          cards: deck.cards.map((c) => ({ card_id: c.card_id, count: c.count })),
        })
      }
      await refresh()
      setSelectedId(copy.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '复制失败')
    } finally {
      setCloningId(null)
    }
  }

  const classPills = [
    { value: '', label: '全部' },
    ...CLASS_OPTIONS.map((c) => ({ value: c.value, label: c.label })),
  ]

  return (
    <div className="decks-page">
      <section className="decks-controls">
        <div className="decks-filters-row">
          <div className="decks-class-pills">
            {classPills.map((p) => {
              const active = classSlug === p.value
              const color = p.value ? classColor(p.value) : undefined
              return (
                <button
                  key={p.value || 'all'}
                  type="button"
                  className={`decks-class-pill ${active ? 'active' : ''}`}
                  style={
                    active && color
                      ? { borderColor: color, color, background: `${color}1a` }
                      : undefined
                  }
                  onClick={() => setClassSlug(p.value)}
                >
                  {p.value ? (
                    <span className="decks-class-dot" style={{ background: color }} />
                  ) : null}
                  {p.label}
                </button>
              )
            })}
          </div>

          <div className="decks-filters-right">
            <div className="decks-format-toggle" role="group" aria-label="模式">
              <button
                type="button"
                className={format === 'standard' ? 'active' : ''}
                onClick={() => setFormat('standard')}
              >
                标准
              </button>
              <button
                type="button"
                className={format === 'wild' ? 'active' : ''}
                onClick={() => setFormat('wild')}
              >
                狂野
              </button>
            </div>

            <ForgeSelect
              className="decks-sort"
              aria-label="排序"
              value={sort}
              onChange={(v) => setSort(v as SortKey)}
              options={SORT_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />

            <button
              type="button"
              className="decks-btn-ai"
              disabled={busy}
              onClick={() => void onAiGenerate()}
            >
              <img src={sparkIcon} alt="" width={14} height={14} />
              + AI智能组牌
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="decks-alerts">
          <p className="error">{error}</p>
        </div>
      )}

      <div className="decks-main">
        <section className="decks-grid-wrap">
          <div className="decks-grid">
            {filtered.map((deck, index) => {
              const color = classColor(deck.class_slug)
              const selectedCard = selected?.id === deck.id
              return (
                <article
                  key={deck.id}
                  className={`decks-card ${selectedCard ? 'selected' : ''}`}
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms`, ['--class-color' as string]: color }}
                  onClick={() => setSelectedId(deck.id)}
                >
                  <div className="decks-card-strip" />
                  <div className="decks-card-body">
                    <div className="decks-card-title-row">
                      <strong>{deck.name}</strong>
                      <button
                        type="button"
                        className={`decks-fav ${favorites.has(deck.id) ? 'on' : ''}`}
                        aria-label={favorites.has(deck.id) ? '取消收藏' : '收藏'}
                        onClick={(e) => toggleFavorite(deck.id, e)}
                      >
                        <img src={starIcon} alt="" width={16} height={16} />
                      </button>
                    </div>
                    <div className="decks-card-tags">
                      <span className="decks-tag-class" style={{ color, borderColor: color, background: `${color}1a` }}>
                        {classLabel(deck.class_slug)}
                      </span>
                      <span className="decks-tag-format">
                        {deck.format === 'wild' ? '狂野' : '标准'}
                      </span>
                    </div>
                    <div className="decks-card-stats">
                      <div>
                        <span>卡牌</span>
                        <strong>
                          {deck.card_count}
                          <em>/30</em>
                        </strong>
                      </div>
                      <div className="end">
                        <span>状态</span>
                        <b>{deck.status === 'completed' ? '完成' : '草稿'}</b>
                      </div>
                    </div>
                    <div className="decks-card-footer">
                      <time>{formatRelative(deck.updated_at)}</time>
                      <div className="decks-card-actions">
                        <button
                          type="button"
                          className="decks-icon-btn"
                          title="编辑"
                          aria-label="编辑"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/decks/${deck.id}/build`)
                          }}
                        >
                          <img src={editIcon} alt="" width={14} height={14} />
                        </button>
                        <button
                          type="button"
                          className="decks-icon-btn"
                          title="复制"
                          aria-label="复制"
                          disabled={cloningId === deck.id}
                          onClick={(e) => void onClone(deck, e)}
                        >
                          <img src={cloneIcon} alt="" width={14} height={14} />
                        </button>
                        <button
                          type="button"
                          className="decks-icon-btn danger"
                          title="删除"
                          aria-label="删除"
                          disabled={deletingId === deck.id}
                          onClick={(e) => void onDelete(deck, e)}
                        >
                          <img src={trashIcon} alt="" width={14} height={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}

            <button
              type="button"
              className="decks-card decks-card-new"
              disabled={busy || cloningId != null || deletingId != null}
              onClick={() => setCreateOpen(true)}
            >
              <span className="decks-new-plus">
                <img src={plusIcon} alt="" width={16} height={16} />
              </span>
              <strong>新建卡组</strong>
              <span>手动或导入套牌代码</span>
            </button>
          </div>
        </section>

        <aside className="decks-inspector">
          {selected ? (
            <>
              <div className="decks-insp-header">
                <div className="decks-insp-meta">
                  <span
                    className="decks-tag-class"
                    style={{
                      color: classColor(selected.class_slug),
                      borderColor: classColor(selected.class_slug),
                      background: `${classColor(selected.class_slug)}1a`,
                    }}
                  >
                    {classLabel(selected.class_slug)} ({CLASS_EN[selected.class_slug] || selected.class_slug})
                  </span>
                  <span className="muted">
                    {selected.format === 'wild' ? '狂野模式' : '标准模式'}
                  </span>
                </div>
                <div className="decks-insp-title-row">
                  <h2>{selected.name}</h2>
                  <div className="decks-insp-dust" title="合成尘数">
                    <img src={dustIcon} alt="" width={12} height={12} />
                    <b>{selectedDust.toLocaleString('en-US')}</b>
                  </div>
                </div>
              </div>

              <div className="decks-curve">
                <p>法力值曲线</p>
                <div className="decks-curve-bars">
                  {selectedCurve.map((n, i) => (
                    <div key={i} className="decks-curve-col">
                      <div
                        className={`decks-curve-bar ${i % 2 === 0 ? 'amber' : 'violet'}`}
                        style={{ height: `${Math.max(n ? 8 : 2, (n / curveMax) * 56)}px` }}
                      />
                      <span>{i === 7 ? '7+' : i}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="decks-insp-list">
                <div className="decks-insp-list-head">
                  <p>卡组套牌 ({selected.card_count})</p>
                  <span>按费用排序</span>
                </div>
                <div className="decks-insp-rows">
                  {selected.cards.length === 0 && (
                    <p className="muted decks-insp-empty">还没有卡牌，去组牌页添加吧</p>
                  )}
                  {selected.cards.map((row) => {
                    const legendary = (row.card?.rarity_slug || '').toLowerCase() === 'legendary'
                    return (
                      <div key={row.card_id} className="decks-insp-row">
                        <span className="decks-mana">{row.card?.cost ?? '-'}</span>
                        <span className="decks-insp-name">{row.card?.name || row.card_id}</span>
                        <span className={`decks-count-badge ${legendary ? 'legendary' : ''}`}>
                          {legendary ? '★' : `x${row.count}`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="decks-insp-footer">
                <button
                  type="button"
                  className="decks-btn-edit"
                  onClick={() => navigate(`/decks/${selected.id}/build`)}
                >
                  编辑此卡组
                </button>
              </div>
            </>
          ) : (
            <div className="decks-insp-empty-state">
              <p>选择一张卡组卡片查看详情</p>
              <button type="button" className="decks-btn-edit" onClick={() => setCreateOpen(true)}>
                新建卡组
              </button>
            </div>
          )}
        </aside>
      </div>

      <footer className="decks-footer">
        <div>
          <span>
            本周 AI 组牌推荐胜率: <b>62.8%</b>
          </span>
          <span>
            全服实时对局收集: <strong>1,402,895 场</strong>
          </span>
        </div>
        <p>数据来源于 ArcaneForge 大数据分析中心</p>
      </footer>

      {createOpen && (
        <div className="decks-modal-backdrop" onClick={() => !busy && setCreateOpen(false)}>
          <form
            className="decks-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void onCreate(e)}
          >
            <h2>手动组牌</h2>
            <p className="muted">选择英雄与模式后进入组牌页</p>
            <label>
              英雄
              <ForgeSelect
                aria-label="英雄"
                value={createClass}
                onChange={setCreateClass}
                options={CLASS_OPTIONS.map((c) => ({ value: c.value, label: c.label }))}
              />
            </label>
            <label>
              模式
              <ForgeSelect
                aria-label="模式"
                value={createFormat}
                onChange={(v) => setCreateFormat(v as 'standard' | 'wild')}
                options={[
                  { value: 'standard', label: '标准' },
                  { value: 'wild', label: '狂野' },
                ]}
              />
            </label>
            <label>
              卡组名称
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="卡组名称"
                required
              />
            </label>
            <div className="decks-modal-actions">
              <button type="button" className="ghost" disabled={busy} onClick={() => setCreateOpen(false)}>
                取消
              </button>
              <button type="submit" className="decks-btn-edit" disabled={busy}>
                {busy ? '创建中…' : '创建并进入组牌'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
