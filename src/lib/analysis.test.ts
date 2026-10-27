import { describe, expect, it } from 'vitest'

import { analyzeWindow, matchesDiffers, outcomeOdds, predictNextDigit } from './analysis'
import { lastDigit } from './deriv'

describe('lastDigit', () => {
  it('keeps trailing zeros from the pip size', () => {
    expect(lastDigit(1234.5, 2)).toBe(0)
    expect(lastDigit(6543.217, 3)).toBe(7)
  })
})

describe('analyzeWindow', () => {
  it('computes digit shares, even/odd and over/under', () => {
    const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const quotes = digits.map((d, i) => 100 + i + d / 100)
    const stats = analyzeWindow(digits, quotes, 4)
    expect(stats.pct.every((p) => p === 10)).toBe(true)
    expect(stats.even).toBe(50)
    expect(stats.over).toBe(50)
    expect(stats.under).toBe(40)
    expect(stats.rise).toBe(100)
    expect(stats.bias).toBe(0)
  })
})

describe('predictNextDigit', () => {
  it('needs at least 20 ticks', () => {
    expect(predictNextDigit([1, 2, 3])).toBeNull()
  })

  it('returns a normalised distribution favouring a dominant digit', () => {
    const digits = Array.from({ length: 100 }, (_, i) =>
      i % 3 === 0 ? 7 : i % 10,
    )
    const p = predictNextDigit(digits)!
    expect(p.distribution.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    expect(p.digit).toBe(7)
    const odds = outcomeOdds(p, 4)
    expect(odds.even + odds.odd).toBeCloseTo(100)
  })
})

describe('matchesDiffers', () => {
  it('uses history shares without a prediction', () => {
    const digits = Array.from({ length: 100 }, (_, i) => (i % 9) + 1) // never 0
    const md = matchesDiffers(digits, null)!
    expect(md.bestDiffers).toBe(0)
    expect(md.rows[0].matches).toBe(0)
    expect(md.rows.reduce((a, r) => a + r.matches, 0)).toBeCloseTo(100)
  })

  it('follows the prediction when there is one', () => {
    const digits = Array.from({ length: 100 }, (_, i) => (i * 7) % 10)
    const p = predictNextDigit(digits)!
    const md = matchesDiffers(digits, p)!
    expect(md.bestDiffers).toBe(p.ranked[9])
    expect(md.bestMatches).toBe(p.ranked[0])
  })
})
