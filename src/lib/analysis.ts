
// TickLens — Evidence-Based Synthetic Market Analysis
// Statistical estimates only. No prediction guarantees future outcomes.

export type ContractType =
  | 'matches'
  | 'differs'
  | 'even'
  | 'odd'
  | 'rise'
  | 'fall'

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

export interface MovementPrediction {
  direction: 'rise' | 'fall'
  confidence: number
  riseProbability: number
  fallProbability: number
}

export interface ContractEvidence {
  contract: ContractType
  selection: string
  probability: number
  tests: number
  hits: number
  accuracy: number | null
  baseline: number
  lowerBound: number | null
  edgeDemonstrated: boolean
  signal: 'CHECK' | 'WAIT'
  reason: string
}

const DIGITS = Array.from({ length: 10 }, (_, i) => i)

const MIN_TESTS = 100
const MAX_BACKTEST_TESTS = 500

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

// Estimate the next digit from historical frequencies
// and conditional transitions.
export function predictNextDigit(
  digitsInput: number[],
): DigitPrediction | null {
  const digits = validDigits(digitsInput)

  if (digits.length < 20) return null

  const last = digits[digits.length - 1]

  const recent = digits.slice(-100)
  const medium = digits.slice(-500)

  const longCounts = countsOf(digits)
  const longP = normalize(longCounts.map((c) => c + 1))

  const mediumCounts = countsOf(medium)
  const mediumP = normalize(mediumCounts.map((c) => c + 1))

  const recentCounts = countsOf(recent)
  const recentP = normalize(recentCounts.map((c) => c + 1))

  const transitions = Array(10).fill(1) as number[]
  let transitionSamples = 0

  for (let i = 1; i < digits.length; i++) {
    if (digits[i - 1] === last) {
      transitions[digits[i]]++
      transitionSamples++
    }
  }

  const transitionP = normalize(transitions)

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

// Estimate the next price movement from past price movements.
// This is a statistical estimate, not a deterministic forecast.
export function predictNextMovement(
  quotesInput: number[],
): MovementPrediction | null {
  const quotes = quotesInput.filter(Number.isFinite)

  if (quotes.length < 21) return null

  const moves: Array<'rise' | 'fall'> = []

  for (let i = 1; i < quotes.length; i++) {
    if (quotes[i] > quotes[i - 1]) {
      moves.push('rise')
    } else if (quotes[i] < quotes[i - 1]) {
      moves.push('fall')
    }
  }

  if (moves.length < 20) return null

  const recent = moves.slice(-100)

  const riseCount = recent.filter((m) => m === 'rise').length
  const fallCount = recent.length - riseCount

  // Laplace smoothing prevents zero-probability estimates.
  const riseBase = (riseCount + 1) / (recent.length + 2)

  const lastMove = moves[moves.length - 1]
  const transitionCounts = { rise: 1, fall: 1 }

  let transitionSamples = 0

  for (let i = 1; i < moves.length; i++) {
    if (moves[i - 1] === lastMove) {
      transitionCounts[moves[i]]++
      transitionSamples++
    }
  }

  const transitionTotal =
    transitionCounts.rise + transitionCounts.fall

  const transitionRise =
    transitionCounts.rise / transitionTotal

  const transitionWeight =
    transitionSamples >= 10 ? 0.25 : 0

  const riseProbability =
    (1 - transitionWeight) * riseBase +
    transitionWeight * transitionRise

  const fallProbability = 1 - riseProbability

  return {
    direction:
      riseProbability >= fallProbability ? 'rise' : 'fall',
    confidence: Math.max(riseProbability, fallProbability),
    riseProbability,
    fallProbability,
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

// Wilson lower confidence bound.
// A signal must beat its baseline even at this conservative bound.
function wilsonLowerBound(
  hits: number,
  tests: number,
): number | null {
  if (tests <= 0) return null

  const z = 1.96
  const p = hits / tests
  const z2 = z * z

  const denominator = 1 + z2 / tests

  const centre = p + z2 / (2 * tests)

  const margin =
    z *
    Math.sqrt(
      (p * (1 - p)) / tests +
      z2 / (4 * tests * tests),
    )

  return (centre - margin) / denominator
}

// Test the chosen contract using rolling one-step-ahead predictions.
// Each test uses only observations before its actual outcome.
export function backtestContract(
  contract: ContractType,
  digitsInput: number[],
  quotesInput: number[],
): ContractEvidence {
  const digits = validDigits(digitsInput)
  const quotes = quotesInput.filter(Number.isFinite)

  const isMovement =
    contract === 'rise' || contract === 'fall'

  const length = isMovement
    ? quotes.length
    : digits.length

  const firstTest = Math.max(20, length - MAX_BACKTEST_TESTS)

  let tests = 0
  let hits = 0

  for (let i = firstTest; i < length; i++) {
    if (isMovement) {
      const pastQuotes = quotes.slice(0, i)
      const prediction = predictNextMovement(pastQuotes)

      if (!prediction) continue

      const actual =
        quotes[i] > quotes[i - 1]
          ? 'rise'
          : quotes[i] < quotes[i - 1]
            ? 'fall'
            : null

      if (!actual) continue

      tests++

      if (prediction.direction === actual) {
        hits++
      }
    } else {
      const pastDigits = digits.slice(0, i)
      const prediction = predictNextDigit(pastDigits)

      if (!prediction) continue

      const actual = digits[i]
      let predictedOutcome = false

      switch (contract) {
        case 'matches':
          predictedOutcome = actual === prediction.ranked[0]
          break
        case 'differs':
          predictedOutcome = actual !== prediction.ranked[9]
          break
        case 'even':
          predictedOutcome = actual % 2 === 0
          break
        case 'odd':
          predictedOutcome = actual % 2 === 1
          break
      }

      tests++

      if (predictedOutcome) hits++
    }
  }

  const baseline =
    contract === 'matches'
      ? 10
      : contract === 'differs'
        ? 90
        : 50

  const accuracy = tests > 0
    ? (hits / tests) * 100
    : null

  const lower = wilsonLowerBound(hits, tests)

  const edgeDemonstrated =
    tests >= MIN_TESTS &&
    lower !== null &&
    lower * 100 > baseline

  return {
    contract,
    selection:
      contract === 'matches'
        ? 'Highest estimated digit'
        : contract === 'differs'
          ? 'Lowest estimated digit'
          : contract === 'even'
            ? 'Even'
            : contract === 'odd'
              ? 'Odd'
              : contract === 'rise'
                ? 'Rise'
                : 'Fall',
    probability: 0,
    tests,
    hits,
    accuracy,
    baseline,
    lowerBound: lower === null ? null : lower * 100,
    edgeDemonstrated,
    signal: edgeDemonstrated ? 'CHECK' : 'WAIT',
    reason:
      tests < MIN_TESTS
        ? `Only ${tests} valid tests. At least ${MIN_TESTS} are required.`
        : edgeDemonstrated
          ? 'The conservative historical accuracy estimate exceeded the reference baseline. This does not guarantee the next result.'
          : 'The historical tests have not demonstrated an edge above the reference baseline.',
  }
}

// Current contract estimate plus its historical evidence.
export function analyzeContractEvidence(
  contract: ContractType,
  digitsInput: number[],
  quotesInput: number[],
): ContractEvidence {
  const digits = validDigits(digitsInput)
  const prediction = predictNextDigit(digits)
  const movement = predictNextMovement(quotesInput)

  const evidence = backtestContract(
    contract,
    digits,
    quotesInput,
  )

  let probability = 0
  let selection = evidence.selection

  if (contract === 'matches' && prediction) {
    probability =
      prediction.distribution[prediction.ranked[0]] * 100
    selection = `Digit ${prediction.ranked[0]}`
  }

  if (contract === 'differs' && prediction) {
    probability =
      (1 - prediction.distribution[prediction.ranked[9]]) * 100
    selection = `Differs ${prediction.ranked[9]}`
  }

  if (contract === 'even' && prediction) {
    probability =
      prediction.distribution.reduce(
        (sum, p, digit) =>
          sum + (digit % 2 === 0 ? p : 0),
        0,
      ) * 100
  }

  if (contract === 'odd' && prediction) {
    probability =
      prediction.distribution.reduce(
        (sum, p, digit) =>
          sum + (digit % 2 === 1 ? p : 0),
        0,
      ) * 100
  }

  if (contract === 'rise' && movement) {
    probability = movement.riseProbability * 100
  }

  if (contract === 'fall' && movement) {
    probability = movement.fallProbability * 100
  }

  const hasEnoughCurrentData =
    contract === 'rise' || contract === 'fall'
      ? movement !== null
      : prediction !== null

  return {
    ...evidence,
    selection,
    probability,
    signal:
      evidence.edgeDemonstrated && hasEnoughCurrentData
        ? 'CHECK'
        : 'WAIT',
    reason: !hasEnoughCurrentData
      ? 'Not enough current market data to calculate this contract.'
      : evidence.reason,
  }
}
