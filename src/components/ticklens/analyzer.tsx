
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Brain,
  Loader2,
  Play,
  Square,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DigitDistribution,
  SplitBar,
  TickChart,
} from '@/components/ticklens/charts'
import type { FeedState } from '@/hooks/use-deriv'
import {
  analyzeWindow,
  analyzeContractEvidence,
  predictNextDigit,
} from '@/lib/analysis'
import type {
  ContractType,
  DigitPrediction,
} from '@/lib/analysis'
import type { Market } from '@/lib/markets'
import { cn } from '@/lib/utils'

export const WINDOW_SIZES = [100, 250, 500, 1000, 2500, 5000]

interface AnalyzerProps {
  markets: Market[]
  market: Market | undefined
  onMarketChange: (symbol: string) => void
  windowSize: number
  onWindowSizeChange: (n: number) => void
  barrier: number
  onBarrierChange: (n: number) => void
  running: boolean
  onToggle: () => void
  connected: boolean
  feed: FeedState
  contract: ContractType
  onContractChange: (contract: ContractType) => void
}

const CONTRACTS: { value: ContractType; label: string }[] = [
  { value: 'matches', label: 'Matches' },
  { value: 'differs', label: 'Differs' },
  { value: 'even', label: 'Even' },
  { value: 'odd', label: 'Odd' },
  { value: 'rise', label: 'Rise' },
  { value: 'fall', label: 'Fall' },
]

interface DigitRecommendation {
  title: string
  selection: string
  estimate: number
  description: string
  digit?: number
}

interface ManualPrediction {
  marketSymbol: string
  tickCount: number
  result: DigitPrediction
}

export function Analyzer({
  markets,
  market,
  onMarketChange,
  windowSize,
  onWindowSizeChange,
  running,
  onToggle,
  connected,
  feed,
  contract,
  onContractChange,
}: AnalyzerProps) {
  const stats = useMemo(
    () => analyzeWindow(feed.digits, feed.quotes, 4),
    [feed.digits, feed.quotes],
  )

  const prediction = feed.prediction

  const [manualPrediction, setManualPrediction] =
    useState<ManualPrediction | null>(null)

  const latestAnalysisRef = useRef({
    feed,
    contract,
    marketSymbol: market?.symbol,
  })

  latestAnalysisRef.current = {
    feed,
    contract,
    marketSymbol: market?.symbol,
  }

  const [analysisSnapshot, setAnalysisSnapshot] = useState<{
    contract: ContractType
    marketSymbol: string
    evidence: ReturnType<typeof analyzeContractEvidence>
    tickCount: number
    latestEpoch: number | undefined
    updatedAt: number
  } | null>(null)

  useEffect(() => {
    if (!running) return

    const runAnalysis = () => {
      const current = latestAnalysisRef.current
      const latestEpoch =
        current.feed.epochs[current.feed.epochs.length - 1]

      if (!current.marketSymbol || !current.feed.digits.length) return

      setAnalysisSnapshot({
        contract: current.contract,
        marketSymbol: current.marketSymbol,
        evidence: analyzeContractEvidence(
          current.contract,
          current.feed.digits,
          current.feed.quotes,
        ),
        tickCount: current.feed.tickCount,
        latestEpoch,
        updatedAt: Date.now(),
      })
    }

    runAnalysis()

    const timer = window.setInterval(runAnalysis, 6000)

    return () => window.clearInterval(timer)
  }, [running])

  const snapshotMatches =
    analysisSnapshot?.contract === contract &&
    analysisSnapshot?.marketSymbol === market?.symbol

  const evidence = snapshotMatches
    ? analysisSnapshot.evidence
    : null

  const signalIsStale = Boolean(
    snapshotMatches &&
    analysisSnapshot &&
    (
      feed.tickCount !== analysisSnapshot.tickCount ||
      feed.epochs[feed.epochs.length - 1] !==
        analysisSnapshot.latestEpoch
    ),
  )

  const groups = useMemo(() => {
    const map = new Map<string, Market[]>()

    for (const m of markets) {
      map.set(m.group, [...(map.get(m.group) ?? []), m])
    }

    return [...map.entries()]
  }, [markets])

  const lastQuote = feed.quotes[feed.quotes.length - 1]
  const prevQuote = feed.quotes[feed.quotes.length - 2]

  const quoteText =
    lastQuote !== undefined
      ? lastQuote.toFixed(feed.pipSize)
      : '—'

  const direction =
    lastQuote !== undefined && prevQuote !== undefined
      ? Math.sign(lastQuote - prevQuote)
      : 0

  const acc = feed.accuracy

  const rate = (hits: number) =>
    acc.predictions > 0
      ? (hits / acc.predictions) * 100
      : null

  const sampleMessage =
    acc.predictions < 100
      ? `Collecting evidence: ${acc.predictions}/100 predictions tested`
      : `Based on ${acc.predictions} live predictions. Past accuracy does not guarantee future results.`

  const accuracy =
    evidence && evidence.tests > 0
      ? (evidence.hits / evidence.tests) * 100
      : null

  const percent = (value: number | null | undefined) =>
    value === null || value === undefined || !Number.isFinite(value)
      ? '—'
      : `${value.toFixed(1)}%`

  const recommendation = useMemo<DigitRecommendation | null>(() => {
    if (!feed.digits.length || !feed.quotes.length) return null

    if (contract === 'matches' || contract === 'differs') {
      if (!prediction || !prediction.ranked?.length) return null

      const digit =
        contract === 'matches'
          ? prediction.ranked[0]
          : prediction.ranked[prediction.ranked.length - 1]

      const matchScore =
        prediction.distribution[digit] * 100

      const estimate =
        contract === 'matches'
          ? matchScore
          : 100 - matchScore

      return {
        title: contract === 'matches'
          ? 'Recommended Matches digit'
          : 'Recommended Differs barrier',
        selection: contract === 'matches'
          ? `Matches ${digit}`
          : `Differs ${digit}`,
        estimate,
        digit,
        description: contract === 'matches'
          ? 'The digit with the highest model score.'
          : 'The digit with the lowest model score; the complementary estimate is shown.',
      }
    }

    if (contract === 'even') {
      return {
        title: 'Even contract estimate',
        selection: 'Even',
        estimate: stats.even,
        description: 'Historical share of even last digits.',
      }
    }

    if (contract === 'odd') {
      return {
        title: 'Odd contract estimate',
        selection: 'Odd',
        estimate: stats.odd,
        description: 'Historical share of odd last digits.',
      }
    }

    if (contract === 'rise') {
      return {
        title: 'Rise contract estimate',
        selection: 'Rise',
        estimate: stats.rise,
        description: 'Historical share of upward tick movements.',
      }
    }

    return {
      title: 'Fall contract estimate',
      selection: 'Fall',
      estimate: stats.fall,
      description: 'Historical share of downward tick movements.',
    }
  }, [contract, feed.digits.length, feed.quotes.length, prediction, stats])

  const runNextDigitPrediction = () => {
    if (!market || feed.digits.length < 20) return

    const result = predictNextDigit(feed.digits)

    if (!result) return

    setManualPrediction({
      marketSymbol: market.symbol,
      tickCount: feed.tickCount,
      result,
    })
  }

  const currentManualPrediction =
    manualPrediction?.marketSymbol === market?.symbol
      ? manualPrediction
      : null

  const recentDigits = feed.digits.slice(-48)

  return (
    <section
      className="space-y-4"
      aria-labelledby="analyzer-title"
    >
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="min-w-56 flex-1 space-y-1.5">
            <Label htmlFor="market">Market</Label>

            <Select
              value={market?.symbol}
              onValueChange={onMarketChange}
            >
              <SelectTrigger id="market" className="w-full">
                <SelectValue placeholder="Choose a synthetic market" />
              </SelectTrigger>

              <SelectContent position="popper" className="max-h-80">
                {groups.map(([group, list]) => (
                  <SelectGroup key={group}>
                    <SelectLabel>{group}</SelectLabel>

                    {list.map((m) => (
                      <SelectItem key={m.symbol} value={m.symbol}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-40 flex-1 space-y-1.5">
            <Label htmlFor="contract">Contract type</Label>

            <Select
              value={contract}
              onValueChange={(value) =>
                onContractChange(value as ContractType)
              }
            >
              <SelectTrigger id="contract" className="w-full">
                <SelectValue placeholder="Choose contract" />
              </SelectTrigger>

              <SelectContent position="popper">
                {CONTRACTS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="window">Tick history</Label>

            <Select
              value={String(windowSize)}
              onValueChange={(v) => onWindowSizeChange(Number(v))}
            >
              <SelectTrigger id="window" className="w-32">
                <SelectValue />
              </SelectTrigger>

              <SelectContent position="popper">
                {WINDOW_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n.toLocaleString()} ticks
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            size="lg"
            onClick={onToggle}
            variant={running ? 'destructive' : 'default'}
            className="min-w-40 font-semibold"
          >
            {running
              ? <Square className="fill-current" />
              : <Play className="fill-current" />}
            {running ? 'Stop analysis' : 'Start analysis'}
          </Button>
        </CardContent>
      </Card>

      {feed.error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm">
          <span className="font-semibold">
            Deriv returned an error:
          </span>{' '}
          {feed.error.message}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <Activity className="size-4" />
              {market?.name ?? 'No market selected'}
              <span className="tabular text-xs">
                ({market?.symbol})
              </span>
            </CardDescription>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-baseline gap-3">
                <span
                  id="analyzer-title"
                  className="tabular text-4xl font-bold tracking-tight md:text-5xl"
                >
                  {quoteText.slice(0, -1)}
                  <span className="text-primary">
                    {quoteText.slice(-1)}
                  </span>
                </span>

                {direction !== 0 && (
                  <span
                    className={cn(
                      'flex items-center text-sm font-semibold',
                      direction > 0 ? 'text-up' : 'text-down',
                    )}
                  >
                    {direction > 0
                      ? <TrendingUp className="size-4" />
                      : <TrendingDown className="size-4" />}
                    {direction > 0 ? 'Rise' : 'Fall'}
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <Badge variant="secondary" className="tabular">
                  {stats.total.toLocaleString()} ticks analysed
                </Badge>

                <Badge variant="outline" className="tabular">
                  +{feed.tickCount} live
                </Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {feed.loading ? (
              <div className="flex aspect-[600/160] items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading tick history…
              </div>
            ) : !running && !feed.quotes.length ? (
              <div className="flex aspect-[600/160] flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center text-sm text-muted-foreground">
                <span>
                  Choose a market and press{' '}
                  <strong className="text-foreground">
                    Start analysis
                  </strong>.
                </span>

                {!connected && (
                  <span className="text-xs">
                    Connecting to Deriv…
                  </span>
                )}
              </div>
            ) : (
              <TickChart quotes={feed.quotes.slice(-150)} />
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-primary/15 blur-3xl" />

          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="size-5 text-primary" />
              Contract analysis
            </CardTitle>

            <CardDescription>
              Automatic analysis for your selected contract.
              No target digit is required.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Target className="size-5 text-primary" />
                <span className="font-semibold">
                  Live digit recommendation
                </span>
              </div>

              {recommendation ? (
                <div className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    {recommendation.title}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-3xl font-bold text-primary">
                      {recommendation.selection}
                    </div>

                    {recommendation.digit !== undefined && (
                      <div className="flex size-14 items-center justify-center rounded-xl border border-primary/40 bg-background text-3xl font-bold">
                        {recommendation.digit}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">
                      Historical model estimate
                    </span>
                    <span className="font-bold tabular">
                      {percent(recommendation.estimate)}
                    </span>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${Math.max(0, Math.min(100, recommendation.estimate))}%`,
                      }}
                    />
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {recommendation.description}
                  </p>

                  <Badge variant="outline">
                    Model recommendation · Not guaranteed
                  </Badge>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Waiting for enough live tick data to calculate a recommendation.
                </div>
              )}
            </div>

            {!evidence ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                {running
                  ? 'Waiting for the first 6-second analysis snapshot…'
                  : 'Press Start analysis to begin the 6-second analysis cycle.'}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {CONTRACTS.find(
                      (item) => item.value === contract,
                    )?.label}
                  </Badge>

                  <Badge
                    variant={signalIsStale ? 'destructive' : 'secondary'}
                  >
                    {signalIsStale
                      ? 'STALE · new ticks received'
                      : 'CURRENT SNAPSHOT'}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="text-3xl font-bold text-primary">
                    {evidence.selection || 'Waiting for data'}
                  </div>

                  <div className="text-sm text-muted-foreground">
                    Model estimate: {percent(evidence.probability)}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Analysed:{' '}
                    {analysisSnapshot
                      ? new Date(
                          analysisSnapshot.updatedAt,
                        ).toLocaleTimeString()
                      : '—'}
                    {' · '}Refreshes every 6 seconds
                  </div>
                </div>

                <div className="rounded-lg border bg-background/40 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">
                      Historical test status
                    </span>

                    <Badge
                      variant={
                        evidence.signal === 'CHECK'
                          ? 'default'
                          : 'secondary'
                      }
                    >
                      {evidence.signal}
                    </Badge>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    {evidence.reason}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <EvidenceStat
                    label="Tests"
                    value={evidence.tests.toLocaleString()}
                  />

                  <EvidenceStat
                    label="Successful tests"
                    value={evidence.hits.toLocaleString()}
                  />

                  <EvidenceStat
                    label="Historical accuracy"
                    value={
                      accuracy === null
                        ? '—'
                        : `${accuracy.toFixed(1)}%`
                    }
                  />

                  <EvidenceStat
                    label="Reference baseline"
                    value={percent(evidence.baseline)}
                  />

                  <EvidenceStat
                    label="95% lower bound"
                    value={percent(evidence.lowerBound)}
                  />

                  <EvidenceStat
                    label="Edge demonstrated"
                    value={
                      evidence.edgeDemonstrated
                        ? 'Yes'
                        : 'Not yet'
                    }
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  CHECK means the historical test met the model's
                  statistical threshold. WAIT means the evidence is
                  insufficient. The recommendation is a historical
                  estimate, not a guarantee of the next tick.
                  STALE means new ticks arrived after this snapshot;
                  wait for the next 6-second refresh.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* DEDICATED NEXT-DIGIT PREDICTOR */}
      <Card className="border-primary/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="size-5 text-primary" />
            AI Next-Digit Predictor
          </CardTitle>

          <CardDescription>
            Generate a fresh next-digit estimate using the selected
            market's actual Deriv tick history.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm text-muted-foreground">
                Selected market
              </div>
              <div className="text-lg font-bold">
                {market?.name ?? 'No market selected'}
                {' '}
                <span className="text-sm text-muted-foreground">
                  {market?.symbol}
                </span>
              </div>
            </div>

            <Button
              size="lg"
              onClick={runNextDigitPrediction}
              disabled={!running || feed.loading || feed.digits.length < 20}
              className="font-semibold"
            >
              <Brain className="size-4" />
              PREDICT NEXT DIGIT
            </Button>
          </div>

          {!running ? (
            <p className="text-sm text-muted-foreground">
              Start analysis first to receive live market ticks.
            </p>
          ) : feed.digits.length < 20 ? (
            <p className="text-sm text-muted-foreground">
              Collecting tick history. At least 20 valid digits are
              needed before prediction.
            </p>
          ) : currentManualPrediction ? (
            <>
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
                <div className="text-sm text-muted-foreground">
                  Highest-ranked next-digit candidate
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-5xl font-bold text-primary">
                    {currentManualPrediction.result.digit}
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-bold tabular">
                      {(
                        currentManualPrediction.result.confidence * 100
                      ).toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Model score
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-xs text-muted-foreground">
                  Calculated from {currentManualPrediction.tickCount.toLocaleString()}
                  {' '}live ticks collected for {currentManualPrediction.marketSymbol}.
                  New ticks may change the ranking.
                </p>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-semibold">
                  All ten digit estimates
                </div>

                {currentManualPrediction.result.ranked.map((digit, index) => {
                  const score =
                    currentManualPrediction.result.distribution[digit] * 100

                  return (
                    <div key={digit} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className="flex size-8 items-center justify-center rounded-md border font-bold">
                            {digit}
                          </span>
                          <span>
                            {index + 1}. Digit {digit}
                            {index === 0 ? ' · Highest' : ''}
                          </span>
                        </span>

                        <span className="font-semibold tabular">
                          {score.toFixed(1)}%
                        </span>
                      </div>

                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            index === 0 ? 'bg-primary' : 'bg-chart-2',
                          )}
                          style={{
                            width: `${Math.max(0, Math.min(100, score))}%`,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              <Badge variant="outline">
                Statistical estimate · Not a guaranteed result
              </Badge>
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Press PREDICT NEXT DIGIT to calculate a fresh estimate.
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            This button runs the existing statistical prediction engine
            on the selected market's ticks. It does not guarantee the
            next digit or a profitable trade.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="size-5 text-primary" />
            Live digit model accuracy
          </CardTitle>

          <CardDescription>
            Separate digit-model tracking. These figures are not
            the selected contract's historical test.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="text-xs text-muted-foreground">
            {sampleMessage}
          </div>

          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            <AccuracyStat
              label="Exact digit"
              value={rate(acc.digitHits)}
              baseline={10}
            />

            <AccuracyStat
              label="Top 3"
              value={rate(acc.top3Hits)}
              baseline={30}
            />

            <AccuracyStat
              label="Even/Odd"
              value={rate(acc.sideHits)}
              baseline={50}
            />

            <AccuracyStat
              label="Differs"
              value={rate(acc.differsHits)}
              baseline={90}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Accuracy is calculated from observed live ticks.
            A small sample is unreliable; results do not guarantee
            future outcomes or profit.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            Live Digit Prediction History
          </CardTitle>

          <CardDescription>
            Compares previous digit predictions with actual live ticks.
            This is digit-model history, not contract history.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {feed.predictionHistory.length > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <EvidenceStat
                  label="Tested"
                  value={feed.predictionHistory.length.toString()}
                />

                <EvidenceStat
                  label="Exact hits"
                  value={feed.predictionHistory.filter(
                    (item) => item.correct,
                  ).length.toString()}
                />

                <EvidenceStat
                  label="Top 3 hits"
                  value={feed.predictionHistory.filter(
                    (item) => item.top3Correct,
                  ).length.toString()}
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3">Time</th>
                      <th className="py-2 pr-3">Predicted</th>
                      <th className="py-2 pr-3">Actual</th>
                      <th className="py-2 pr-3">Estimate</th>
                      <th className="py-2">Result</th>
                    </tr>
                  </thead>

                  <tbody>
                    {feed.predictionHistory.map((item, index) => (
                      <tr
                        key={`${item.timestamp}-${index}`}
                        className="border-b last:border-0"
                      >
                        <td className="whitespace-nowrap py-2 pr-3 text-xs text-muted-foreground">
                          {new Date(
                            item.timestamp * 1000,
                          ).toLocaleTimeString()}
                        </td>

                        <td className="py-2 pr-3 font-bold tabular">
                          {item.predictedDigit}
                        </td>

                        <td className="py-2 pr-3 font-bold tabular">
                          {item.actualDigit}
                        </td>

                        <td className="py-2 pr-3 tabular">
                          {(item.confidence * 100).toFixed(1)}%
                        </td>

                        <td className="py-2">
                          <div className="flex flex-col gap-1">
                            <Badge
                              variant={
                                item.correct ? 'default' : 'destructive'
                              }
                            >
                              {item.correct ? 'Exact hit' : 'Miss'}
                            </Badge>

                            {item.top3Correct && !item.correct && (
                              <span className="text-xs text-muted-foreground">
                                Top 3 hit
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <Activity className="mx-auto mb-2 size-8 text-muted-foreground" />

              <p className="font-semibold">
                Waiting for prediction results
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                Start analysis and wait for new live ticks.
                History appears when a prediction can be compared
                with an actual tick.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="size-5 text-primary" />
            Supporting Digit Ranking
          </CardTitle>

          <CardDescription>
            Supporting analysis from the digit model.
            This ranking does not change your selected contract.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {prediction ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-primary/50 bg-primary/5 p-3">
                  <div className="text-xs text-muted-foreground">
                    Highest match estimate
                  </div>

                  <div className="text-3xl font-bold text-primary">
                    {prediction.ranked[0]}
                  </div>

                  <div className="text-sm">
                    {(prediction.distribution[prediction.ranked[0]] * 100).toFixed(1)}%
                    {' '}model score
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">
                    Lowest match estimate
                  </div>

                  <div className="text-3xl font-bold">
                    {prediction.ranked[9]}
                  </div>

                  <div className="text-sm">
                    {(100 - prediction.distribution[prediction.ranked[9]] * 100).toFixed(1)}%
                    {' '}complementary differs score
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {prediction.ranked.map((digit, index) => {
                  const score = prediction.distribution[digit] * 100

                  return (
                    <div key={digit} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className="flex size-7 items-center justify-center rounded-md border font-bold">
                            {digit}
                          </span>

                          <span>
                            #{index + 1}
                            {index === 0 ? ' · Highest estimate' : ''}
                            {index === 9 ? ' · Lowest estimate' : ''}
                          </span>
                        </span>

                        <span className="font-semibold tabular">
                          {score.toFixed(1)}%
                        </span>
                      </div>

                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            index === 0
                              ? 'bg-primary'
                              : index === 9
                                ? 'bg-destructive'
                                : 'bg-chart-2',
                          )}
                          style={{ width: `${Math.min(100, score)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              <p className="text-xs text-muted-foreground">
                Model scores are derived from past ticks, not verified
                probabilities. Synthetic market digits may remain
                unpredictable.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Start analysis and wait for at least 20 valid ticks
              to load the digit ranking.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Last digit distribution</CardTitle>

          <CardDescription>
            Share of each last digit over the last{' '}
            {stats.total.toLocaleString()} ticks. Green marks the
            most frequent digit; red marks the least frequent.
            Historical frequency does not guarantee the next digit.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <DigitDistribution
            pct={stats.pct}
            current={feed.lastDigitValue}
            hottest={stats.hottest}
            coldest={stats.coldest}
            predicted={prediction?.digit ?? null}
            total={stats.total}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Even / Odd</CardTitle>

            <CardDescription>
              {stats.evenOddStreak
                ? `${stats.evenOddStreak.length}× ${stats.evenOddStreak.kind} in a row`
                : 'No streak yet'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <SplitBar
              left={stats.even}
              right={stats.odd}
              leftLabel="Even"
              rightLabel="Odd"
              leftClass="bg-chart-2"
              rightClass="bg-chart-4"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rise / Fall</CardTitle>

            <CardDescription>
              {stats.riseFallStreak
                ? `${stats.riseFallStreak.length}× ${stats.riseFallStreak.kind} in a row`
                : 'No streak yet'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <SplitBar
              left={stats.rise}
              right={stats.fall}
              leftLabel="Rise"
              rightLabel="Fall"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Recent digit stream
          </CardTitle>

          <CardDescription>
            Newest on the right. Numbers below show ticks since
            each digit last appeared.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {recentDigits.map((d, i) => (
              <span
                key={`${feed.digits.length - recentDigits.length + i}`}
                className={cn(
                  'tabular flex size-8 items-center justify-center rounded-md text-sm font-semibold',
                  d % 2 === 0
                    ? 'bg-chart-2/20 text-chart-2'
                    : 'bg-chart-4/20 text-chart-4',
                  i === recentDigits.length - 1 && 'ring-2 ring-primary',
                )}
              >
                {d}
              </span>
            ))}

            {!feed.digits.length && (
              <span className="text-sm text-muted-foreground">
                No ticks yet.
              </span>
            )}
          </div>

          {stats.total > 0 && (
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
              {stats.gaps.map((g, d) => (
                <div
                  key={d}
                  className="rounded-md border px-2 py-1.5 text-center"
                >
                  <div className="text-xs text-muted-foreground">
                    Digit {d}
                  </div>

                  <div
                    className={cn(
                      'tabular text-sm font-semibold',
                      g >= 20 && 'text-warn',
                    )}
                  >
                    {g} ago
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function EvidenceStat({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground">
        {label}
      </div>

      <div className="tabular font-semibold">
        {value}
      </div>
    </div>
  )
}

function AccuracyStat({
  label,
  value,
  baseline,
}: {
  label: string
  value: number | null
  baseline: number
}) {
  return (
    <div>
      <div
        className={cn(
          'tabular text-lg font-bold',
          value === null
            ? 'text-muted-foreground'
            : value >= baseline
              ? 'text-up'
              : 'text-down',
        )}
      >
        {value === null ? '—' : `${value.toFixed(0)}%`}
      </div>

      <div className="text-[11px] text-muted-foreground">
        {label}{' '}
        <span className="opacity-70">
          (reference {baseline}%)
        </span>
      </div>
    </div>
  )
}
