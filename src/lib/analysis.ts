
// TickLens — Improved Synthetic Digit Analysis Engine
// Statistical estimates only. No method can guarantee the next result.

export interface DigitPrediction {
  digit: number
  confidence: number
  distribution: number[]
  ranked: number[]
}

export interface WindowStats {
  total: number
  counts: number[]
  pct: number[]
  even: number
  odd: number
  over: number
  under: number
  equalBarrier: number
  rise: number
  fall: number
  hottest: number
  coldest: number
  gaps: number[]
  bias: number
  evenOddStreak: { kind: 'even' | 'odd'; length: number } | null
  riseFallStreak: { kind: 'rise' | 'fall'; length: number } | null
  prediction: DigitPrediction | null
}

const DIGITS = Array.from({ length: 10 }, (_, i) => i)

function validDigits(digits: number[]): number[] {
  return digits.filter(
    (d) => Number.isInteger(d) && d >= 0 && d <= 9,
  )
}

function normalize(values: number[]): number[] {
  const sum = values.reduce((a, b) => a + b, 0)

  return sum > 0
    ? values.map((v) => v / sum)
    : values.map(() => 0.1)
}

function countsOf(digits: number[]): number[] {
  const counts = Array(10).fill(0) as number[]

  for (const digit of digits) {
    if (Number.isInteger(digit) && digit >= 0 && digit <= 9) {
      counts[digit]++
    }
  }

  return counts
}

function getGaps(digits: number[]): number[] {
  return DIGITS.map((digit) => {
    const index = digits.lastIndexOf(digit)

    return index === -1
      ? digits.length
      : digits.length - 1 - index
  })
}

// Estimates the next digit using historical, recent,
// and conditional transition frequencies.
export function predictNextDigit(
  digitsInput: number[],
): DigitPrediction | null {
  const digits = validDigits(digitsInput)

  if (digits.length < 20) return null

  const last = digits[digits.length - 1]

  const recent = digits.slice(-100)
  const medium = digits.slice(-500)

  // Long-term distribution.
  const longCounts = countsOf(digits)
  const longP = normalize(longCounts.map((c) => c + 1))

  // Medium-term distribution.
  const mediumCounts = countsOf(medium)
  const mediumP = normalize(mediumCounts.map((c) => c + 1))

  // Recent distribution.
  const recentCounts = countsOf(recent)
  const recentP = normalize(recentCounts.map((c) => c + 1))

  // Conditional probability of a digit following the latest digit.
  const transitions = Array(10).fill(1) as number[]
  let transitionSamples = 0

  for (let i = 1; i < digits.length; i++) {
    if (digits[i - 1] === last) {
      transitions[digits[i]]++
      transitionSamples++
    }
  }

  const transitionP = normalize(transitions)

  // Two-digit context: what followed the latest two digits?
  const pairTransitions = Array(10).fill(1) as number[]
  let pairSamples = 0

  if (digits.length >= 3) {
    const previous = digits[digits.length - 2]

    for (let i = 2; i < digits.length; i++) {
      if (
        digits[i - 2] === previous &&
        digits[i - 1] === last
      ) {
        pairTransitions[digits[i]]++
        pairSamples++
      }
    }
  }

  const pairP = normalize(pairTransitions)

  // Use pair transitions only when there is enough evidence.
  const pairWeight = pairSamples >= 8 ? 0.15 : 0

  const transitionWeight = transitionSamples >= 5 ? 0.25 : 0.10

  const recentWeight = 0.30
  const mediumWeight = 0.20
  const longWeight =
    1 - recentWeight - mediumWeight -
    transitionWeight - pairWeight

  const distribution = normalize(
    DIGITS.map((digit) =>
      longWeight * longP[digit] +
      mediumWeight * mediumP[digit] +
      recentWeight * recentP[digit] +
      transitionWeight * transitionP[digit] +
      pairWeight * pairP[digit],
    ),
  )

  const ranked = [...DIGITS].sort(
    (a, b) =>
      distribution[b] - distribution[a] || a - b,
  )

  return {
    digit: ranked[0],
    confidence: distribution[ranked[0]],
    distribution,
    ranked,
  }
}

export function analyzeWindow(
  digitsInput: number[],
  quotes: number[],
  barrier: number,
): WindowStats {
  const digits = validDigits(digitsInput)
  const total = digits.length
  const counts = countsOf(digits)

  const pct = counts.map((count) =>
    total ? (count / total) * 100 : 0,
  )

  const evenCount = digits.filter((d) => d % 2 === 0).length
  const overCount = digits.filter((d) => d > barrier).length
  const underCount = digits.filter((d) => d < barrier).length

  let rises = 0
  let falls = 0

  for (let i = 1; i < quotes.length; i++) {
    if (
      !Number.isFinite(quotes[i]) ||
      !Number.isFinite(quotes[i - 1])
    ) {
      continue
    }

    if (quotes[i] > quotes[i - 1]) rises++
    else if (quotes[i] < quotes[i - 1]) falls++
  }

  const moves = rises + falls
  const gaps = getGaps(digits)

  const ranked = [...DIGITS].sort(
    (a, b) => counts[b] - counts[a] || a - b,
  )

  const expected = total / 10

  const chi = total
    ? counts.reduce(
        (acc, count) =>
          acc + (count - expected) ** 2 / expected,
        0,
      )
    : 0

  const evenOddStreak = streak(digits, (d) =>
    d % 2 === 0 ? 'even' : 'odd',
  )

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
    bias: Math.min(100, (chi / 30) * 100),
    evenOddStreak,
    riseFallStreak: moveStreak(quotes),
    prediction: predictNextDigit(digits),
  }
}

function streak<K extends string>(
  digits: number[],
  key: (d: number) => K,
): { kind: K; length: number } | null {
  if (!digits.length) return null

  const kind = key(digits[digits.length - 1])
  let length = 0

  for (let i = digits.length - 1; i >= 0; i--) {
    if (key(digits[i]) !== kind) break
    length++
  }

  return { kind, length }
}

function moveStreak(
  quotes: number[],
): { kind: 'rise' | 'fall'; length: number } | null {
  let kind: 'rise' | 'fall' | null = null
  let length = 0

  for (let i = quotes.length - 1; i > 0; i--) {
    const current = quotes[i]
    const previous = quotes[i - 1]

    if (
      !Number.isFinite(current) ||
      !Number.isFinite(previous)
    ) {
      break
    }

    const difference = current - previous

    if (difference === 0) break

    const nextKind = difference > 0 ? 'rise' : 'fall'

    if (kind !== null && nextKind !== kind) break

    kind = nextKind
    length++
  }

  return kind ? { kind, length } : null
}

export function outcomeOdds(
  prediction: DigitPrediction,
  barrier: number,
) {
  const p = prediction.distribution

  const sum = (test: (digit: number) => boolean) =>
    DIGITS.filter(test).reduce(
      (acc, digit) => acc + p[digit],
      0,
    ) * 100

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
  matches: number
  recent: number
  next: number
  gap: number
}

export interface MatchesDiffers {
  rows: MatchDiffRow[]
  bestDiffers: number
  bestMatches: number
}

export function matchesDiffers(
  digitsInput: number[],
  prediction: DigitPrediction | null,
): MatchesDiffers | null {
  const digits = validDigits(digitsInput)
  const total = digits.length

  if (!total) return null

  const recent = digits.slice(-50)
  const gaps = getGaps(digits)

  const rows: MatchDiffRow[] = DIGITS.map((digit) => {
    const count = digits.filter((d) => d === digit).length

    const recentCount = recent.filter(
      (d) => d === digit,
    ).length

    return {
      digit,
      matches: (count / total) * 100,
      recent: (recentCount / recent.length) * 100,
      next: prediction
        ? prediction.distribution[digit] * 100
        : 0,
      gap: gaps[digit],
    }
  })

  const score = (row: MatchDiffRow) =>
    prediction ? row.next : row.matches

  const sorted = [...rows].sort(
    (a, b) => score(a) - score(b),
  )

  return {
    rows,
    bestDiffers: sorted[0].digit,
    bestMatches: sorted[sorted.length - 1].digit,
  }
}
