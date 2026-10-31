/**
 * TickLens — Walk-Forward Strategy Trainer
 *
 * Tests existing analysis strategies against historical ticks.
 * Separates earlier training results from later validation results.
 * Statistical evaluation only; no guaranteed predictions.
 */

import {
  predictNextDigit,
  predictNextMovement,
} from '@/lib/analysis'

import type { ContractType } from '@/lib/analysis'
import type { StoredTick } from '@/lib/tick-storage'

export interface TrainerScore {
  tests: number
  wins: number
  losses: number
  accuracy: number | null
  baseline: number
  lowerBound: number | null
  edge: number | null
}

export interface StrategyTrainingResult {
  contract: ContractType
  training: TrainerScore
  validation: TrainerScore
  status:
    | 'VALIDATION_EDGE'
    | 'NO_VALIDATION_EDGE'
    | 'INSUFFICIENT_VALIDATION'
  explanation: string
}

export interface MarketTrainingReport {
  market: string
  ticksAvailable: number
  uniqueTicks: number
  trainingTicks: number
  validationTicks: number
  strategies: StrategyTrainingResult[]
  trainedAt: number
  message: string
}

interface CleanTick {
  digit: number
  quote: number
  epoch: number
}

interface TestResult {
  won: boolean
  confidence: number
}

const MAX_TRAINING_TICKS = 5000
const MAX_TESTS_PER_PERIOD = 250
const MIN_VALIDATION_TESTS = 100
const MIN_WARMUP_TICKS = 100

const CONTRACTS: ContractType[] = [
  'matches',
  'differs',
  'even',
  'odd',
  'rise',
  'fall',
]

function cleanTicks(input: StoredTick[]): CleanTick[] {
  const sorted = input
    .filter(tick =>
      Number.isInteger(tick.digit) &&
      tick.digit >= 0 &&
      tick.digit <= 9 &&
      Number.isFinite(tick.quote) &&
      Number.isFinite(tick.epoch)
    )
    .sort((a, b) =>
      a.epoch - b.epoch ||
      (a.id ?? 0) - (b.id ?? 0)
    )

  const unique: CleanTick[] = []
  const seen = new Set<string>()

  for (const tick of sorted) {
    const key = `${tick.epoch}|${tick.quote}`

    if (seen.has(key)) continue

    seen.add(key)

    unique.push({
      digit: tick.digit,
      quote: tick.quote,
      epoch: tick.epoch,
    })
  }

  return unique.slice(-MAX_TRAINING_TICKS)
}

function sampleIndices(
  start: number,
  end: number,
  maximum: number
): number[] {
  const count = end - start

  if (count <= 0) return []

  const samples = Math.min(count, maximum)

  if (samples === 1) return [start]

  return Array.from(
    { length: samples },
    (_, index) =>
      start +
      Math.floor(
        (index * (count - 1)) / (samples - 1)
      )
  )
}

function wilsonLowerBound(
  wins: number,
  tests: number
): number | null {
  if (tests === 0) return null

  const z = 1.96
  const p = wins / tests
  const z2 = z * z

  const denominator = 1 + z2 / tests

  const centre =
    p + z2 / (2 * tests)

  const margin =
    z *
    Math.sqrt(
      (p * (1 - p)) / tests +
      z2 / (4 * tests * tests)
    )

  return (
    (centre - margin) /
    denominator
  ) * 100
}

function getBaseline(
  contract: ContractType
): number {
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
  }
}

function makeTest(
  contract: ContractType,
  history: CleanTick[],
  actual: CleanTick,
  previousQuote: number
): TestResult | null {
  const digits = history.map(tick => tick.digit)
  const quotes = history.map(tick => tick.quote)

  if (
    contract === 'matches' ||
    contract === 'differs' ||
    contract === 'even' ||
    contract === 'odd'
  ) {
    const prediction = predictNextDigit(digits)

    if (!prediction) return null

    if (contract === 'matches') {
      const selected = prediction.ranked[0]

      return {
        won: actual.digit === selected,
        confidence:
          prediction.distribution[selected] * 100,
      }
    }

    if (contract === 'differs') {
      const selected = prediction.ranked[9]

      return {
        won: actual.digit !== selected,
        confidence:
          (1 - prediction.distribution[selected]) * 100,
      }
    }

    const evenProbability =
      prediction.distribution.reduce(
        (sum, probability, digit) =>
          sum + (digit % 2 === 0 ? probability : 0),
        0
      )

    const oddProbability = 1 - evenProbability

    if (evenProbability === oddProbability) {
      return null
    }

    const predictedSide =
      evenProbability > oddProbability
        ? 'even'
        : 'odd'

    // Only score a contract when that side is predicted.
    if (predictedSide !== contract) return null

    return {
      won:
        contract === 'even'
          ? actual.digit % 2 === 0
          : actual.digit % 2 === 1,
      confidence:
        Math.max(evenProbability, oddProbability) * 100,
    }
  }

  const movement = predictNextMovement(quotes)

  if (!movement) return null

  // Only score the side selected by the movement model.
  if (movement.direction !== contract) {
    return null
  }

  if (actual.quote === previousQuote) {
    return null
  }

  const actualDirection =
    actual.quote > previousQuote
      ? 'rise'
      : 'fall'

  return {
    won: actualDirection === contract,
    confidence: movement.confidence * 100,
  }
}

function evaluatePeriod(
  contract: ContractType,
  ticks: CleanTick[],
  start: number,
  end: number
): TrainerScore {
  let tests = 0
  let wins = 0

  const indices = sampleIndices(
    start,
    end,
    MAX_TESTS_PER_PERIOD
  )

  for (const index of indices) {
    const history = ticks.slice(0, index)
    const actual = ticks[index]

    if (history.length < MIN_WARMUP_TICKS) {
      continue
    }

    const previousQuote =
      history[history.length - 1].quote

    const result = makeTest(
      contract,
      history,
      actual,
      previousQuote
    )

    if (!result) continue

    tests++

    if (result.won) wins++
  }

  const accuracy =
    tests > 0
      ? (wins / tests) * 100
      : null

  const baseline = getBaseline(contract)

  const lowerBound =
    wilsonLowerBound(wins, tests)

  return {
    tests,
    wins,
    losses: tests - wins,
    accuracy,
    baseline,
    lowerBound,
    edge:
      accuracy === null
        ? null
        : accuracy - baseline,
  }
}

export function trainMarketStrategies(
  market: string,
  storedTicks: StoredTick[]
): MarketTrainingReport {
  const ticks = cleanTicks(storedTicks)

  const emptyReport = (
    message: string
  ): MarketTrainingReport => ({
    market,
    ticksAvailable: storedTicks.length,
    uniqueTicks: ticks.length,
    trainingTicks: 0,
    validationTicks: 0,
    strategies: [],
    trainedAt: Date.now(),
    message,
  })

  if (ticks.length < 150) {
    return emptyReport(
      'Collect at least 150 valid unique ticks before training.'
    )
  }

  const splitIndex = Math.floor(ticks.length * 0.7)

  if (splitIndex <= MIN_WARMUP_TICKS) {
    return emptyReport(
      'Not enough earlier ticks for the training period.'
    )
  }

  const strategies: StrategyTrainingResult[] =
    CONTRACTS.map(contract => {
      const training = evaluatePeriod(
        contract,
        ticks,
        MIN_WARMUP_TICKS,
        splitIndex
      )

      const validation = evaluatePeriod(
        contract,
        ticks,
        splitIndex,
        ticks.length
      )

      let status:
        StrategyTrainingResult['status']

      let explanation: string

      if (
        validation.tests <
        MIN_VALIDATION_TESTS
      ) {
        status = 'INSUFFICIENT_VALIDATION'

        explanation =
          `Only ${validation.tests} validation tests. ` +
          `${MIN_VALIDATION_TESTS} are required for an edge assessment.`
      } else if (
        validation.lowerBound !== null &&
        validation.lowerBound > validation.baseline
      ) {
        status = 'VALIDATION_EDGE'

        explanation =
          'The conservative validation estimate exceeded the reference baseline. ' +
          'This is historical evidence, not a guarantee of future results.'
      } else {
        status = 'NO_VALIDATION_EDGE'

        explanation =
          'The unseen validation period did not demonstrate a statistically convincing edge over the reference baseline.'
      }

      return {
        contract,
        training,
        validation,
        status,
        explanation,
      }
    })

  const successful = strategies.filter(
    strategy =>
      strategy.status === 'VALIDATION_EDGE'
  ).length

  return {
    market,
    ticksAvailable: storedTicks.length,
    uniqueTicks: ticks.length,
    trainingTicks: splitIndex,
    validationTicks: ticks.length - splitIndex,
    strategies,
    trainedAt: Date.now(),
    message:
      successful > 0
        ? `${successful} strategy or strategies passed the validation threshold. Continue monitoring with fresh data.`
        : 'No strategy has demonstrated a convincing validation edge. Keep collecting data and retest later.',
  }
  }
