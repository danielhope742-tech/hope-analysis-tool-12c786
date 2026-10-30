
// TickLens: the 10 selected synthetic markets.
// Each market has a collection target of 100,000 ticks.

export interface Market {
  symbol: string
  name: string
  group: string
  pipSize: number
}

export const TARGET_TICKS_PER_MARKET = 100_000

export const TRACKED_MARKET_SYMBOLS = [
  'R_10',
  'R_25',
  'R_50',
  'R_75',
  'R_100',
  '1HZ10V',
  '1HZ25V',
  '1HZ50V',
  '1HZ75V',
  '1HZ100V',
] as const

export const TOTAL_TICK_TARGET =
  TRACKED_MARKET_SYMBOLS.length * TARGET_TICKS_PER_MARKET

export const FALLBACK_MARKETS: Market[] = [
  { symbol: 'R_10', name: 'Volatility 10 Index', group: 'Volatility', pipSize: 3 },
  { symbol: 'R_25', name: 'Volatility 25 Index', group: 'Volatility', pipSize: 3 },
  { symbol: 'R_50', name: 'Volatility 50 Index', group: 'Volatility', pipSize: 4 },
  { symbol: 'R_75', name: 'Volatility 75 Index', group: 'Volatility', pipSize: 4 },
  { symbol: 'R_100', name: 'Volatility 100 Index', group: 'Volatility', pipSize: 2 },
  { symbol: '1HZ10V', name: 'Volatility 10 (1s) Index', group: 'Volatility (1s)', pipSize: 2 },
  { symbol: '1HZ25V', name: 'Volatility 25 (1s) Index', group: 'Volatility (1s)', pipSize: 2 },
  { symbol: '1HZ50V', name: 'Volatility 50 (1s) Index', group: 'Volatility (1s)', pipSize: 2 },
  { symbol: '1HZ75V', name: 'Volatility 75 (1s) Index', group: 'Volatility (1s)', pipSize: 2 },
  { symbol: '1HZ100V', name: 'Volatility 100 (1s) Index', group: 'Volatility (1s)', pipSize: 2 },
]

interface ActiveSymbol {
  underlying_symbol?: string
  underlying_symbol_name?: string
  symbol?: string
  display_name?: string
  market: string
  submarket?: string
  submarket_display_name?: string
  pip_size?: number
  pip?: number
  is_trading_suspended: number
}

const TRACKED_SET = new Set<string>(TRACKED_MARKET_SYMBOLS)

const SUBMARKET_GROUPS: Record<string, string> = {
  random_index: 'Volatility',
  jump_index: 'Jump',
  crash_index: 'Crash/Boom',
  random_daily: 'Daily Reset',
  range_index: 'Range Break',
  step_index: 'Step',
  forex_basket: 'Forex Basket',
  commodity_basket: 'Commodity Basket',
}

function groupFor(symbol: string, r: ActiveSymbol) {
  if (r.submarket_display_name) {
    return r.submarket_display_name.replace(/ Indices$/, '')
  }

  const group = SUBMARKET_GROUPS[r.submarket ?? ''] ?? 'Other'

  return group === 'Volatility' && symbol.startsWith('1HZ')
    ? 'Volatility (1s)'
    : group
}

/** Return only the 10 markets selected for TickLens collection. */
export function marketsFromActiveSymbols(rows: ActiveSymbol[]): Market[] {
  const available = new Map<string, Market>()

  for (const r of rows) {
    if (r.market !== 'synthetic_index' || r.is_trading_suspended) continue

    const symbol = r.underlying_symbol ?? r.symbol
    const pip = r.pip_size ?? r.pip

    if (!symbol || !pip || !TRACKED_SET.has(symbol)) continue

    available.set(symbol, {
      symbol,
      name:
        r.underlying_symbol_name ??
        r.display_name ??
        FALLBACK_MARKETS.find((m) => m.symbol === symbol)?.name ??
        symbol,
      group: groupFor(symbol, r),
      pipSize: Math.max(0, Math.round(-Math.log10(pip))),
    })
  }

  // Preserve the agreed market order. Use fallback details if a market
  // is missing from the active-symbol response.
  return FALLBACK_MARKETS
    .filter((market) => TRACKED_SET.has(market.symbol))
    .map((fallback) => available.get(fallback.symbol) ?? fallback)
}
