const GAMMA = 'https://gamma-api.polymarket.com'

export type IdFormat = 'numeric' | 'conditionId' | 'clobToken' | 'slug' | 'unknown'

export interface PolymarketMarket {
  id: string; conditionId: string; question: string; slug: string
  active: boolean; closed: boolean; volume: number; liquidity: number
  outcomePrices: number[]; endDate: string | null; clobTokenIds: string[]
}

export function detectFormat(input: string): IdFormat {
  if (/^\d+$/.test(input)) return 'numeric'
  if (input.startsWith('0x') && input.length === 66) return 'conditionId'
  if (input.startsWith('0x') && input.length > 66) return 'clobToken'
  if (/^[a-z0-9-]+$/.test(input) && input.includes('-')) return 'slug'
  return 'unknown'
}

function parseJSON(s: string | null): any[] {
  if (!s) return []
  try { return JSON.parse(s) } catch { return [] }
}

function normalize(raw: any): PolymarketMarket {
  return {
    id: String(raw.id || ''), conditionId: raw.conditionId || raw.condition_id || '',
    question: raw.question || '', slug: raw.slug || '',
    active: !!raw.active, closed: !!raw.closed,
    volume: raw.volumeNum || raw.volume || 0, liquidity: raw.liquidityNum || raw.liquidity || 0,
    outcomePrices: parseJSON(raw.outcomePrices).map(Number),
    endDate: raw.endDateIso || raw.endDate || null,
    clobTokenIds: parseJSON(raw.clobTokenIds),
  }
}

export async function resolve(input: string): Promise<PolymarketMarket> {
  const fmt = detectFormat(input)
  let url: string
  switch (fmt) {
    case 'numeric': url = `${GAMMA}/markets/${input}`; break
    case 'conditionId': url = `${GAMMA}/markets?condition_id=${input}`; break
    case 'slug': url = `${GAMMA}/markets?slug=${input}`; break
    default: url = `${GAMMA}/markets?condition_id=${input}`
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Polymarket API error: ${res.status}`)
  const data = await res.json()
  const market = Array.isArray(data) ? data[0] : data
  if (!market) throw new Error(`Market not found: ${input}`)
  return normalize(market)
}

export async function resolveAllIds(input: string): Promise<{ numericId: string; conditionId: string; clobTokenIds: string[]; slug: string }> {
  const m = await resolve(input)
  return { numericId: m.id, conditionId: m.conditionId, clobTokenIds: m.clobTokenIds, slug: m.slug }
}
