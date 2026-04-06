import { describe, it, expect } from 'vitest'
import { detectFormat } from '../src/index.js'
describe('polymarket-ticker-resolver', () => {
  it('detects numeric', () => expect(detectFormat('1744803')).toBe('numeric'))
  it('detects conditionId', () => expect(detectFormat('0x' + 'a'.repeat(64))).toBe('conditionId'))
  it('detects slug', () => expect(detectFormat('will-oil-exceed-100')).toBe('slug'))
  it('detects unknown', () => expect(detectFormat('KXFED')).toBe('unknown'))
})
