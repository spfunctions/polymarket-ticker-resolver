# polymarket-ticker-resolver
Resolve any Polymarket market ID format to a full market object. Zero dependencies.

[![npm](https://img.shields.io/npm/v/polymarket-ticker-resolver)](https://www.npmjs.com/package/polymarket-ticker-resolver)

```ts
import { resolve, detectFormat } from 'polymarket-ticker-resolver'
const market = await resolve('1744803')       // numeric ID
const market2 = await resolve('0xabc...')     // conditionId
const market3 = await resolve('will-oil-...')  // slug
```

## Supported formats
- Numeric ID (`1744803`)
- Condition ID (`0x` + 64 hex chars)
- CLOB Token ID (long hex)
- Slug (`will-oil-exceed-100`)

## License
MIT — [SimpleFunctions](https://simplefunctions.dev)
