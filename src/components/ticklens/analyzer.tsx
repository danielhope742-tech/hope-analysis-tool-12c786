
import { useMemo, useState } from 'react'
import {
  Activity,
  Brain,
  Crosshair,
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
  matchesDiffers,
  outcomeOdds,
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
}

export function Analyzer({
  markets,
  market,
  onMarketChange,
  windowSize,
  onWindowSizeChange,
  barrier,
  onBarrierChange,
  running,
  onToggle,
  connected,
  feed,
}: AnalyzerProps) {
  const stats = useMemo(
    () => analyzeWindow(feed.digits, feed.quotes, barrier),
    [feed.digits, feed.quotes, barrier],
  )

  const prediction = feed.prediction
  const odds = prediction ? outcomeOdds(prediction, barrier) : null

  const md = useMemo(
    () => matchesDiffers(feed.digits, prediction),
    [feed.digits, prediction],
  )

  // Null follows the suggested Differs digit automatically.
  const [mdPick, setMdPick] = useState<number | null>(null)

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

  return (
    <section
      className="space-y-4"
      aria-labelledby="analyzer-title"
    >
      {/* Controls */}
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

              <SelectContent
                position="popper"
                className="max-h-80"
              >
                {groups.map(([group, list]) => (
                  <SelectGroup key={group}>
                    <SelectLabel>{group}</SelectLabel>

                    {list.map((m) => (
                      <SelectItem
                        key={m.symbol}
                        value={m.symbol}
                      >
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
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

          <div className="space-y-1.5">
            <Label htmlFor="barrier">
              Over/Under barrier
            </Label>

            <Select
              value={String(barrier)}
              onValueChange={(v) => onBarrierChange(Number(v))}
            >
              <SelectTrigger id="barrier" className="w-24">
                <SelectValue />
              </SelectTrigger>

              <SelectContent position="popper">
                {Array.from({ length: 10 }, (_, d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d}
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

      {/* Connection errors */}
      {feed.error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm">
          <span className="font-semibold">
            Deriv returned an error:
          </span>{' '}
          {feed.error.message}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Live price and chart */}
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

        {/* Experimental prediction */}
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-primary/15 blur-3xl" />

          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="size-5 text-primary" />
              Next digit prediction
            </CardTitle>

            <CardDescription>
              Experimental estimate using digit frequency,
              recent observations and transitions.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {prediction ? (
              <>
                <div className="flex items-center gap-5">
                  <div className="tabular flex size-24 shrink-0 items-center justify-center rounded-2xl border-2 border-primary bg-primary/10 text-6xl font-bold text-primary">
                    {prediction.digit}
                  </div>

                  <div className="space-y-1">
                    <div className="tabular text-3xl font-bold">
                      {(prediction.confidence * 100).toFixed(1)}%
                    </div>

                    <div className="text-xs text-muted-foreground">
                      Experimental model estimate · not verified probability
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {prediction.ranked
                        .slice(1, 4)
                        .map((d) => (
                          <span
                            key={d}
                            className="tabular rounded-md bg-muted px-2 py-0.5 text-xs"
                          >
                            {d} · {(prediction.distribution[d] * 100).toFixed(1)}%
                          </span>
                        ))}
                    </div>
                  </div>
                </div>

                {odds && (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <Odd
                      label="Even"
                      value={odds.even}
                      best={odds.even >= odds.odd}
                    />
                    <Odd
                      label="Odd"
                      value={odds.odd}
                      best={odds.odd > odds.even}
                    />
                    <Odd
                      label={`Over ${barrier}`}
                      value={odds.over}
                      best={odds.over >= odds.under}
                    />
                    <Odd
                      label={`Under ${barrier}`}
                      value={odds.under}
                      best={odds.under > odds.over}
                    />
                    <Odd
                      label={`Matches ${prediction.digit}`}
                      value={odds.matches}
                    />
                    <Odd
                      label={`Differs ${prediction.digit}`}
                      value={odds.differs}
                      best
                    />
                  </div>
                )}

                {/* Live forecast evaluation */}
                <div className="space-y-2 rounded-lg border bg-background/40 p-3">
                  <div className="text-xs text-muted-foreground">
                    {sampleMessage}
                  </div>

                  <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <Target className="size-3.5" />
                    Live accuracy · {acc.predictions} calls
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
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
                    A small sample is unreliable; results do not
                    guarantee future outcomes or profit.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                A prediction appears once at least 20 ticks have been loaded.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Matches / Differs */}
      <MatchesDiffersCard
        md={md}
        pick={mdPick}
        onPick={setMdPick}
        hasPrediction={!!prediction}
      />
      
      {/* Live Prediction History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            Live Prediction History
          </CardTitle>
          <CardDescription>
            Compare each previous predicted digit with the
            next actual live tick. Newest results appear first.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {feed.predictionHistory.length > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">
                    Tested
                  </div>
                  <div className="text-2xl font-bold tabular">
                    {feed.predictionHistory.length}
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">
                    Exact hits
                  </div>
                  <div className="text-2xl font-bold tabular">
                    {feed.predictionHistory.filter(
                      (item) => item.correct,
                    ).length}
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">
                    Top 3 hits
                  </div>
                  <div className="text-2xl font-bold tabular">
                    {feed.predictionHistory.filter(
                      (item) => item.top3Correct,
                    ).length}
                  </div>
                </div>
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
                                item.correct
                                  ? "default"
                                  : "destructive"
                              }
                            >
                              {item.correct ? "Exact hit" : "Miss"}
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

              <p className="text-xs text-muted-foreground">
                This panel shows the recorded prediction history,
                not a guarantee of future results. The estimate is
                a model score, not a verified probability.
              </p>
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <Activity className="mx-auto mb-2 size-8 text-muted-foreground" />
              <p className="font-semibold">
                Waiting for prediction results
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Start analysis and wait for new live ticks.
                History appears when a previous prediction can
                be compared with an actual tick.
              </p>
            </div>
          )}
        </CardContent>
      </Card>


      {/* TickLens AI Digit Ranking Scanner */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="size-5 text-primary" />
            AI Digit Ranking Scanner
          </CardTitle>
          <CardDescription>
            All digits ranked by experimental model estimates.
            Higher rank does not guarantee the next result.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {prediction ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-primary/50 bg-primary/5 p-3">
                  <div className="text-xs text-muted-foreground">
                    Match candidate
                  </div>
                  <div className="text-3xl font-bold text-primary">
                    {md?.bestMatches ?? prediction.ranked[0]}
                  </div>
                  <div className="text-sm">
                    {(
                      prediction.distribution[
                        md?.bestMatches ?? prediction.ranked[0]
                      ] * 100
                    ).toFixed(1)}% estimated match score
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">
                    Differ candidate
                  </div>
                  <div className="text-3xl font-bold">
                    {md?.bestDiffers ?? prediction.ranked[9]}
                  </div>
                  <div className="text-sm">
                    {(
                      100 -
                      prediction.distribution[
                        md?.bestDiffers ?? prediction.ranked[9]
                      ] * 100
                    ).toFixed(1)}% estimated differs score
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {prediction.ranked.map((digit, index) => {
                  const score =
                    prediction.distribution[digit] * 100

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
                These are model scores derived from past ticks, not
                verified probabilities. Synthetic market digits may
                remain unpredictable. Use this scanner for analysis,
                not as a guarantee of profit.
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

      {/* Digit distribution */}
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

      {/* Market summaries */}
      <div className="grid gap-4 md:grid-cols-3">
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
            <CardTitle className="text-base">
              Over / Under {barrier}
            </CardTitle>
            <CardDescription className="tabular">
              Equal to {barrier}: {stats.equalBarrier.toFixed(1)}%
            </CardDescription>
          </CardHeader>

          <CardContent>
            <SplitBar
              left={stats.over}
              right={stats.under}
              leftLabel={`Over ${barrier}`}
              rightLabel={`Under ${barrier}`}
              leftClass="bg-chart-1"
              rightClass="bg-chart-3"
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

      {/* Recent digit stream */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Recent digit stream
          </CardTitle>
          <CardDescription>
            Newest on the right. The numbers below show ticks since
            each digit last appeared.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {feed.digits.slice(-48).map((d, i, arr) => (
              <span
                key={`${feed.digits.length - arr.length + i}`}
                className={cn(
                  'tabular flex size-8 items-center justify-center rounded-md text-sm font-semibold',
                  d % 2 === 0
                    ? 'bg-chart-2/20 text-chart-2'
                    : 'bg-chart-4/20 text-chart-4',
                  i === arr.length - 1 && 'ring-2 ring-primary',
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

function Odd({
  label,
  value,
  best,
}: {
  label: string
  value: number
  best?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-md border px-3 py-2',
        best && 'border-primary/50 bg-primary/5',
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'tabular font-semibold',
          best && 'text-primary',
        )}
      >
        {value.toFixed(1)}%
      </span>
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

function MatchesDiffersCard({
  md,
  pick,
  onPick,
  hasPrediction,
}: {
  md: ReturnType<typeof matchesDiffers>
  pick: number | null
  onPick: (d: number | null) => void
  hasPrediction: boolean
}) {
  const target = pick ?? md?.bestDiffers ?? 0
  const row = md?.rows[target]

  const matchP = row
    ? hasPrediction
      ? row.next
      : row.matches
    : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Crosshair className="size-5 text-primary" />
          Matches / Differs
        </CardTitle>

        <CardDescription>
          Matches wins if the next last digit equals your chosen digit;
          Differs wins if it is any other digit. Auto follows the
          model's lowest estimated match score. Estimates are not
          verified probabilities.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Matches/Differs digit"
        >
          <Button
            size="sm"
            variant={pick === null ? 'secondary' : 'ghost'}
            aria-pressed={pick === null}
            onClick={() => onPick(null)}
          >
            Auto
          </Button>

          {Array.from({ length: 10 }, (_, d) => (
            <Button
              key={d}
              size="icon-sm"
              variant={target === d ? 'default' : 'outline'}
              aria-pressed={pick === d}
              aria-label={`Digit ${d}`}
              className="tabular font-semibold"
              onClick={() => onPick(d)}
            >
              {d}
            </Button>
          ))}
        </div>

        {md && row ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-3 md:col-span-2">
                <SplitBar
                  left={matchP}
                  right={100 - matchP}
                  leftLabel={`Matches ${target}`}
                  rightLabel={`Differs ${target}`}
                  leftClass="bg-chart-1"
                  rightClass="bg-chart-3"
                />

                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <MdStat
                    label="In history"
                    value={`${row.matches.toFixed(1)}%`}
                  />
                  <MdStat
                    label="Last 50 ticks"
                    value={`${row.recent.toFixed(1)}%`}
                  />
                  <MdStat
                    label="Model estimate"
                    value={hasPrediction ? `${row.next.toFixed(1)}%` : '—'}
                  />
                  <MdStat
                    label="Last seen"
                    value={`${row.gap} ticks ago`}
                    warn={row.gap >= 20}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-1">
                <button
                  type="button"
                  onClick={() => onPick(md.bestDiffers)}
                  className="rounded-lg border border-primary/50 bg-primary/5 px-3 py-2 text-left transition-colors hover:bg-primary/10 motion-reduce:transition-none"
                >
                  <div className="text-xs text-muted-foreground">
                    Lowest model match score
                  </div>
                  <div className="tabular text-xl font-bold text-primary">
                    {md.bestDiffers}{' '}
                    <span className="text-sm font-semibold">
                      {(100 - (
                        hasPrediction
                          ? md.rows[md.bestDiffers].next
                          : md.rows[md.bestDiffers].matches
                      )).toFixed(1)}%
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onPick(md.bestMatches)}
                  className="rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted motion-reduce:transition-none"
                >
                  <div className="text-xs text-muted-foreground">
                    Highest model match score
                  </div>
                  <div className="tabular text-xl font-bold">
                    {md.bestMatches}{' '}
                    <span className="text-sm font-semibold">
                      {(hasPrediction
                        ? md.rows[md.bestMatches].next
                        : md.rows[md.bestMatches].matches
                      ).toFixed(1)}%
                    </span>
                  </div>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
              {md.rows.map((r) => {
                const p = hasPrediction ? r.next : r.matches

                return (
                  <button
                    key={r.digit}
                    type="button"
                    onClick={() => onPick(r.digit)}
                    aria-label={`Digit ${r.digit}: model match estimate ${p.toFixed(1)}%, differs complement ${(100 - p).toFixed(1)}%`}
                    className={cn(
                      'rounded-md border px-1 py-1.5 text-center transition-colors hover:bg-muted motion-reduce:transition-none',
                      r.digit === target && 'border-primary bg-primary/10',
                    )}
                  >
                    <div className="tabular text-sm font-bold">
                      {r.digit}
                    </div>
                    <div className="tabular text-[11px] text-chart-1">
                      M {p.toFixed(1)}
                    </div>
                    <div className="tabular text-[11px] text-chart-3">
                      D {(100 - p).toFixed(1)}
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Start analysis to see historical frequencies and experimental
            Matches/Differs estimates for each digit.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function MdStat({
  label,
  value,
  warn,
}: {
  label: string
  value: string
  warn?: boolean
}) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'tabular font-semibold',
          warn && 'text-warn',
        )}
      >
        {value}
      </div>
    </div>
  )
}
