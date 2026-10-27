// Pure statistics over a window of ticks. No React, no network — easy to test.

export interface DigitPrediction {
  digit: number
  confidence: number // probability of the top digit, 0..1
  distribution: number[] // blended probability per digit 0..9, sums to 1
  ranked: number[] // digits sorted from most to least likely
}

export interface WindowStats {
  total: number
  counts: number[]
  pct: number[] // 0..100 per digit
  even: number // 0..100
  odd: number
  over: number // digits > barrier, 0..100
  under: number // digits < barrier
  equalBarrier: number
  rise: number // 0..100 of tick-to-tick moves
  fall: number
  hottest: number
  coldest: number
  gaps: number[] // ticks since each digit last appeared
  bias: number // 0..100, how far the distribution is from uniform
  evenOddStreak: { kind: 'even' | 'odd'; length: number } | null
  riseFallStreak: { kind: 'rise' | 'fall'; length: number } | null
  prediction: DigitPrediction | null
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

export function analyzeWindow(
  digits: number[],
  quotes: number[],
  barrier: number,
): WindowStats {
  const total = digits.length
  const counts = DIGITS.map(() => 0)
  for (const d of digits) counts[d]++
  const pct = counts.map((c) => (total ? (c / total) * 100 : 0))
  const evenCount = counts
    .filter((_, d) => d % 2 === 0)
    .reduce((a, b) => a + b, 0)
  const overCount = counts.slice(barrier + 1).reduce((a, b) => a + b, 0)
  const underCount = counts.slice(0, barrier).reduce((a, b) => a + b, 0)

  let rises = 0
  let falls = 0
  for (let i = 1; i < quotes.length; i++) {
    if (quotes[i] > quotes[i - 1]) rises++
    else if (quotes[i] < quotes[i - 1]) falls++
  }
  const moves = rises + falls

  const gaps = DIGITS.map((d) => {
    const idx = digits.lastIndexOf(d)
    return idx === -1 ? total : total - 1 - idx
  })

  // Chi-square vs uniform, mapped to 0..100 with a soft cap.
  const expected = total / 10
  const chi = total
    ? counts.reduce((acc, c) => acc + (c - expected) ** 2 / expected, 0)
    : 0
  const bias = Math.min(100, (chi / 30) * 100)

  const ranked = [...DIGITS].sort((a, b) => counts[b] - counts[a])

  return {
    total,
    counts,
    pct,
    even: total ? (evenCount / total) * 100 : 0,
    odd: total ? ((total - evenCount) / total) * 100 : 0,
    over: total ? (overCount / total) * 100 : 0,
    under: total ? (underCount / total) * 100 : 0,
    equalBarrier: pct[barrier] ?? 0,
    rise: moves ? (rises / moves) * 100 : 0,
    fall: moves ? (falls / moves) * 100 : 0,
    hottest: ranked[0],
    coldest: ranked[9],
    gaps,
    bias,
    evenOddStreak: streak(digits, (d) => (d % 2 === 0 ? 'even' : 'odd')),
    riseFallStreak: moveStreak(quotes),
    prediction: predictNextDigit(digits),
  }
}

/**
 * Blend four signals into a probability for each next digit:
 * long-window frequency, short-window frequency, a first-order Markov
 * transition from the current digit, and how long each digit has been absent.
 */
export function predictNextDigit(digits: number[]): DigitPrediction | null {
  if (digits.length < 20) return null
  const total = digits.length
  const recent = digits.slice(-50)
  const last = digits[total - 1]

  const freq = DIGITS.map(() => 1) // Laplace smoothing
  for (const d of digits) freq[d]++
  const recentFreq = DIGITS.map(() => 1)
  for (const d of recent) recentFreq[d]++
  const trans = DIGITS.map(() => 1)
  for (let i = 1; i < total; i++) if (digits[i - 1] === last) trans[digits[i]]++

  const gap = DIGITS.map((d) => {
    const idx = digits.lastIndexOf(d)
    return idx === -1 ? total : total - 1 - idx
  })

  const freqP = normalize(freq)
  const recentP = normalize(recentFreq)
  const transP = normalize(trans)
  const gapP = normalize(gap.map((g) => g + 1))

  const blended = normalize(
    DIGITS.map(
      (d) =>
        0.25 * freqP[d] + 0.3 * recentP[d] + 0.3 * transP[d] + 0.15 * gapP[d],
    ),
  )
  const ranked = [...DIGITS].sort((a, b) => blended[b] - blended[a])
  return {
    digit: ranked[0],
    confidence: blended[ranked[0]],
    distribution: blended,
    ranked,
  }
}

function normalize(values: number[]) {
  const sum = values.reduce((a, b) => a + b, 0) || 1
  return values.map((v) => v / sum)
}

function streak<K extends string>(digits: number[], key: (d: number) => K) {
  if (!digits.length) return null
  const kind = key(digits[digits.length - 1])
  let length = 0
  for (let i = digits.length - 1; i >= 0 && key(digits[i]) === kind; i--)
    length++
  return { kind, length }
}

function moveStreak(quotes: number[]) {
  let kind: 'rise' | 'fall' | null = null
  let length = 0
  for (let i = quotes.length - 1; i > 0; i--) {
    const diff = quotes[i] - quotes[i - 1]
    if (diff === 0) break
    const k = diff > 0 ? 'rise' : 'fall'
    if (kind === null) kind = k
    if (k !== kind) break
    length++
  }
  return kind ? { kind, length } : null
}

/** Probability (0..100) of each contract outcome from the blended prediction. */
export function outcomeOdds(prediction: DigitPrediction, barrier: number) {
  const p = prediction.distribution
  const sum = (f: (d: number) => boolean) =>
    DIGITS.filter(f).reduce((acc, d) => acc + p[d], 0) * 100
  return {
    even: sum((d) => d % 2 === 0),
    odd: sum((d) => d % 2 === 1),
    over: sum((d) => d > barrier),
    under: sum((d) => d < barrier),
    matches: p[prediction.digit] * 100,
    differs: (1 - p[prediction.digit]) * 100,
  }
}

export interface MatchDiffRow {
  digit: number
  matches: number // 0..100 share of the whole window
  recent: number // 0..100 share of the last 50 ticks
  next: number // 0..100 blended next-tick probability (0 without a prediction)
  gap: number // ticks since the digit last appeared
}

export interface MatchesDiffers {
  rows: MatchDiffRow[]
  bestDiffers: number // least likely next digit, safest to "differ" from
  bestMatches: number // most likely next digit
}

/**
 * Per-digit Matches/Differs view. Differs wins when the next last digit is
 * anything but the chosen one, so the least likely digit is the best pick.
 */
export function matchesDiffers(
  digits: number[],
  prediction: DigitPrediction | null,
): MatchesDiffers | null {
  const total = digits.length
  if (!total) return null
  const recent = digits.slice(-50)
  const rows = DIGITS.map((d) => {
    const idx = digits.lastIndexOf(d)
    return {
      digit: d,
      matches: (digits.filter((x) => x === d).length / total) * 100,
      recent: (recent.filter((x) => x === d).length / recent.length) * 100,
      next: prediction ? prediction.distribution[d] * 100 : 0,
      gap: idx === -1 ? total : total - 1 - idx,
    }
  })
  const score = (r: MatchDiffRow) => (prediction ? r.next : r.matches)
  const byScore = [...rows].sort((a, b) => score(a) - score(b))
  return {
    rows,
    bestDiffers: byScore[0].digit,
    bestMatches: byScore[9].digit,
  }
}
