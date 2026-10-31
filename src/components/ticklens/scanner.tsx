
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Loader2,
  Play,
  Radar,
  Square,
  Database,
  BrainCircuit,
  Activity,
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
  getTicks,
  MAX_TICKS_PER_MARKET,
  type MarketStorageStats,
} from '@/lib/tick-storage'

import {
  processSignalSnapshot,
  getSignalPerformance,
  getSignalRecords,
} from '@/lib/signal-performance'

import type {
  PerformanceStats,
  SignalRecord,
} from '@/lib/signal-performance'

import {
  trainMarketStrategies,
} from '@/lib/ai-trainer'

import type {
  MarketTrainingReport,
} from '@/lib/ai-trainer'

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

  const [performance, setPerformance] = useState<PerformanceStats>({
    total: 0,
    wins: 0,
    losses: 0,
    pending: 0,
    winRate: 0,
  })

  const [recentRecords, setRecentRecords] = useState<SignalRecord[]>([])

  // AI training state
  const [training, setTraining] = useState(false)

  const [trainingReport, setTrainingReport] =
    useState<MarketTrainingReport | null>(null)

  const [trainingError, setTrainingError] =
    useState<string | null>(null)

  const contractLabel: Record<ContractType, string> = {
    matches: 'Matches',
    differs: 'Differs',
    even: 'Even',
    odd: 'Odd',
    rise: 'Rise',
    fall: 'Fall',
  }

  // Use the currently selected market for training.
  const trainingMarket =
    markets.find(market => market.symbol === activeSymbol) ??
    markets[0]

  // Run the trainer using saved IndexedDB ticks.
  async function handleTrain() {
    if (!trainingMarket || training) return

    setTraining(true)
    setTrainingError(null)
    setTrainingReport(null)

    try {
      const ticks = await getTicks(
        trainingMarket.symbol,
        5000,
      )

      const report = trainMarketStrategies(
        trainingMarket.symbol,
        ticks,
      )

      setTrainingReport(report)
    } catch (error) {
      setTrainingError(
        error instanceof Error
          ? error.message
          : 'Training could not be completed.',
      )
    } finally {
      setTraining(false)
    }
  }

  // Estimate live collection speed using the latest 10 seconds.
  const liveStats = useMemo(() => {
    const cutoff = Math.floor(Date.now() / 1000) - 10

    let totalTicksPerSecond = 0
    let liveMarkets = 0
    let waitingMarkets = 0

    const perMarket: Record<
      string,
      {
        rate: number
        status: 'LIVE' | 'WAITING' | 'STOPPED'
      }
    > = {}

    for (const market of markets) {
      const entry = entries[market.symbol]

      if (!running) {
        perMarket[market.symbol] = {
          rate: 0,
          status: 'STOPPED',
        }
        continue
      }

      const recentCount = entry?.epochs
        ? entry.epochs.filter(epoch => epoch >= cutoff).length
        : 0

      const rate = recentCount / 10

      const fresh =
        !!entry &&
        !entry.error &&
        Date.now() - entry.updatedAt <= 15000

      const status =
        fresh && recentCount > 0 ? 'LIVE' : 'WAITING'

      perMarket[market.symbol] = { rate, status }

      totalTicksPerSecond += rate

      if (status === 'LIVE') {
        liveMarkets++
      } else {
        waitingMarkets++
      }
    }

    return {
      perMarket,
      totalTicksPerSecond,
      liveMarkets,
      waitingMarkets,
    }
  }, [markets, entries, running])

  // Find fresh markets with qualifying contract evidence.
  const contractSignals = useMemo(() => {
    const now = Date.now()

    return markets
      .map(market => {
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
      .filter(
        (item): item is NonNullable<typeof item> =>
          item !== null,
      )
      .sort(
        (a, b) =>
          b.margin - a.margin ||
          b.evidence.tests - a.evidence.tests,
      )
  }, [markets, entries, contract])

  const strongestSignal = contractSignals[0] ?? null

  const activeSignal = contractSignals.find(
    item => item.market.symbol === activeSymbol,
  )

  const bestSignal =
    activeSignal &&
    strongestSignal &&
    strongestSignal.margin - activeSignal.margin <= 0.01
      ? activeSignal
      : strongestSignal

  // Switch the main analyzer only while scanning.
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

  // Record signals only while scanning.
  useEffect(() => {
    for (const market of markets) {
      const entry = entries[market.symbol]

      if (
        !entry ||
        entry.error ||
        !entry.epochs ||
        entry.epochs.length === 0
      ) {
        continue
      }

      const evidence = analyzeContractEvidence(
        contract,
        entry.digits,
        entry.quotes,
      )

      const isSelectedSignal =
        running &&
        bestSignal?.market.symbol === market.symbol &&
        evidence.signal === 'CHECK' &&
        evidence.lowerBound !== null

      processSignalSnapshot({
        market: market.symbol,
        contract,
        selection: String(evidence.selection ?? ''),
        signal: isSelectedSignal ? 'CHECK' : 'WAIT',
        probability: evidence.probability ?? 0,
        baseline: evidence.baseline ?? 0,
        lowerBound: evidence.lowerBound ?? 0,
        quotes: entry.quotes,
        digits: entry.digits,
        epochs: entry.epochs,
      })
    }

    setPerformance(getSignalPerformance())
    setRecentRecords(getSignalRecords().slice(0, 5))
  }, [markets, entries, contract, bestSignal, running])

  // Refresh storage statistics every three seconds.
  useEffect(() => {
    let active = true

    async function refreshStorage() {
      try {
        const results = await Promise.all(
          markets.map(market =>
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

    const timer = setInterval(() => {
      void refreshStorage()
    }, 3000)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [markets])

  const totalStored = Object.values(storageStats).reduce(
    (sum, item) => sum + item.count,
    0,
  )

  const totalTarget = markets.length * MAX_TICKS_PER_MARKET

  const totalProgress = totalTarget
    ? (totalStored / totalTarget) * 100
    : 0

  const readyMarkets = Object.values(storageStats).filter(
    item => item.count >= MAX_TICKS_PER_MARKET,
  ).length

  const rows = useMemo(() => {
    const list = markets.map(market => {
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
                    {bestSignal.evidence.probability.toFixed(1)}%
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
                    {bestSignal.evidence.lowerBound!.toFixed(1)}%
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

      {/* SIGNAL PERFORMANCE DASHBOARD */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            Signal performance tracker
          </CardTitle>

          <CardDescription>
            Tracks selected CHECK signals and compares them with
            the next actual tick. Results are saved on this device.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                Settled signals
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {performance.total}
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                Wins
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-green-500">
                {performance.wins}
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                Losses
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-destructive">
                {performance.losses}
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                Pending
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {performance.pending}
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                Measured win rate
              </span>
              <span className="text-lg font-bold tabular-nums">
                {performance.winRate.toFixed(1)}%
              </span>
            </div>

            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{
                  width: `${Math.min(100, performance.winRate)}%`,
                }}
              />
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              Based only on settled tracker records. Pending signals
              are excluded. This is historical measurement, not a
              guarantee of future performance.
            </p>
          </div>

          <div className="space-y-2">
            <div className="font-semibold text-sm">
              Recent signal results
            </div>

            {recentRecords.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No signals recorded yet. Start the scanner and wait
                for a qualifying CHECK SIGNAL.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Market</TableHead>
                      <TableHead>Contract</TableHead>
                      <TableHead>Selection</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {recentRecords.map(record => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">
                          {record.market}
                        </TableCell>
                        <TableCell className="capitalize">
                          {record.contract}
                        </TableCell>
                        <TableCell>
                          {record.selection || '—'}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              'rounded-md px-2 py-1 text-xs font-bold',
                              record.status === 'WIN' &&
                                'bg-green-500/10 text-green-600',
                              record.status === 'LOSS' &&
                                'bg-destructive/10 text-destructive',
                              record.status === 'PENDING' &&
                                'bg-muted text-muted-foreground',
                            )}
                          >
                            {record.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* SMART AI STRATEGY TRAINER */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BrainCircuit className="size-5 text-primary" />
            Smart AI Strategy Trainer
          </CardTitle>

          <CardDescription>
            Tests six strategies using saved historical ticks,
            then evaluates them on a separate unseen validation period.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">
              Selected training market
            </div>

            <div className="mt-1 font-bold">
              {trainingMarket
                ? `${trainingMarket.name} (${trainingMarket.symbol})`
                : 'No market available'}
            </div>

            <p className="mt-1 text-xs text-muted-foreground">
              Uses up to 5,000 saved ticks from this market.
              Select a different market in the main analyzer to train it.
            </p>
          </div>

          <Button
            className="w-full"
            onClick={handleTrain}
            disabled={training || !trainingMarket}
          >
            {training ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Training strategies...
              </>
            ) : (
              <>
                <BrainCircuit className="mr-2 size-4" />
                TRAIN SELECTED MARKET
              </>
            )}
          </Button>

          {trainingError && (
            <p className="text-sm text-destructive">
              {trainingError}
            </p>
          )}

          {trainingReport && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3">
                <div className="font-semibold">
                  Training report: {trainingReport.market}
                </div>

                <p className="mt-1 text-sm text-muted-foreground">
                  {trainingReport.message}
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <div className="rounded-md bg-muted p-2">
                    <div className="text-xs text-muted-foreground">
                      Unique ticks
                    </div>
                    <div className="font-bold tabular-nums">
                      {trainingReport.uniqueTicks.toLocaleString()}
                    </div>
                  </div>

                  <div className="rounded-md bg-muted p-2">
                    <div className="text-xs text-muted-foreground">
                      Training ticks
                    </div>
                    <div className="font-bold tabular-nums">
                      {trainingReport.trainingTicks.toLocaleString()}
                    </div>
                  </div>

                  <div className="rounded-md bg-muted p-2">
                    <div className="text-xs text-muted-foreground">
                      Validation ticks
                    </div>
                    <div className="font-bold tabular-nums">
                      {trainingReport.validationTicks.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-semibold text-sm">
                  Strategy validation results
                </div>

                {trainingReport.strategies.map(strategy => (
                  <div
                    key={strategy.contract}
                    className="space-y-2 rounded-lg border p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold capitalize">
                        {strategy.contract}
                      </span>

                      <span
                        className={cn(
                          'rounded-md px-2 py-1 text-xs font-bold',
                          strategy.status === 'VALIDATION_EDGE' &&
                            'bg-green-500/10 text-green-600',
                          strategy.status === 'NO_VALIDATION_EDGE' &&
                            'bg-destructive/10 text-destructive',
                          strategy.status === 'INSUFFICIENT_VALIDATION' &&
                            'bg-muted text-muted-foreground',
                        )}
                      >
                        {strategy.status === 'VALIDATION_EDGE'
                          ? 'PASSED VALIDATION'
                          : strategy.status === 'NO_VALIDATION_EDGE'
                            ? 'NO EDGE DEMONSTRATED'
                            : 'MORE TESTS NEEDED'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-md bg-muted p-2">
                        <div className="text-xs text-muted-foreground">
                          Training accuracy
                        </div>
                        <div className="font-bold tabular-nums">
                          {strategy.training.accuracy === null
                            ? '—'
                            : `${strategy.training.accuracy.toFixed(1)}%`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {strategy.training.tests} tests
                        </div>
                      </div>

                      <div className="rounded-md bg-muted p-2">
                        <div className="text-xs text-muted-foreground">
                          Validation accuracy
                        </div>
                        <div className="font-bold tabular-nums">
                          {strategy.validation.accuracy === null
                            ? '—'
                            : `${strategy.validation.accuracy.toFixed(1)}%`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {strategy.validation.tests} tests
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      Reference baseline: {strategy.validation.baseline}%
                      {' · '}
                      Validation lower bound:{' '}
                      {strategy.validation.lowerBound === null
                        ? '—'
                        : `${strategy.validation.lowerBound.toFixed(1)}%`}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {strategy.explanation}
                    </p>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                Training uses historical data and does not guarantee
                future outcomes. Validation is a historical test,
                not a live trading signal.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ALL-MARKET LIVE COLLECTION MONITOR */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            All-Market Live Collection Monitor
          </CardTitle>

          <CardDescription>
            Live activity across every synthetic market returned by Deriv.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                Total collection speed
              </div>
              <div className="mt-2 text-2xl font-bold tabular-nums">
                {liveStats.totalTicksPerSecond.toFixed(1)}
              </div>
              <div className="text-xs text-muted-foreground">
                ticks / second
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                Active markets
              </div>
              <div className="mt-2 text-2xl font-bold tabular-nums text-green-500">
                {liveStats.liveMarkets}
              </div>
              <div className="text-xs text-muted-foreground">
                Receiving recent ticks
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                Waiting markets
              </div>
              <div className="mt-2 text-2xl font-bold tabular-nums">
                {liveStats.waitingMarkets}
              </div>
              <div className="text-xs text-muted-foreground">
                No recent ticks detected
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                Markets scanned
              </div>
              <div className="mt-2 text-2xl font-bold tabular-nums">
                {markets.length}
              </div>
              <div className="text-xs text-muted-foreground">
                Available markets
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="font-semibold text-sm">
              Individual market activity
            </div>

            {markets.map(market => {
              const live = liveStats.perMarket[market.symbol]

              return (
                <div
                  key={market.symbol}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {market.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {market.symbol}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div
                      className={cn(
                        'text-xs font-bold',
                        live?.status === 'LIVE' && 'text-green-500',
                        live?.status === 'WAITING' && 'text-yellow-500',
                        live?.status === 'STOPPED' && 'text-muted-foreground',
                      )}
                    >
                      {live?.status ?? 'WAITING'}
                    </div>
                    <div className="text-xs tabular-nums text-muted-foreground">
                      {(live?.rate ?? 0).toFixed(1)} ticks/s
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            Speed is estimated from tick timestamps in the latest 10 seconds.
            A waiting market may simply have no recent tick. Live speed depends
            on Deriv's tick delivery and your connection.
          </p>
        </CardContent>
      </Card>

      {/* DATA COLLECTION PROGRESS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BrainCircuit className="size-5 text-primary" />
            TickLens Data Collection Progress
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
                Markets at target
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

            {markets.map(market => {
              const item = storageStats[market.symbol]
              const count = item?.count ?? 0
              const progress = item?.progress ?? 0
              const complete = count >= MAX_TICKS_PER_MARKET
              const live = liveStats.perMarket[market.symbol]

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
                      {count.toLocaleString()}/
                      {MAX_TICKS_PER_MARKET.toLocaleString()}
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

                  <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span>{progress.toFixed(2)}% collected</span>

                    <span>
                      {complete ? 'Target reached' : 'Collecting'}
                    </span>

                    <span
                      className={cn(
                        'font-semibold',
                        live?.status === 'LIVE' && 'text-green-500',
                        live?.status === 'WAITING' && 'text-yellow-500',
                        live?.status === 'STOPPED' && 'text-muted-foreground',
                      )}
                    >
                      {live?.status ?? 'WAITING'}
                      {' · '}
                      {(live?.rate ?? 0).toFixed(1)} ticks/s
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            Collection happens while the scanner is running and connected
            to Deriv. Reaching the tick target means data collection is
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
                          onClick={event => {
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
