import { useMemo, useState } from 'react'
import { ArrowRight, Loader2, Play, Radar, Square } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ScanEntry } from '@/hooks/use-deriv'
import { analyzeWindow, matchesDiffers } from '@/lib/analysis'
import type { Market } from '@/lib/markets'
import { cn } from '@/lib/utils'

type SortKey = 'default' | 'bias' | 'confidence' | 'even' | 'over' | 'differs'

interface ScannerProps {
  markets: Market[]
  entries: Record<string, ScanEntry>
  barrier: number
  running: boolean
  onToggle: () => void
  onAnalyze: (symbol: string) => void
  activeSymbol?: string
  windowSize: number
}

export function Scanner({
  markets,
  entries,
  barrier,
  running,
  onToggle,
  onAnalyze,
  activeSymbol,
  windowSize,
}: ScannerProps) {
  const [sort, setSort] = useState<SortKey>('bias')

  const rows = useMemo(() => {
    const list = markets.map((m) => {
      const entry = entries[m.symbol]
      const stats = entry && !entry.error ? analyzeWindow(entry.digits, entry.quotes, barrier) : null
      const md = stats ? matchesDiffers(entry.digits, stats.prediction) : null
      // Chance the next digit differs from the least likely one.
      const differs = md && stats?.prediction ? 100 - md.rows[md.bestDiffers].next : null
      return { market: m, entry, stats, md, differs }
    })
    const score = (r: (typeof list)[number]) => {
      if (!r.stats) return -1
      switch (sort) {
        case 'bias':
          return r.stats.bias
        case 'confidence':
          return r.stats.prediction?.confidence ?? 0
        case 'even':
          return Math.abs(r.stats.even - 50)
        case 'over':
          return Math.max(r.stats.over, r.stats.under)
        case 'differs':
          return r.differs ?? 0
        default:
          return 0
      }
    }
    return sort === 'default' ? list : [...list].sort((a, b) => score(b) - score(a))
  }, [markets, entries, barrier, sort])

  const loaded = Object.keys(entries).length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radar className="size-5 text-primary" /> All synthetic markets
        </CardTitle>
        <CardDescription>
          Scans {markets.length} markets at once over the last {windowSize.toLocaleString()} ticks each. Click a row to
          analyse it in detail.
        </CardDescription>
        <CardAction>
          <Button onClick={onToggle} variant={running ? 'destructive' : 'default'} className="font-semibold">
            {running ? <Square className="fill-current" /> : <Play className="fill-current" />}
            {running ? 'Stop scan' : 'Scan all markets'}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Rank by</span>
          {(
            [
              ['bias', 'Digit bias'],
              ['confidence', 'Prediction confidence'],
              ['even', 'Even/Odd skew'],
              ['over', `Over/Under ${barrier}`],
              ['differs', 'Matches/Differs'],
              ['default', 'Market order'],
            ] as [SortKey, string][]
          ).map(([key, label]) => (
            <Button
              key={key}
              size="xs"
              variant={sort === key ? 'secondary' : 'ghost'}
              onClick={() => setSort(key)}
              aria-pressed={sort === key}
            >
              {label}
            </Button>
          ))}
          {running && loaded < markets.length && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Loaded {loaded}/{markets.length}
            </span>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Market</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-center">Last</TableHead>
                <TableHead className="text-right">Even</TableHead>
                <TableHead className="text-right">Over {barrier}</TableHead>
                <TableHead className="text-right">Rise</TableHead>
                <TableHead className="text-center">Hot / Cold</TableHead>
                <TableHead>Bias</TableHead>
                <TableHead className="text-center">Next digit</TableHead>
                <TableHead className="text-center">Best Differs</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ market, entry, stats, md, differs }) => {
                const quote = entry?.quotes[entry.quotes.length - 1]
                return (
                  <TableRow
                    key={market.symbol}
                    onClick={() => onAnalyze(market.symbol)}
                    className={cn('cursor-pointer', activeSymbol === market.symbol && 'bg-primary/5')}
                  >
                    <TableCell>
                      <div className="font-medium">{market.name}</div>
                      <div className="tabular text-xs text-muted-foreground">
                        {market.symbol} · {market.group}
                      </div>
                    </TableCell>
                    {entry?.error ? (
                      <TableCell colSpan={9} className="text-sm text-muted-foreground">
                        {entry.error}
                      </TableCell>
                    ) : stats && quote !== undefined ? (
                      <>
                        <TableCell className="tabular text-right">{quote.toFixed(entry.pipSize)}</TableCell>
                        <TableCell className="text-center">
                          <span className="tabular inline-flex size-7 items-center justify-center rounded-md bg-muted font-semibold">
                            {entry.digits[entry.digits.length - 1]}
                          </span>
                        </TableCell>
                        <Pct value={stats.even} />
                        <Pct value={stats.over} expected={(9 - barrier) * 10} />
                        <Pct value={stats.rise} />
                        <TableCell className="tabular text-center">
                          <span className="text-up">{stats.hottest}</span>
                          <span className="px-1 text-muted-foreground">/</span>
                          <span className="text-down">{stats.coldest}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  stats.bias > 66 ? 'bg-warn' : stats.bias > 33 ? 'bg-chart-2' : 'bg-muted-foreground/50',
                                )}
                                style={{ width: `${Math.max(4, stats.bias)}%` }}
                              />
                            </div>
                            <span className="tabular text-xs text-muted-foreground">{stats.bias.toFixed(0)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {stats.prediction ? (
                            <span className="tabular inline-flex items-center gap-1.5">
                              <span className="inline-flex size-7 items-center justify-center rounded-md bg-primary/15 font-bold text-primary">
                                {stats.prediction.digit}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {(stats.prediction.confidence * 100).toFixed(1)}%
                              </span>
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {md && differs !== null ? (
                            <span className="tabular inline-flex items-center gap-1.5">
                              <span className="inline-flex size-7 items-center justify-center rounded-md bg-chart-3/15 font-bold text-chart-3">
                                {md.bestDiffers}
                              </span>
                              <span className="text-xs text-muted-foreground">{differs.toFixed(1)}%</span>
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </>
                    ) : (
                      <TableCell colSpan={9} className="text-sm text-muted-foreground">
                        {running ? 'Loading…' : 'Press “Scan all markets” to load live data'}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <Button size="icon-sm" variant="ghost" aria-label={`Analyse ${market.name}`}>
                        <ArrowRight />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function Pct({ value, expected = 50 }: { value: number; expected?: number }) {
  const skew = Math.abs(value - expected)
  return (
    <TableCell className={cn('tabular text-right', skew >= 5 && 'font-semibold text-warn')}>
      {value.toFixed(1)}%
    </TableCell>
  )
}
