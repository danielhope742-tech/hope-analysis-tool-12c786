import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Loader2,
  Play,
  Radar,
  Square,
  Database,
  BrainCircuit,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { ScanEntry } from '@/hooks/use-deriv'
import {
  analyzeWindow,
  matchesDiffers,
  analyzeContractEvidence,
} from '@/lib/analysis'
import type { ContractType } from '@/lib/analysis'
import type { Market } from '@/lib/markets'

import {
  getMarketStorageStats,
  MAX_TICKS_PER_MARKET,
  type MarketStorageStats,
} from '@/lib/tick-storage'

import { cn } from '@/lib/utils'

type SortKey =
  | 'default'
  | 'bias'
  | 'confidence'
  | 'even'
  | 'over'
  | 'differs'

interface ScannerProps {
  markets: Market[]
  entries: Record<string, ScanEntry>
  barrier: number
  running: boolean
  onToggle: () => void
  onAnalyze: (symbol: string) => void
  activeSymbol?: string
  windowSize: number
  contract: ContractType
  onBestMarketChange: (symbol: string) => void
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
  contract,
  onBestMarketChange,
}: ScannerProps) {
  const [sort, setSort] = useState<SortKey>('bias')

  const [storageStats, setStorageStats] = useState<
    Record<string, MarketStorageStats>
  >({})

  const [storageError, setStorageError] = useState<string | null>(null)

  const contractLabel: Record<ContractType, string> = {
    matches: 'Matches',
    differs: 'Differs',
    even: 'Even',
    odd: 'Odd',
    rise: 'Rise',
    fall: 'Fall',
  }

  // Find markets with fresh historical CHECK evidence.
  const contractSignals = useMemo(() => {
    const now = Date.now()

    return markets
      .map((market) => {
        const entry = entries[market.symbol]

        if (
          !entry ||
          entry.error ||
          entry.digits.length < 100 ||
          now - entry.updatedAt > 15000
        ) {
          return null
        }

        const evidence = analyzeContractEvidence(
          contract,
          entry.digits,
          entry.quotes,
        )

        if (
          evidence.signal !== 'CHECK' ||
          evidence.lowerBound === null
        ) {
          return null
        }

        return {
          market,
          evidence,
          margin: evidence.lowerBound - evidence.baseline,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort(
        (a, b) =>
          b.margin - a.margin ||
          b.evidence.tests - a.evidence.tests,
      )
  }, [markets, entries, contract])

  const strongestSignal = contractSignals[0] ?? null

  const activeSignal = contractSignals.find(
    (item) => item.market.symbol === activeSymbol,
  )

  // Keep the current market if its evidence is almost as strong.
  const bestSignal =
    activeSignal &&
    strongestSignal &&
    strongestSignal.margin - activeSignal.margin <= 0.01
      ? activeSignal
      : strongestSignal

  // Switch the main analyzer only while the scanner is running.
  useEffect(() => {
    if (
      running &&
      bestSignal &&
      bestSignal.market.symbol !== activeSymbol
    ) {
      onBestMarketChange(bestSignal.market.symbol)
    }
  }, [
    running,
    bestSignal,
    activeSymbol,
    onBestMarketChange,
  ])

  // Refresh stored tick counts.
  useEffect(() => {
    let active = true

    async function refreshStorage() {
      try {
        const results = await Promise.all(
          markets.map((market) =>
            getMarketStorageStats(market.symbol),
          ),
        )

        if (!active) return

        const next: Record<string, MarketStorageStats> = {}

        for (const result of results) {
          next[result.market] = result
        }

        setStorageStats(next)
        setStorageError(null)
      } catch (error) {
        if (!active) return

        setStorageError(
          error instanceof Error
            ? error.message
            : 'Could not read tick storage.',
        )
      }
    }

    void refreshStorage()

    return () => {
      active = false
    }
  }, [markets, entries])

  const totalStored = Object.values(storageStats).reduce(
    (sum, item) => sum + item.count,
    0,
  )

  const totalTarget = markets.length * MAX_TICKS_PER_MARKET

  const totalProgress = totalTarget
    ? (totalStored / totalTarget) * 100
    : 0

  const readyMarkets = Object.values(storageStats).filter(
    (item) => item.count >= MAX_TICKS_PER_MARKET,
  ).length

  const rows = useMemo(() => {
    const list = markets.map((market) => {
      const entry = entries[market.symbol]

      const stats =
        entry && !entry.error
          ? analyzeWindow(entry.digits, entry.quotes, barrier)
          : null

      const md = stats
        ? matchesDiffers(entry.digits, stats.prediction)
        : null

      const differs =
        md && stats?.prediction
          ? 100 - md.rows[md.bestDiffers].next
          : null

      return { market, entry, stats, md, differs }
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

    return sort === 'default'
      ? list
      : [...list].sort((a, b) => score(b) - score(a))
  }, [markets, entries, barrier, sort])

  const loaded = Object.keys(entries).length

  return (
    <div className="space-y-4">

      {/* BEST-MARKET CONTRACT SCANNER */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radar className="size-5 text-primary" />
            Best-market signal scanner
          </CardTitle>

          <CardDescription>
            Selected contract: {contractLabel[contract]}.
            Only fresh CHECK results with at least 100 historical tests qualify.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {bestSignal ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-lg font-bold">
                    {bestSignal.market.name}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {bestSignal.market.symbol}
                    {' · '}
                    {contractLabel[contract]}
                    {' · '}
                    {bestSignal.evidence.selection}
                  </div>
                </div>

                <span className="rounded-md bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary">
                  CHECK SIGNAL FOUND
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">
                    Model estimate
                  </div>

                  <div className="font-semibold tabular-nums">
                    {(bestSignal.evidence.probability * 100).toFixed(1)}%
                  </div>
                </div>

                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">
                    Historical tests
                  </div>

                  <div className="font-semibold tabular-nums">
                    {bestSignal.evidence.tests.toLocaleString()}
                  </div>
                </div>

                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">
                    Historical accuracy
                  </div>

                  <div className="font-semibold tabular-nums">
                    {bestSignal.evidence.accuracy === null
                      ? '—'
                      : `${bestSignal.evidence.accuracy.toFixed(1)}%`}
                  </div>
                </div>

                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">
                    95% lower bound
                  </div>

                  <div className="font-semibold tabular-nums">
                    {(bestSignal.evidence.lowerBound! * 100).toFixed(1)}%
                  </div>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                {bestSignal.evidence.reason}
              </p>

              <p className="text-xs text-muted-foreground">
                {running
                  ? 'Scanner is running. The main analyzer will switch to this market when it qualifies.'
                  : 'Start Scan all markets to enable automatic market switching.'}
                {' '}
                A CHECK is historical statistical evidence, not a guarantee
                of the next result.
              </p>
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-4">
              <div className="font-semibold">
                NO CHECK SIGNAL
              </div>

              <p className="mt-1 text-sm text-muted-foreground">
                No market currently meets the selected contract's
                historical threshold with fresh data. The scanner
                will not invent a signal.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI TRAINING PROGRESS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BrainCircuit className="size-5 text-primary" />
            TickLens AI Training Progress
          </CardTitle>

          <CardDescription>
            Collecting historical and live synthetic-market ticks.
            Target: {MAX_TICKS_PER_MARKET.toLocaleString()} ticks per market.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Database className="size-4" />
                Total collected
              </div>

              <div className="mt-2 text-2xl font-bold tabular-nums">
                {totalStored.toLocaleString()}
              </div>

              <div className="text-xs text-muted-foreground">
                of {totalTarget.toLocaleString()} ticks
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-sm text-muted-foreground">
                Markets selected
              </div>

              <div className="mt-2 text-2xl font-bold tabular-nums">
                {markets.length}
              </div>

              <div className="text-xs text-muted-foreground">
                Synthetic markets
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-sm text-muted-foreground">
                Collection complete
              </div>

              <div className="mt-2 text-2xl font-bold tabular-nums">
                {readyMarkets}/{markets.length}
              </div>

              <div className="text-xs text-muted-foreground">
                Markets at 100,000 ticks
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">
                Overall collection
              </span>

              <span className="tabular-nums text-muted-foreground">
                {totalProgress.toFixed(2)}%
              </span>
            </div>

            <div className="h-3 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${Math.min(100, totalProgress)}%`,
                }}
              />
            </div>
          </div>

          {storageError && (
            <p className="text-sm text-destructive">
              Storage error: {storageError}
            </p>
          )}

          <div className="space-y-3">
            <div className="font-semibold text-sm">
              Individual market collection
            </div>

            {markets.map((market) => {
              const item = storageStats[market.symbol]
              const count = item?.count ?? 0
              const progress = item?.progress ?? 0
              const complete = count >= MAX_TICKS_PER_MARKET

              return (
                <div key={market.symbol} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium">
                        {market.name}
                      </span>

                      <span className="ml-2 text-xs text-muted-foreground">
                        {market.symbol}
                      </span>
                    </div>

                    <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                      {count.toLocaleString()}/100,000
                    </span>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        complete ? 'bg-green-500' : 'bg-primary',
                      )}
                      style={{
                        width: `${Math.min(100, progress)}%`,
                      }}
                    />
                  </div>

                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{progress.toFixed(2)}% collected</span>

                    <span>
                      {complete
                        ? 'Collection target reached'
                        : 'Collecting'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            Collection happens while the scanner is running and connected
            to Deriv. Reaching 100,000 ticks means data collection is
            complete, not that a trained or validated AI model is ready.
          </p>
        </CardContent>
      </Card>

      {/* LIVE MARKET SCANNER */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radar className="size-5 text-primary" />
            All synthetic markets
          </CardTitle>

          <CardDescription>
            Scans {markets.length} markets at once over the last{' '}
            {windowSize.toLocaleString()} ticks each. Click a row to
            analyse it in detail.
          </CardDescription>

          <CardAction>
            <Button
              onClick={onToggle}
              variant={running ? 'destructive' : 'default'}
              className="font-semibold"
            >
              {running
                ? <Square className="fill-current" />
                : <Play className="fill-current" />}

              {running ? 'Stop scan' : 'Scan all markets'}
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              Rank by
            </span>

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
                <Loader2 className="size-3.5 animate-spin" />
                Loaded {loaded}/{markets.length}
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
                  <TableHead className="text-center">Stored ticks</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.map(({ market, entry, stats, md, differs }) => {
                  const quote =
                    entry?.quotes[entry.quotes.length - 1]

                  const stored = storageStats[market.symbol]

                  return (
                    <TableRow
                      key={market.symbol}
                      onClick={() => onAnalyze(market.symbol)}
                      className={cn(
                        'cursor-pointer',
                        activeSymbol === market.symbol && 'bg-primary/5',
                      )}
                    >
                      <TableCell>
                        <div className="font-medium">
                          {market.name}
                        </div>

                        <div className="tabular text-xs text-muted-foreground">
                          {market.symbol} · {market.group}
                        </div>
                      </TableCell>

                      {entry?.error ? (
                        <TableCell
                          colSpan={10}
                          className="text-sm text-muted-foreground"
                        >
                          {entry.error}
                        </TableCell>
                      ) : stats && quote !== undefined ? (
                        <>
                          <TableCell className="tabular text-right">
                            {quote.toFixed(entry.pipSize)}
                          </TableCell>

                          <TableCell className="text-center">
                            <span className="tabular inline-flex size-7 items-center justify-center rounded-md bg-muted font-semibold">
                              {entry.digits[entry.digits.length - 1]}
                            </span>
                          </TableCell>

                          <Pct value={stats.even} />

                          <Pct
                            value={stats.over}
                            expected={(9 - barrier) * 10}
                          />

                          <Pct value={stats.rise} />

                          <TableCell className="tabular text-center">
                            <span className="text-up">
                              {stats.hottest}
                            </span>

                            <span className="px-1 text-muted-foreground">
                              /
                            </span>

                            <span className="text-down">
                              {stats.coldest}
                            </span>
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                                <div
                                  className={cn(
                                    'h-full rounded-full',
                                    stats.bias > 66
                                      ? 'bg-warn'
                                      : stats.bias > 33
                                        ? 'bg-chart-2'
                                        : 'bg-muted-foreground/50',
                                  )}
                                  style={{
                                    width: `${Math.max(4, stats.bias)}%`,
                                  }}
                                />
                              </div>

                              <span className="tabular text-xs text-muted-foreground">
                                {stats.bias.toFixed(0)}
                              </span>
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

                                <span className="text-xs text-muted-foreground">
                                  {differs.toFixed(1)}%
                                </span>
                              </span>
                            ) : (
                              '—'
                            )}
                          </TableCell>

                          <TableCell className="text-center">
                            <div className="text-xs tabular">
                              {(stored?.count ?? 0).toLocaleString()}
                            </div>

                            <div className="text-xs text-muted-foreground">
                              {(stored?.progress ?? 0).toFixed(1)}%
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <TableCell
                          colSpan={10}
                          className="text-sm text-muted-foreground"
                        >
                          {running
                            ? 'Loading…'
                            : 'Press “Scan all markets” to load live data'}
                        </TableCell>
                      )}

                      <TableCell className="text-right">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Analyse ${market.name}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            onAnalyze(market.symbol)
                          }}
                        >
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
    </div>
  )
}

function Pct({
  value,
  expected = 50,
}: {
  value: number
  expected?: number
}) {
  const skew = Math.abs(value - expected)

  return (
    <TableCell
      className={cn(
        'tabular text-right',
        skew >= 5 && 'font-semibold text-warn',
      )}
    >
      {value.toFixed(1)}%
    </TableCell>
  )
  }
