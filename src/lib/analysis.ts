
// TickLens — Evidence-Based Synthetic Market Analysis
// Statistical estimates only. No prediction guarantees future outcomes.

export type ContractType =
  | 'matches'
  | 'differs'
  | 'even'
  | 'odd'
  | 'over'
  | 'under'
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
const MIN_TESTS = 500
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
    return index === -1 ? digits.length : digits.length - 1 - index
  })
}

function clampBarrier(barrier: number): number {
  if (!Number.isFinite(barrier)) return 4
  return Math.max(0, Math.min(9, Math.floor(barrier)))
}

export function predictNextDigit(
  digitsInput: number[],
): DigitPrediction | null {
  const digits = validDigits(digitsInput)

  if (digits.length < 20) return null

  const last = digits[digits.length - 1]
  const recent = digits.slice(-100)
  const medium = digits.slice(-500)

  const longP = normalize(countsOf(digits).map((c) => c + 1))
  const mediumP = normalize(countsOf(medium).map((c) => c + 1))
  const recentP = normalize(countsOf(recent).map((c) => c + 1))

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
    1 - recentWeight - mediumWeight - transitionWeight - pairWeight

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
    (a, b) => distribution[b] - distribution[a] || a - b,
  )

  return {
    digit: ranked[0],
    confidence: distribution[ranked[0]],
    distribution,
    ranked,
  }
}

export function predictNextMovement(
  quotesInput: number[],
): MovementPrediction | null {
  const quotes = quotesInput.filter(Number.isFinite)

  if (quotes.length < 21) return null

  const moves: Array<'rise' | 'fall'> = []

  for (let i = 1; i < quotes.length; i++) {
    if (quotes[i] > quotes[i - 1]) moves.push('rise')
    else if (quotes[i] < quotes[i - 1]) moves.push('fall')
  }

  if (moves.length < 20) return null

  const recent = moves.slice(-100)
  const riseCount = recent.filter((m) => m === 'rise').length
  const fallCount = recent.length - riseCount
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

  const transitionWeight = transitionSamples >= 10 ? 0.25 : 0

  const riseProbability =
    (1 - transitionWeight) * riseBase +
    transitionWeight * transitionRise

  const fallProbability = 1 - riseProbability

  return {
    direction: riseProbability >= fallProbability ? 'rise' : 'fall',
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
  const safeBarrier = clampBarrier(barrier)
  const total = digits.length
  const counts = countsOf(digits)

  const pct = counts.map((count) =>
    total ? (count / total) * 100 : 0,
  )

  const evenCount = digits.filter((d) => d % 2 === 0).length
  const overCount = digits.filter((d) => d > safeBarrier).length
  const underCount = digits.filter((d) => d < safeBarrier).length

  let rises = 0
  let falls = 0

  for (let i = 1; i < quotes.length; i++) {
    if (!Number.isFinite(quotes[i]) || !Number.isFinite(quotes[i - 1])) {
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

  return {
    total,
    counts,
    pct,
    even: total ? (evenCount / total) * 100 : 0,
    odd: total ? ((total - evenCount) / total) * 100 : 0,
    over: total ? (overCount / total) * 100 : 0,
    under: total ? (underCount / total) * 100 : 0,
    equalBarrier: pct[safeBarrier] ?? 0,
    rise: moves ? (rises / moves) * 100 : 0,
    fall: moves ? (falls / moves) * 100 : 0,
    hottest: ranked[0],
    coldest: ranked[9],
    gaps,
    bias: Math.min(100, (chi / 30) * 100),
    evenOddStreak: streak(digits, (d) =>
      d % 2 === 0 ? 'even' : 'odd',
    ),
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

    if (!Number.isFinite(current) || !Number.isFinite(previous)) {
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
  const safeBarrier = clampBarrier(barrier)

  const sum = (test: (digit: number) => boolean) =>
    DIGITS.filter(test).reduce(
      (acc, digit) => acc + p[digit],
      0,
    ) * 100

  return {
    even: sum((d) => d % 2 === 0),
    odd: sum((d) => d % 2 === 1),
    over: sum((d) => d > safeBarrier),
    under: sum((d) => d < safeBarrier),
    equalBarrier: p[safeBarrier] * 100,
    matches: p[prediction.ranked[0]] * 100,
    differs: (1 - p[prediction.ranked[9]]) * 100,
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
    const recentCount = recent.filter((d) => d === digit).length

    return {
      digit,
      matches: (count / total) * 100,
      recent: (recentCount / recent.length) * 100,
      next: prediction ? prediction.distribution[digit] * 100 : 0,
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

function contractBaseline(
  contract: ContractType,
  barrier: number,
): number {
  const safeBarrier = clampBarrier(barrier)

  switch (contract) {
    case 'matches':
      return 10
    case 'differs':
      return 90
    case 'even':
    case 'odd':
    case 'rise':
    case 'fall':
      return 50
    case 'over':
      return ((9 - safeBarrier) / 10) * 100
    case 'under':
      return (safeBarrier / 10) * 100
  }
}

function contractSelection(
  contract: ContractType,
  barrier: number,
): string {
  switch (contract) {
    case 'matches':
      return 'Highest estimated digit'
    case 'differs':
      return 'Lowest estimated digit'
    case 'even':
      return 'Even'
    case 'odd':
      return 'Odd'
    case 'over':
      return `Over ${clampBarrier(barrier)}`
    case 'under':
      return `Under ${clampBarrier(barrier)}`
    case 'rise':
      return 'Rise'
    case 'fall':
      return 'Fall'
  }
}

export function backtestContract(
  contract: ContractType,
  digitsInput: number[],
  quotesInput: number[],
  barrier = 4,
): ContractEvidence {
  const digits = validDigits(digitsInput)
  const quotes = quotesInput.filter(Number.isFinite)
  const safeBarrier = clampBarrier(barrier)

  const isMovement = contract === 'rise' || contract === 'fall'
  const length = isMovement ? quotes.length : digits.length
  const firstTest = Math.max(20, length - MAX_BACKTEST_TESTS)

  let tests = 0
  let hits = 0

  for (let i = firstTest; i < length; i++) {
    if (isMovement) {
      const prediction = predictNextMovement(quotes.slice(0, i))
      if (!prediction) continue

      const actual =
        quotes[i] > quotes[i - 1]
          ? 'rise'
          : quotes[i] < quotes[i - 1]
            ? 'fall'
            : null

      if (actual === null) continue

      tests++
      if (actual === contract) hits++
      continue
    }

    const actual = digits[i]
    let successful = false

    switch (contract) {
      case 'matches': {
        const prediction = predictNextDigit(digits.slice(0, i))
        if (!prediction) continue
        successful = actual === prediction.ranked[0]
        break
      }

      case 'differs': {
        const prediction = predictNextDigit(digits.slice(0, i))
        if (!prediction) continue
        successful = actual !== prediction.ranked[9]
        break
      }

      case 'even':
        successful = actual % 2 === 0
        break

      case 'odd':
        successful = actual % 2 === 1
        break

      case 'over':
        successful = actual > safeBarrier
        break

      case 'under':
        successful = actual < safeBarrier
        break

      case 'rise':
      case 'fall':
        break
    }

    tests++
    if (successful) hits++
  }

  const baseline = contractBaseline(contract, safeBarrier)
  const accuracy = tests > 0 ? (hits / tests) * 100 : null
  const lower = wilsonLowerBound(hits, tests)

  const edgeDemonstrated =
    tests >= MIN_TESTS &&
    lower !== null &&
    lower * 100 > baseline

  return {
    contract,
    selection: contractSelection(contract, safeBarrier),
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

export function analyzeContractEvidence(
  contract: ContractType,
  digitsInput: number[],
  quotesInput: number[],
  barrier = 4,
): ContractEvidence {
  const digits = validDigits(digitsInput)
  const prediction = predictNextDigit(digits)
  const movement = predictNextMovement(quotesInput)
  const safeBarrier = clampBarrier(barrier)

  const evidence = backtestContract(
    contract,
    digits,
    quotesInput,
    safeBarrier,
  )

  let probability = 0
  let selection = evidence.selection

  if (prediction) {
    const p = prediction.distribution

    switch (contract) {
      case 'matches': {
        const digit = prediction.ranked[0]
        probability = p[digit] * 100
        selection = `Digit ${digit}`
        break
      }

      case 'differs': {
        const digit = prediction.ranked[9]
        probability = (1 - p[digit]) * 100
        selection = `Differs ${digit}`
        break
      }

      case 'even':
        probability = p.reduce(
          (sum, value, digit) =>
            sum + (digit % 2 === 0 ? value : 0),
          0,
        ) * 100
        break

      case 'odd':
        probability = p.reduce(
          (sum, value, digit) =>
            sum + (digit % 2 === 1 ? value : 0),
          0,
        ) * 100
        break

      case 'over':
        probability = p.reduce(
          (sum, value, digit) =>
            sum + (digit > safeBarrier ? value : 0),
          0,
        ) * 100
        selection = `Over ${safeBarrier}`
        break

      case 'under':
        probability = p.reduce(
          (sum, value, digit) =>
            sum + (digit < safeBarrier ? value : 0),
          0,
        ) * 100
        selection = `Under ${safeBarrier}`
        break

      case 'rise':
      case 'fall':
        break
    }
  }

  if (movement) {
    if (contract === 'rise') {
      probability = movement.riseProbability * 100
    }

    if (contract === 'fall') {
      probability = movement.fallProbability * 100
    }
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

/**
 * Duration-aware walk-forward backtest.
 * Evaluates the first available tick at or after the expiry time.
 * Historical test windows are spaced to reduce overlap.
 */
export function backtestContractDuration(
  contract: ContractType,
  digitsInput: number[],
  quotesInput: number[],
  epochsInput: number[],
  barrier = 4,
  durationSeconds = 10,
): ContractEvidence {
  const safeBarrier = clampBarrier(barrier)
  const duration = Math.max(1, Math.floor(durationSeconds))

  const count = Math.min(
    digitsInput.length,
    quotesInput.length,
    epochsInput.length,
  )

  const ticks = Array.from({ length: count }, (_, index) => ({
    digit: digitsInput[index],
    quote: quotesInput[index],
    epoch: epochsInput[index],
  }))
    .filter(
      tick =>
        Number.isInteger(tick.digit) &&
        tick.digit >= 0 &&
        tick.digit <= 9 &&
        Number.isFinite(tick.quote) &&
        Number.isFinite(tick.epoch),
    )
    .sort((a, b) => a.epoch - b.epoch)

  const isMovement =
    contract === 'rise' || contract === 'fall'

  let tests = 0
  let hits = 0

  const candidates: Array<{
    start: number
    expiry: number
  }> = []

  // Create non-overlapping historical expiry windows.
  let start = 20

  while (start < ticks.length - 1) {
    const targetEpoch = ticks[start].epoch + duration

    let expiry = start + 1

    while (
      expiry < ticks.length &&
      ticks[expiry].epoch < targetEpoch
    ) {
      expiry++
    }

    if (expiry >= ticks.length) break

    candidates.push({ start, expiry })
    start = expiry + 1
  }

  const selectedTests = candidates.slice(-MAX_BACKTEST_TESTS)

  for (const test of selectedTests) {
    const startTick = ticks[test.start]
    const expiryTick = ticks[test.expiry]

    const pastDigits = ticks
      .slice(0, test.start + 1)
      .map(tick => tick.digit)

    const pastQuotes = ticks
      .slice(0, test.start + 1)
      .map(tick => tick.quote)

    let won = false

    if (isMovement) {
      won =
        contract === 'rise'
          ? expiryTick.quote > startTick.quote
          : expiryTick.quote < startTick.quote
    } else {
      const actual = expiryTick.digit

      switch (contract) {
        case 'matches': {
          const prediction = predictNextDigit(pastDigits)
          if (!prediction) continue
          won = actual === prediction.ranked[0]
          break
        }

        case 'differs': {
          const prediction = predictNextDigit(pastDigits)
          if (!prediction) continue
          won = actual !== prediction.ranked[9]
          break
        }

        case 'even':
          won = actual % 2 === 0
          break

        case 'odd':
          won = actual % 2 === 1
          break

        case 'over':
          won = actual > safeBarrier
          break

        case 'under':
          won = actual < safeBarrier
          break

        case 'rise':
        case 'fall':
          break
      }
    }

    tests++
    if (won) hits++
  }

  const baseline = contractBaseline(contract, safeBarrier)
  const accuracy = tests > 0 ? (hits / tests) * 100 : null
  const lower = wilsonLowerBound(hits, tests)

  const edgeDemonstrated =
    tests >= MIN_TESTS &&
    lower !== null &&
    lower * 100 > baseline

  const latestDigits = ticks.map(tick => tick.digit)
  const latestQuotes = ticks.map(tick => tick.quote)

  const latestDigitPrediction =
    predictNextDigit(latestDigits)

  let selection = contractSelection(contract, safeBarrier)

  if (contract === 'matches' && latestDigitPrediction) {
    selection = `Digit ${latestDigitPrediction.ranked[0]}`
  }

  if (contract === 'differs' && latestDigitPrediction) {
    selection = `Differs ${latestDigitPrediction.ranked[9]}`
  }

  return {
    contract,
    selection,
    probability: accuracy ?? 0,
    tests,
    hits,
    accuracy,
    baseline,
    lowerBound: lower === null ? null : lower * 100,
    edgeDemonstrated,
    signal: edgeDemonstrated ? 'CHECK' : 'WAIT',
    reason:
      tests < MIN_TESTS
        ? `Only ${tests} valid non-overlapping ${duration}-second tests. At least ${MIN_TESTS} are required.`
        : edgeDemonstrated
          ? `Historical ${duration}-second walk-forward accuracy exceeded the reference baseline. This does not guarantee the next result.`
          : `No demonstrated advantage over the reference baseline in ${duration}-second expiry tests.`,
  }
}

/**
 * Analyze a market using a duration-aware backtest.
 */
export function analyzeContractEvidenceAtDuration(
  contract: ContractType,
  digits: number[],
  quotes: number[],
  epochs: number[],
  barrier = 4,
  durationSeconds = 10,
): ContractEvidence {
  return backtestContractDuration(
    contract,
    digits,
    quotes,
    epochs,
    barrier,
    durationSeconds,
  )
}
