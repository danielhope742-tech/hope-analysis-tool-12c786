export type TrackedContract =
  | 'matches'
  | 'differs'
  | 'even'
  | 'odd'
  | 'over'
  | 'under'
  | 'rise'
  | 'fall'

export interface SignalSnapshot {
  market: string
  contract: TrackedContract
  selection: string
  signal: 'CHECK' | 'WAIT'
  probability: number
  baseline: number
  lowerBound: number
  quotes: number[]
  digits: number[]
  epochs?: number[]
  barrier?: number
  durationSeconds?: number
}

export interface SignalRecord {
  id: string
  market: string
  contract: TrackedContract
  selection: string
  signalEpoch: number
  signalQuote: number
  signalDigit: number
  probability: number
  baseline: number
  lowerBound: number
  barrier?: number
  durationSeconds: number
  status: 'PENDING' | 'WIN' | 'LOSS'
  resultEpoch?: number
  resultQuote?: number
  resultDigit?: number
  createdAt: number
}

export interface PerformanceStats {
  total: number
  wins: number
  losses: number
  pending: number
  winRate: number
}

const STORAGE_KEY = 'ticklens_signal_performance_10s_v2'
const MAX_RECORDS = 1000
const DEFAULT_DURATION_SECONDS = 10

function readRecords(): SignalRecord[] {
  if (typeof window === 'undefined') return []

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) return []

    const parsed: unknown = JSON.parse(saved)
    return Array.isArray(parsed) ? parsed as SignalRecord[] : []
  } catch {
    return []
  }
}

function saveRecords(records: SignalRecord[]): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(records.slice(-MAX_RECORDS)),
    )
  } catch {
    // Local storage may be unavailable or full.
  }
}

function extractDigit(selection: string): number | null {
  const match = selection.match(/\b([0-9])\b/)
  return match ? Number(match[1]) : null
}

function evaluateOutcome(
  record: SignalRecord,
  resultQuote: number,
  resultDigit: number,
): boolean {
  switch (record.contract) {
    case 'matches': {
      const digit = extractDigit(record.selection)
      return digit !== null && resultDigit === digit
    }

    case 'differs': {
      const digit = extractDigit(record.selection)
      return digit !== null && resultDigit !== digit
    }

    case 'even':
      return resultDigit % 2 === 0

    case 'odd':
      return resultDigit % 2 === 1

    case 'over':
      return resultDigit > (record.barrier ?? 4)

    case 'under':
      return resultDigit < (record.barrier ?? 4)

    case 'rise':
      return resultQuote > record.signalQuote

    case 'fall':
      return resultQuote < record.signalQuote

    default:
      return false
  }
}

export function processSignalSnapshot(
  snapshot: SignalSnapshot,
): SignalRecord[] {
  const records = readRecords()

  const count = Math.min(
    snapshot.quotes.length,
    snapshot.digits.length,
    snapshot.epochs?.length ?? 0,
  )

  if (count < 2) return records

  const ticks = Array.from({ length: count }, (_, index) => ({
    quote: snapshot.quotes[index],
    digit: snapshot.digits[index],
    epoch: snapshot.epochs![index],
  }))
    .filter(
      tick =>
        Number.isFinite(tick.quote) &&
        Number.isInteger(tick.digit) &&
        tick.digit >= 0 &&
        tick.digit <= 9 &&
        Number.isFinite(tick.epoch),
    )
    .sort((a, b) => a.epoch - b.epoch)

  if (ticks.length < 2) return records

  // Settle pending signals at the first tick at or after expiry.
  for (const record of records) {
    if (
      record.status !== 'PENDING' ||
      record.market !== snapshot.market
    ) {
      continue
    }

    const expiryEpoch =
      record.signalEpoch + record.durationSeconds

    const expiryTick = ticks.find(
      tick => tick.epoch >= expiryEpoch,
    )

    if (!expiryTick) continue

    const won = evaluateOutcome(
      record,
      expiryTick.quote,
      expiryTick.digit,
    )

    record.status = won ? 'WIN' : 'LOSS'
    record.resultEpoch = expiryTick.epoch
    record.resultQuote = expiryTick.quote
    record.resultDigit = expiryTick.digit
  }

  // Record only CHECK signals.
  if (snapshot.signal === 'CHECK') {
    const lastTick = ticks[ticks.length - 1]

    const durationSeconds =
      Number.isFinite(snapshot.durationSeconds) &&
      (snapshot.durationSeconds ?? 0) > 0
        ? Math.floor(snapshot.durationSeconds!)
        : DEFAULT_DURATION_SECONDS

    const selectedDigit =
      snapshot.contract === 'matches' ||
      snapshot.contract === 'differs'
        ? extractDigit(snapshot.selection)
        : null

    const validSelection =
      snapshot.contract === 'matches' ||
      snapshot.contract === 'differs'
        ? selectedDigit !== null
        : true

    const id = [
      snapshot.market,
      snapshot.contract,
      snapshot.selection,
      lastTick.epoch,
      durationSeconds,
    ].join('|')

    const alreadyRecorded = records.some(
      record => record.id === id,
    )

    // Do not create overlapping pending signals for the same
    // market, contract and duration.
    const hasPendingSignal = records.some(
      record =>
        record.status === 'PENDING' &&
        record.market === snapshot.market &&
        record.contract === snapshot.contract &&
        record.durationSeconds === durationSeconds,
    )

    if (
      !alreadyRecorded &&
      !hasPendingSignal &&
      validSelection
    ) {
      records.push({
        id,
        market: snapshot.market,
        contract: snapshot.contract,
        selection: snapshot.selection,
        signalEpoch: lastTick.epoch,
        signalQuote: lastTick.quote,
        signalDigit: lastTick.digit,
        probability: snapshot.probability,
        baseline: snapshot.baseline,
        lowerBound: snapshot.lowerBound,
        barrier: snapshot.barrier,
        durationSeconds,
        status: 'PENDING',
        createdAt: Date.now(),
      })
    }
  }

  saveRecords(records)

  return records
}

export function getSignalRecords(): SignalRecord[] {
  return readRecords().slice().reverse()
}

export function getSignalPerformance(): PerformanceStats {
  const records = readRecords()

  const wins = records.filter(
    record => record.status === 'WIN',
  ).length

  const losses = records.filter(
    record => record.status === 'LOSS',
  ).length

  const pending = records.filter(
    record => record.status === 'PENDING',
  ).length

  const total = wins + losses

  return {
    total,
    wins,
    losses,
    pending,
    winRate: total > 0 ? (wins / total) * 100 : 0,
  }
}

export function clearSignalPerformance(): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Local storage may be unavailable.
  }
      }
