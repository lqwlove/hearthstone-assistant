import type {
  AssistantPhase,
  Card,
  CardListResponse,
  ChatMessage,
  Deck,
  SkillPack,
  TokenResponse,
  ValidationResult,
} from './types'

const TOKEN_KEY = 'hs_token'
const USER_KEY = 'hs_user'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUsername(): string | null {
  return localStorage.getItem(USER_KEY)
}

export function setAuth(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, username)
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(path, { ...init, headers })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const data = await res.json()
      detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
    } catch {
      /* ignore */
    }
    throw new Error(detail || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  register: (username: string, password: string) =>
    request<TokenResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<TokenResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  listCards: (params: Record<string, string | number | boolean | undefined>) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v))
    })
    return request<CardListResponse>(`/api/cards?${qs}`)
  },
  getCard: (id: string) => request<Card>(`/api/cards/${id}`),
  syncCards: (syncToken: string) =>
    request<{ ok: boolean; synced: number; message: string }>('/api/cards/sync', {
      method: 'POST',
      headers: { 'X-Sync-Token': syncToken },
    }),
  listDecks: () => request<Deck[]>('/api/decks'),
  createDeck: (body: { name: string; class_slug: string; format: string }) =>
    request<Deck>('/api/decks', { method: 'POST', body: JSON.stringify(body) }),
  getDeck: (id: number) => request<Deck>(`/api/decks/${id}`),
  deleteDeck: (id: number) => request<void>(`/api/decks/${id}`, { method: 'DELETE' }),
  saveDraft: (id: number, body: { name?: string; cards: { card_id: string; count: number }[] }) =>
    request<Deck>(`/api/decks/${id}/draft`, { method: 'PUT', body: JSON.stringify(body) }),
  validateDeck: (id: number) => request<ValidationResult>(`/api/decks/${id}/validate`, { method: 'POST' }),
  finalizeDeck: (id: number) =>
    request<{ deck: Deck; validation: ValidationResult }>(`/api/decks/${id}/finalize`, { method: 'POST' }),
  getChat: (deckId: number) =>
    request<{ thread_id: string; messages: ChatMessage[]; phase: AssistantPhase }>(
      `/api/decks/${deckId}/chat`,
    ),
  sendChat: (deckId: number, content: string) =>
    request<{
      messages: ChatMessage[]
      deck: Deck | null
      patch_applied: boolean
      patch_error?: string | null
      phase: AssistantPhase
    }>(`/api/decks/${deckId}/chat`, { method: 'POST', body: JSON.stringify({ content }) }),
  startBuilding: (deckId: number) =>
    request<{ deck_id: number; phase: AssistantPhase }>(`/api/decks/${deckId}/chat/start-building`, {
      method: 'POST',
    }),
  returnToCoaching: (deckId: number) =>
    request<{ deck_id: number; phase: AssistantPhase }>(
      `/api/decks/${deckId}/chat/return-to-coaching`,
      { method: 'POST' },
    ),
  listMySkillPacks: () => request<SkillPack[]>('/api/skills/market/mine'),
  listPublicSkillPacks: () => request<SkillPack[]>('/api/skills/market'),
  submitSkillPack: (body: {
    slug: string
    name: string
    description?: string
    version?: string
    skill_md: string
  }) =>
    request<SkillPack>('/api/skills/market', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}
