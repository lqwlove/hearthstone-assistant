export type TokenResponse = {
  access_token: string
  token_type: string
  username: string
}

export type Card = {
  id: string
  name: string
  cost: number | null
  class_slug: string
  rarity_slug: string
  card_type: string
  set_slug: string
  text: string
  collectible: boolean
  is_standard: boolean
  is_wild: boolean
  image_url: string
}

export type CardListResponse = {
  items: Card[]
  total: number
  page: number
  page_size: number
}

export type DeckCard = {
  card_id: string
  count: number
  card?: Card | null
}

export type Deck = {
  id: number
  name: string
  class_slug: string
  format: 'standard' | 'wild' | string
  status: 'draft' | 'completed' | string
  card_count: number
  cards: DeckCard[]
}

export type ValidationResult = {
  valid: boolean
  violations: string[]
  card_count: number
}

export type ChatMessage = {
  id: number
  role: string
  content: string
  patch_applied: boolean
  patch_error?: string | null
  created_at?: string | null
}

export const CLASS_OPTIONS = [
  { value: 'warrior', label: '战士' },
  { value: 'shaman', label: '萨满' },
  { value: 'rogue', label: '潜行者' },
  { value: 'paladin', label: '圣骑士' },
  { value: 'hunter', label: '猎人' },
  { value: 'druid', label: '德鲁伊' },
  { value: 'warlock', label: '术士' },
  { value: 'mage', label: '法师' },
  { value: 'priest', label: '牧师' },
  { value: 'demonhunter', label: '恶魔猎手' },
  { value: 'deathknight', label: '死亡骑士' },
]
