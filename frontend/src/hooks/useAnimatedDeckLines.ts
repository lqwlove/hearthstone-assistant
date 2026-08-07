import { useEffect, useRef, useState } from 'react'
import type { Card, Deck } from '../types'

export type DeckLineView = {
  cardId: string
  count: number
  card?: Card
  fx: 'enter' | 'exit' | 'bump' | null
}

type Counts = Record<string, number>

function resolveCard(cardId: string, pool: Card[], deck: Deck | null): Card | undefined {
  return (
    pool.find((p) => p.id === cardId) ||
    deck?.cards.find((c) => c.card_id === cardId)?.card ||
    undefined
  )
}

function sortLines(lines: DeckLineView[]): DeckLineView[] {
  return [...lines].sort((a, b) => (a.card?.cost ?? 99) - (b.card?.cost ?? 99))
}

/**
 * Derive a display list from counts with enter / exit / bump animation phases.
 * Exit rows linger briefly so CSS can play leave motion before unmount.
 */
export function useAnimatedDeckLines(
  counts: Counts,
  pool: Card[],
  deck: Deck | null,
): DeckLineView[] {
  const [lines, setLines] = useState<DeckLineView[]>([])
  const prevCounts = useRef<Counts | null>(null)
  const exitTimers = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const nextIds = Object.keys(counts).filter((id) => (counts[id] || 0) > 0)
    const nextSet = new Set(nextIds)

    // First sync: paint without motion (initial load / navigation)
    if (prevCounts.current === null) {
      prevCounts.current = { ...counts }
      setLines(
        sortLines(
          nextIds.map((id) => ({
            cardId: id,
            count: counts[id],
            card: resolveCard(id, pool, deck),
            fx: null,
          })),
        ),
      )
      return undefined
    }

    const prev = prevCounts.current
    const prevIds = Object.keys(prev).filter((id) => (prev[id] || 0) > 0)
    const prevSet = new Set(prevIds)

    const entering = nextIds.filter((id) => !prevSet.has(id))
    const exiting = prevIds.filter((id) => !nextSet.has(id))
    const bumping = nextIds.filter(
      (id) => prevSet.has(id) && (counts[id] || 0) !== (prev[id] || 0),
    )

    setLines((old) => {
      const byId = new Map(old.map((l) => [l.cardId, l]))
      const merged: DeckLineView[] = []

      for (const id of nextIds) {
        const fx: DeckLineView['fx'] = entering.includes(id)
          ? 'enter'
          : bumping.includes(id)
            ? 'bump'
            : null
        merged.push({
          cardId: id,
          count: counts[id],
          card: resolveCard(id, pool, deck),
          fx,
        })
        byId.delete(id)
      }

      // keep exiting rows until timer clears
      for (const id of exiting) {
        merged.push({
          cardId: id,
          count: prev[id] || 0,
          card: resolveCard(id, pool, deck),
          fx: 'exit',
        })
      }

      // still-exiting from earlier frames not in this exiting batch
      for (const [id, row] of byId) {
        if (row.fx === 'exit' && !nextSet.has(id)) {
          merged.push({ ...row, card: resolveCard(id, pool, deck) })
        }
      }

      return sortLines(merged)
    })

    for (const id of exiting) {
      const existing = exitTimers.current.get(id)
      if (existing) window.clearTimeout(existing)
      const timer = window.setTimeout(() => {
        exitTimers.current.delete(id)
        setLines((cur) => cur.filter((l) => !(l.cardId === id && l.fx === 'exit')))
      }, 380)
      exitTimers.current.set(id, timer)
    }

    // clear enter/bump after animation
    if (entering.length || bumping.length) {
      const clearTimer = window.setTimeout(() => {
        setLines((cur) =>
          cur.map((l) =>
            l.fx === 'enter' || l.fx === 'bump' ? { ...l, fx: null } : l,
          ),
        )
      }, 420)
      prevCounts.current = { ...counts }
      return () => window.clearTimeout(clearTimer)
    }

    prevCounts.current = { ...counts }
    return undefined
  }, [counts, pool, deck])

  useEffect(() => {
    return () => {
      for (const t of exitTimers.current.values()) window.clearTimeout(t)
      exitTimers.current.clear()
    }
  }, [])

  return lines
}
