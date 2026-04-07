import { describe, it, expect, afterEach, vi } from 'vitest'
import { detectFormat, resolve, resolveAllIds, tryResolve } from '../src/index.js'

// ── Realistic fixture lifted from gamma-api.polymarket.com ───

const FIXTURE = {
  id: '12',
  question: 'Will Joe Biden get Coronavirus before the election?',
  conditionId: '0xe3b423dfad8c22ff75c9899c4e8176f628cf4ad4caa00481764d320e7415f7a9',
  slug: 'will-joe-biden-get-coronavirus-before-the-election',
  active: true,
  closed: true,
  volume: '32257.445115',
  volumeNum: 32257.45,
  liquidity: '0',
  liquidityNum: 0,
  outcomes: '["Yes", "No"]',
  outcomePrices: '["0.42", "0.58"]',
  endDateIso: '2020-11-04',
  endDate: '2020-11-04T00:00:00Z',
  clobTokenIds:
    '["53135072462907880191400140706440867753044989936304433583131786753949599718775", "60869871469376321574904667328762911501870754872924453995477779862968218702336"]',
}

const SHORT_NUMERIC = '12'
const LONG_NUMERIC = '1744803'
const CLOB_TOKEN = '53135072462907880191400140706440867753044989936304433583131786753949599718775'
const COND_ID = '0xe3b423dfad8c22ff75c9899c4e8176f628cf4ad4caa00481764d320e7415f7a9'
const SLUG = 'will-joe-biden-get-coronavirus-before-the-election'

function mockJsonOnce(body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

function lastUrl(spy: ReturnType<typeof vi.spyOn>): string {
  const arg = spy.mock.calls[0][0]
  return typeof arg === 'string' ? arg : (arg as URL).toString()
}

afterEach(() => vi.restoreAllMocks())

// ── detectFormat ──────────────────────────────────────────

describe('detectFormat', () => {
  it('detects short numeric Gamma id', () => {
    expect(detectFormat(SHORT_NUMERIC)).toBe('numeric')
    expect(detectFormat(LONG_NUMERIC)).toBe('numeric')
  })

  it('detects long decimal CLOB token (>=20 chars)', () => {
    expect(detectFormat(CLOB_TOKEN)).toBe('clobToken')
    expect(detectFormat('1'.repeat(20))).toBe('clobToken') // boundary
    expect(detectFormat('1'.repeat(19))).toBe('numeric') // boundary
  })

  it('detects 0x conditionId at exactly 66 chars', () => {
    expect(detectFormat(COND_ID)).toBe('conditionId')
  })

  it('rejects 0x strings of wrong length', () => {
    expect(detectFormat('0x' + 'a'.repeat(63))).toBe('unknown') // 65 chars
    expect(detectFormat('0x' + 'a'.repeat(65))).toBe('unknown') // 67 chars
  })

  it('detects kebab-case slug', () => {
    expect(detectFormat(SLUG)).toBe('slug')
    expect(detectFormat('a-b')).toBe('slug')
  })

  it('rejects single-word lowercase strings as unknown', () => {
    expect(detectFormat('hello')).toBe('unknown')
    expect(detectFormat('KXFEDDECISION')).toBe('unknown')
  })

  it('rejects empty / whitespace input', () => {
    expect(detectFormat('')).toBe('unknown')
    expect(detectFormat('   ')).toBe('unknown')
  })

  it('trims whitespace before detection', () => {
    expect(detectFormat('  12  ')).toBe('numeric')
  })
})

// ── resolve URL routing ──────────────────────────────────

describe('resolve — URL routing', () => {
  it('routes numeric id to /markets/{id}', async () => {
    const spy = mockJsonOnce(FIXTURE)
    await resolve(SHORT_NUMERIC)
    expect(lastUrl(spy)).toBe('https://gamma-api.polymarket.com/markets/12')
  })

  it('routes conditionId to /markets?condition_id=', async () => {
    const spy = mockJsonOnce([FIXTURE])
    await resolve(COND_ID)
    expect(lastUrl(spy)).toBe(`https://gamma-api.polymarket.com/markets?condition_id=${COND_ID}`)
  })

  it('routes CLOB token to /markets?clob_token_ids=', async () => {
    const spy = mockJsonOnce([FIXTURE])
    await resolve(CLOB_TOKEN)
    expect(lastUrl(spy)).toBe(
      `https://gamma-api.polymarket.com/markets?clob_token_ids=${CLOB_TOKEN}`,
    )
  })

  it('routes slug to /markets?slug=', async () => {
    const spy = mockJsonOnce([FIXTURE])
    await resolve(SLUG)
    expect(lastUrl(spy)).toBe(`https://gamma-api.polymarket.com/markets?slug=${SLUG}`)
  })

  it('throws on unknown format without making a network call', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    await expect(resolve('definitely not a market')).rejects.toThrow(/Unrecognized/)
    expect(spy).not.toHaveBeenCalled()
  })
})

// ── resolve normalization ────────────────────────────────

describe('resolve — normalization', () => {
  it('normalizes a single-object response', async () => {
    mockJsonOnce(FIXTURE)
    const m = await resolve(SHORT_NUMERIC)
    expect(m.id).toBe('12')
    expect(m.conditionId).toBe(COND_ID)
    expect(m.slug).toBe(SLUG)
    expect(m.active).toBe(true)
    expect(m.closed).toBe(true)
  })

  it('normalizes an array-wrapped response (takes first)', async () => {
    mockJsonOnce([FIXTURE])
    const m = await resolve(SLUG)
    expect(m.id).toBe('12')
  })

  it('parses outcomes and outcomePrices from JSON-string fields', async () => {
    mockJsonOnce(FIXTURE)
    const m = await resolve(SHORT_NUMERIC)
    expect(m.outcomes).toEqual(['Yes', 'No'])
    expect(m.outcomePrices).toEqual([0.42, 0.58])
  })

  it('parses clobTokenIds from JSON-string field', async () => {
    mockJsonOnce(FIXTURE)
    const m = await resolve(SHORT_NUMERIC)
    expect(m.clobTokenIds).toHaveLength(2)
    expect(m.clobTokenIds[0]).toBe(CLOB_TOKEN)
  })

  it('prefers volumeNum/liquidityNum over the string variants', async () => {
    mockJsonOnce(FIXTURE)
    const m = await resolve(SHORT_NUMERIC)
    expect(m.volume).toBe(32257.45)
    expect(m.liquidity).toBe(0)
  })

  it('falls back to string volume/liquidity when *Num is missing', async () => {
    const noNum = { ...FIXTURE, volumeNum: undefined, liquidityNum: undefined }
    mockJsonOnce(noNum)
    const m = await resolve(SHORT_NUMERIC)
    expect(m.volume).toBe(32257.445115)
    expect(m.liquidity).toBe(0)
  })

  it('throws on empty array result', async () => {
    mockJsonOnce([])
    await expect(resolve(SLUG)).rejects.toThrow(/not found/)
  })

  it('throws on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('boom', { status: 500, headers: { 'content-type': 'text/plain' } }),
    )
    await expect(resolve(SHORT_NUMERIC)).rejects.toThrow(/500/)
  })
})

// ── resolveAllIds ────────────────────────────────────────

describe('resolveAllIds', () => {
  it('returns all four canonical identifiers', async () => {
    mockJsonOnce(FIXTURE)
    const ids = await resolveAllIds(SHORT_NUMERIC)
    expect(ids).toEqual({
      numericId: '12',
      conditionId: COND_ID,
      clobTokenIds: [
        CLOB_TOKEN,
        '60869871469376321574904667328762911501870754872924453995477779862968218702336',
      ],
      slug: SLUG,
    })
  })
})

// ── tryResolve ───────────────────────────────────────────

describe('tryResolve', () => {
  it('returns the market on success', async () => {
    mockJsonOnce(FIXTURE)
    const m = await tryResolve(SHORT_NUMERIC)
    expect(m?.id).toBe('12')
  })

  it('returns null on failure instead of throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('boom', { status: 500 }),
    )
    expect(await tryResolve(SHORT_NUMERIC)).toBeNull()
  })

  it('returns null on unknown format', async () => {
    expect(await tryResolve('not a market')).toBeNull()
  })
})
