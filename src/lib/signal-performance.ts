export type TrackedContract =
  | 'matches'
  | 'differs'
  | 'even'
  | 'odd'
  | 'rise'
  | 'fall';

export interface SignalSnapshot {
  market: string;
  contract: TrackedContract;
  selection: string;
  signal: 'CHECK' | 'WAIT';
  probability: number;
  baseline: number;
  lowerBound: number;
  quotes: number[];
  digits: number[];
  epochs?: number[];
}

export interface SignalRecord {
  id: string;
  market: string;
  contract: TrackedContract;
  selection: string;
  signalEpoch: number;
  signalQuote: number;
  signalDigit: number;
  probability: number;
  baseline: number;
  lowerBound: number;
  status: 'PENDING' | 'WIN' | 'LOSS';
  resultEpoch?: number;
  resultQuote?: number;
  resultDigit?: number;
  createdAt: number;
}

export interface PerformanceStats {
  total: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
}

const STORAGE_KEY = 'ticklens_signal_performance_v1';
const MAX_RECORDS = 1000;

function readRecords(): SignalRecord[] {
  if (typeof window === 'undefined') return [];

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];

    const parsed = JSON.parse(saved);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecords(records: SignalRecord[]): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(records.slice(-MAX_RECORDS))
    );
  } catch {
    // Storage may be unavailable or full.
  }
}

function extractDigit(selection: string): number | null {
  const match = selection.match(/\b([0-9])\b/);

  if (!match) return null;

  return Number(match[1]);
}

function evaluateOutcome(
  contract: TrackedContract,
  selection: string,
  signalQuote: number,
  resultQuote: number,
  resultDigit: number
): boolean {
  switch (contract) {
    case 'matches': {
      const digit = extractDigit(selection);
      return digit !== null && resultDigit === digit;
    }

    case 'differs': {
      const digit = extractDigit(selection);
      return digit !== null && resultDigit !== digit;
    }

    case 'even':
      return resultDigit % 2 === 0;

    case 'odd':
      return resultDigit % 2 === 1;

    case 'rise':
      return resultQuote > signalQuote;

    case 'fall':
      return resultQuote < signalQuote;

    default:
      return false;
  }
}

export function processSignalSnapshot(
  snapshot: SignalSnapshot
): SignalRecord[] {
  const records = readRecords();

  const count = Math.min(
    snapshot.quotes.length,
    snapshot.digits.length,
    snapshot.epochs?.length ?? 0
  );

  if (count < 2) return records;

  const ticks = Array.from({ length: count }, (_, index) => ({
    quote: snapshot.quotes[index],
    digit: snapshot.digits[index],
    epoch: snapshot.epochs![index],
  }))
    .filter(tick =>
      Number.isFinite(tick.quote) &&
      Number.isInteger(tick.digit) &&
      tick.digit >= 0 &&
      tick.digit <= 9 &&
      Number.isFinite(tick.epoch)
    )
    .sort((a, b) => a.epoch - b.epoch);

  if (ticks.length < 2) return records;

  // Settle pending signals using the first later tick.
  for (const record of records) {
    if (
      record.status !== 'PENDING' ||
      record.market !== snapshot.market
    ) {
      continue;
    }

    const nextTick = ticks.find(
      tick => tick.epoch > record.signalEpoch
    );

    if (!nextTick) continue;

    const won = evaluateOutcome(
      record.contract,
      record.selection,
      record.signalQuote,
      nextTick.quote,
      nextTick.digit
    );

    record.status = won ? 'WIN' : 'LOSS';
    record.resultEpoch = nextTick.epoch;
    record.resultQuote = nextTick.quote;
    record.resultDigit = nextTick.digit;
  }

  // Record new CHECK signals only.
  if (snapshot.signal === 'CHECK') {
    const lastTick = ticks[ticks.length - 1];

    if (lastTick) {
      const selectedDigit =
        snapshot.contract === 'matches' ||
        snapshot.contract === 'differs'
          ? extractDigit(snapshot.selection)
          : null;

      const validSelection =
        snapshot.contract === 'matches' ||
        snapshot.contract === 'differs'
          ? selectedDigit !== null
          : true;

      const id = [
        snapshot.market,
        snapshot.contract,
        snapshot.selection,
        lastTick.epoch,
      ].join('|');

      const alreadyRecorded = records.some(
        record => record.id === id
      );

      if (!alreadyRecorded && validSelection) {
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
          status: 'PENDING',
          createdAt: Date.now(),
        });
      }
    }
  }

  saveRecords(records);

  return records;
}

export function getSignalRecords(): SignalRecord[] {
  return readRecords().slice().reverse();
}

export function getSignalPerformance(): PerformanceStats {
  const records = readRecords();

  const wins = records.filter(
    record => record.status === 'WIN'
  ).length;

  const losses = records.filter(
    record => record.status === 'LOSS'
  ).length;

  const pending = records.filter(
    record => record.status === 'PENDING'
  ).length;

  const total = wins + losses;

  return {
    total,
    wins,
    losses,
    pending,
    winRate: total > 0 ? (wins / total) * 100 : 0,
  };
}

export function clearSignalPerformance(): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable.
  }
        }
