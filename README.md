# polymarket-ticker-resolver

[![npm](https://img.shields.io/npm/v/polymarket-ticker-resolver)](https://www.npmjs.com/package/polymarket-ticker-resolver)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Resolve **any** Polymarket market identifier — numeric Gamma id, conditionId,
CLOB token id, or slug — to a normalized `PolymarketMarket` object via the
public Gamma API. **Zero dependencies.** Runs anywhere `fetch` is available.

```ts
import { resolve } from 'polymarket-ticker-resolver'

const m1 = await resolve('1744803')                                  // numeric id
const m2 = await resolve('0xe3b423dfad8c22ff75c9899c4e8176f628cf4ad4caa00481764d320e7415f7a9')  // conditionId
const m3 = await resolve('53135072462907880191400140706440867753044989936304433583131786753949599718775')  // CLOB token
const m4 = await resolve('will-joe-biden-get-coronavirus-before-the-election')  // slug
```

---

## Why?

Polymarket markets surface in the wild under at least four totally different
identifier formats — Gamma numeric ids, EVM-style conditionIds, decimal CLOB
token ids (one per outcome), and URL slugs. Stitching data across the
[Gamma API](https://docs.polymarket.com/), the [CLOB](https://docs.polymarket.com/clob),
and the public site URLs requires translating between them constantly.

This library detects which format you have and routes the lookup to the right
Gamma endpoint, returning a single normalized shape so the rest of your code
doesn't have to care.

## Install

```bash
npm install polymarket-ticker-resolver
```

Zero runtime dependencies. ESM and CJS, with full TypeScript types.

## Supported formats

| Format | Example | Detected by |
|--------|---------|-------------|
| `numeric` | `12`, `1744803` | Decimal string, **<20 chars** |
| `clobToken` | `53135072462907880191400140706440867753044989936304433583131786753949599718775` | Decimal string, **≥20 chars** |
| `conditionId` | `0xe3b423dfad8c22ff75c9899c4e8176f628cf4ad4caa00481764d320e7415f7a9` | `0x` + exactly 64 hex chars |
| `slug` | `will-joe-biden-get-coronavirus-before-the-election` | Lowercase kebab-case with at least one `-` |
| `unknown` | `KXFEDDECISION`, `hello` | Anything else → throws |

> **Bugfix vs older releases:** versions before `1.1.0` mis-classified CLOB token
> ids as `numeric` because both are decimal strings, then routed them to
> `/markets/{id}` and 404'd. The current detection uses length to disambiguate.

## API

### `resolve(input): Promise<PolymarketMarket>`

Detect the input format, fetch the matching market via the Gamma API, and
return a normalized object. Throws on unknown format, network error, or empty
result.

```ts
interface PolymarketMarket {
  id: string                    // numeric Gamma id
  conditionId: string           // 0x… 66 chars
  question: string
  slug: string
  active: boolean
  closed: boolean
  volume: number                // USDC, parsed from volumeNum or volume string
  liquidity: number             // USDC, current orderbook
  outcomes: string[]            // ['Yes', 'No'] etc.
  outcomePrices: number[]       // [0.42, 0.58] in [0, 1]
  endDate: string | null        // ISO-8601
  clobTokenIds: string[]        // one per outcome
}
```

### `tryResolve(input): Promise<PolymarketMarket | null>`

Same as `resolve` but returns `null` instead of throwing. Use when you
naturally want to branch on "did we find it" without try/catch noise.

```ts
const m = await tryResolve('maybe-a-slug')
if (!m) return notFoundUI()
```

### `resolveAllIds(input): Promise<{ numericId, conditionId, clobTokenIds, slug }>`

Cross-link any input to the bundle of all canonical identifiers — useful when
you want to construct a Polymarket URL from a CLOB token, or look up CLOB tokens
from a slug.

```ts
const ids = await resolveAllIds('will-joe-biden-get-coronavirus-before-the-election')
// {
//   numericId: '12',
//   conditionId: '0xe3b423df…',
//   clobTokenIds: ['53135072…', '60869871…'],
//   slug: 'will-joe-biden-get-coronavirus-before-the-election',
// }

const polymarketUrl = `https://polymarket.com/event/${ids.slug}`
```

### `detectFormat(input): IdFormat`

Pure function that returns the detected format string without making a network
call. Useful for routing logic, validation, or fast checks before deciding to
fetch.

```ts
import { detectFormat } from 'polymarket-ticker-resolver'

if (detectFormat(input) === 'unknown') return errorUI()
```

## Errors

`resolve` throws three categories of error, all with descriptive messages:

| Cause | Message pattern |
|-------|-----------------|
| Unrecognized format | `Unrecognized Polymarket identifier format: <input>` |
| API non-2xx | `Polymarket Gamma API error <status> for <path>` |
| Empty result | `Polymarket market not found: <input> (format=<fmt>)` |

`tryResolve` swallows all of these and returns `null` instead.

## Sister packages

| Need | Package |
|------|---------|
| Get aggregated edges across Kalshi + Polymarket | [`prediction-market-edge-detector`](https://github.com/spfunctions/prediction-market-edge-detector) |
| Live world snapshot from 30,000+ markets | [`agent-world-awareness`](https://github.com/spfunctions/agent-world-awareness), [`prediction-market-context`](https://github.com/spfunctions/prediction-market-context) |
| LLM-agent integration | [`langchain-prediction-markets`](https://github.com/spfunctions/langchain-prediction-markets), [`vercel-ai-prediction-markets`](https://github.com/spfunctions/vercel-ai-prediction-markets), [`openai-agents-prediction-markets`](https://github.com/spfunctions/openai-agents-prediction-markets), [`crewai-prediction-markets`](https://github.com/spfunctions/crewai-prediction-markets) |
| MCP / Claude / Cursor | [`simplefunctions-cli`](https://github.com/spfunctions/simplefunctions-cli) |

## Testing

```bash
npm test
```

25 tests, all `fetch`-mocked — no network required. Covers every format
detection edge case (boundary lengths, conditionId length validation, kebab-case
slugs vs single words), every URL routing path, normalization of the messy
Gamma response shape (string-encoded JSON arrays, `volumeNum` vs `volume`
strings), and error paths.

## License

MIT — built by [SimpleFunctions](https://simplefunctions.dev).
