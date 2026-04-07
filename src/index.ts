/**
 * polymarket-ticker-resolver
 *
 * Resolve any Polymarket market identifier — numeric ID, conditionId,
 * CLOB token ID, or slug — to a normalized PolymarketMarket object via the
 * Gamma API. Zero dependencies, runs anywhere fetch is available.
 */

const GAMMA = 'https://gamma-api.polymarket.com'

export type IdFormat = 'numeric' | 'conditionId' | 'clobToken' | 'slug' | 'unknown'

export interface PolymarketMarket {
  /** Numeric Gamma market id (string form). */
  id: string
  /** 0x-prefixed 64-hex-char condition id. */
  conditionId: string
  /** Human-readable market question. */
  question: string
  /** URL slug. */
  slug: string
  /** True if the market is open to trading. */
  active: boolean
  /** True if the market has resolved. */
  closed: boolean
  /** Cumulative trading volume in USDC. */
  volume: number
  /** Current orderbook liquidity in USDC. */
  liquidity: number
  /** Outcome labels, e.g. ["Yes", "No"]. */
  outcomes: string[]
  /** Last-trade prices for each outcome, in [0, 1]. */
  outcomePrices: number[]
  /** ISO-8601 expected end date, or null. */
  endDate: string | null
  /** Decimal CLOB token IDs, one per outcome. */
  clobTokenIds: string[]
}

/**
 * Detect which format an input string is in.
 *
 * - `numeric`     — short decimal id like "12" or "1744803" (≤19 chars)
 * - `clobToken`   — long decimal CLOB token, ~75-78 chars
 * - `conditionId` — `0x` + 64 hex chars (66 chars total)
 * - `slug`        — kebab-case lowercase string containing at least one '-'
 * - `unknown`     — anything else; resolve() will throw
 */
export function detectFormat(input: string): IdFormat {
  const s = input.trim()
  if (s.length === 0) return 'unknown'

  // 0x-prefixed hex (conditionId is exactly 66 chars; longer would not exist on Polymarket)
  if (/^0x[0-9a-fA-F]+$/.test(s)) {
    if (s.length === 66) return 'conditionId'
    return 'unknown'
  }

  // Decimal: short = numeric Gamma id, long = CLOB token id
  if (/^\d+$/.test(s)) {
    if (s.length < 20) return 'numeric'
    return 'clobToken'
  }

  // kebab-case slug
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(s)) return 'slug'

  return 'unknown'
}

// ── Internal helpers ──────────────────────────────────────

function parseStringArray(s: unknown): string[] {
  if (Array.isArray(s)) return s.map(String)
  if (typeof s !== 'string') return []
  try {
    const parsed = JSON.parse(s)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function parseNumberArray(s: unknown): number[] {
  return parseStringArray(s).map(Number).filter((n) => !Number.isNaN(n))
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.length > 0) {
    const n = Number(v)
    return Number.isNaN(n) ? fallback : n
  }
  return fallback
}

function normalize(raw: Record<string, unknown>): PolymarketMarket {
  return {
    id: String(raw.id ?? ''),
    conditionId: String(raw.conditionId ?? raw.condition_id ?? ''),
    question: String(raw.question ?? ''),
    slug: String(raw.slug ?? ''),
    active: !!raw.active,
    closed: !!raw.closed,
    volume: num(raw.volumeNum ?? raw.volume),
    liquidity: num(raw.liquidityNum ?? raw.liquidity),
    outcomes: parseStringArray(raw.outcomes),
    outcomePrices: parseNumberArray(raw.outcomePrices),
    endDate: (raw.endDateIso as string | null) ?? (raw.endDate as string | null) ?? null,
    clobTokenIds: parseStringArray(raw.clobTokenIds),
  }
}

async function gammaFetch(path: string): Promise<unknown> {
  const res = await fetch(`${GAMMA}${path}`)
  if (!res.ok) throw new Error(`Polymarket Gamma API error ${res.status} for ${path}`)
  return res.json()
}

// ── Public API ────────────────────────────────────────────

/**
 * Resolve any Polymarket identifier to a normalized PolymarketMarket.
 *
 * @throws if the format cannot be detected or no market matches.
 */
export async function resolve(input: string): Promise<PolymarketMarket> {
  const fmt = detectFormat(input)
  let path: string
  switch (fmt) {
    case 'numeric':
      path = `/markets/${encodeURIComponent(input)}`
      break
    case 'conditionId':
      path = `/markets?condition_id=${encodeURIComponent(input)}`
      break
    case 'clobToken':
      path = `/markets?clob_token_ids=${encodeURIComponent(input)}`
      break
    case 'slug':
      path = `/markets?slug=${encodeURIComponent(input)}`
      break
    default:
      throw new Error(`Unrecognized Polymarket identifier format: ${input}`)
  }

  const data = await gammaFetch(path)
  const raw = Array.isArray(data) ? data[0] : data
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Polymarket market not found: ${input} (format=${fmt})`)
  }
  return normalize(raw as Record<string, unknown>)
}

/**
 * Resolve an input and return the bundle of all canonical IDs for the market.
 * Useful when you want to cross-link a numeric id to its slug or get both
 * outcome CLOB tokens.
 */
export async function resolveAllIds(input: string): Promise<{
  numericId: string
  conditionId: string
  clobTokenIds: string[]
  slug: string
}> {
  const m = await resolve(input)
  return {
    numericId: m.id,
    conditionId: m.conditionId,
    clobTokenIds: m.clobTokenIds,
    slug: m.slug,
  }
}

/**
 * Try to resolve, returning null instead of throwing on failure.
 * Use this when the caller is OK with a missing market and wants to branch
 * on the result.
 */
export async function tryResolve(input: string): Promise<PolymarketMarket | null> {
  try {
    return await resolve(input)
  } catch {
    return null
  }
}
