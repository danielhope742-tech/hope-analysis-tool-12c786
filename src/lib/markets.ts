// Synthetic markets offered by Deriv. The live list is loaded from
// `active_symbols` once connected; this list is the fallback and the default
// order for the scanner.

export interface Market {
  symbol: string
  name: string
  group: string
  pipSize: number
}

export const FALLBACK_MARKETS: Market[] = [
  {
    symbol: 'R_10',
    name: 'Volatility 10 Index',
    group: 'Volatility',
    pipSize: 3,
  },
  {
    symbol: 'R_25',
    name: 'Volatility 25 Index',
    group: 'Volatility',
    pipSize: 3,
  },
  {
    symbol: 'R_50',
    name: 'Volatility 50 Index',
    group: 'Volatility',
    pipSize: 4,
  },
  {
    symbol: 'R_75',
    name: 'Volatility 75 Index',
    group: 'Volatility',
    pipSize: 4,
  },
  {
    symbol: 'R_100',
    name: 'Volatility 100 Index',
    group: 'Volatility',
    pipSize: 2,
  },
  {
    symbol: '1HZ10V',
    name: 'Volatility 10 (1s) Index',
    group: 'Volatility (1s)',
    pipSize: 2,
  },
  {
    symbol: '1HZ15V',
    name: 'Volatility 15 (1s) Index',
    group: 'Volatility (1s)',
    pipSize: 3,
  },
  {
    symbol: '1HZ25V',
    name: 'Volatility 25 (1s) Index',
    group: 'Volatility (1s)',
    pipSize: 2,
  },
  {
    symbol: '1HZ30V',
    name: 'Volatility 30 (1s) Index',
    group: 'Volatility (1s)',
    pipSize: 3,
  },
  {
    symbol: '1HZ50V',
    name: 'Volatility 50 (1s) Index',
    group: 'Volatility (1s)',
    pipSize: 2,
  },
  {
    symbol: '1HZ75V',
    name: 'Volatility 75 (1s) Index',
    group: 'Volatility (1s)',
    pipSize: 2,
  },
  {
    symbol: '1HZ90V',
    name: 'Volatility 90 (1s) Index',
    group: 'Volatility (1s)',
    pipSize: 3,
  },
  {
    symbol: '1HZ100V',
    name: 'Volatility 100 (1s) Index',
    group: 'Volatility (1s)',
    pipSize: 2,
  },
  { symbol: 'JD10', name: 'Jump 10 Index', group: 'Jump', pipSize: 2 },
  { symbol: 'JD25', name: 'Jump 25 Index', group: 'Jump', pipSize: 2 },
  { symbol: 'JD50', name: 'Jump 50 Index', group: 'Jump', pipSize: 2 },
  { symbol: 'JD75', name: 'Jump 75 Index', group: 'Jump', pipSize: 2 },
  { symbol: 'JD100', name: 'Jump 100 Index', group: 'Jump', pipSize: 2 },
  {
    symbol: 'RDBEAR',
    name: 'Bear Market Index',
    group: 'Daily Reset',
    pipSize: 4,
  },
  {
    symbol: 'RDBULL',
    name: 'Bull Market Index',
    group: 'Daily Reset',
    pipSize: 4,
  },
]

// The current Options API returns `underlying_symbol` / `pip_size` and submarket
// codes; the legacy v3 API returned `symbol` / `pip` and display names. Accept both.
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
  if (r.submarket_display_name)
    return r.submarket_display_name.replace(/ Indices$/, '')
  const group = SUBMARKET_GROUPS[r.submarket ?? ''] ?? 'Other'
  return group === 'Volatility' && symbol.startsWith('1HZ')
    ? 'Volatility (1s)'
    : group
}

/** Convert `active_symbols` rows into synthetic markets, keeping fallback order first. */
export function marketsFromActiveSymbols(rows: ActiveSymbol[]): Market[] {
  const synthetic = rows
    .filter((r) => r.market === 'synthetic_index' && !r.is_trading_suspended)
    .flatMap<Market>((r) => {
      const symbol = r.underlying_symbol ?? r.symbol
      const pip = r.pip_size ?? r.pip
      if (!symbol || !pip) return []
      return [
        {
          symbol,
          name: r.underlying_symbol_name ?? r.display_name ?? symbol,
          group: groupFor(symbol, r),
          pipSize: Math.max(0, Math.round(-Math.log10(pip))),
        },
      ]
    })
  const order = new Map(FALLBACK_MARKETS.map((m, i) => [m.symbol, i]))
  return synthetic.sort(
    (a, b) =>
      (order.get(a.symbol) ?? 999) - (order.get(b.symbol) ?? 999) ||
      a.group.localeCompare(b.group) ||
      a.name.localeCompare(b.name),
  )
}
