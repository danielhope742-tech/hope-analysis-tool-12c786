import { useEffect, useMemo, useState } from 'react'
import { Activity, Play, Square } from 'lucide-react'

import type { ScanEntry } from '@/hooks/use-deriv'
import {
  analyzeContractEvidenceAtDuration,
  type ContractType,
} from '@/lib/analysis'
import type { Market } from '@/lib/markets'
import {
  processSignalSnapshot,
  getSignalPerformance,
  getSignalRecords,
  type PerformanceStats,
  type SignalRecord,
} from '@/lib/signal-performance'

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

const CONTRACT_LABELS: Record<ContractType, string> = {
  matches: 'Matches',
  differs: 'Differs',
  even: 'Even',
  odd: 'Odd',
  over: 'Over',
  under: 'Under',
  rise: 'Rise',
  fall: 'Fall',
}

const EMPTY_PERFORMANCE: PerformanceStats = {
  total: 0,
  wins: 0,
  losses: 0,
  pending: 0,
  winRate: 0,
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
  const [performance, setPerformance] =
    useState<PerformanceStats>(EMPTY_PERFORMANCE)

  const [records, setRecords] = useState<SignalRecord[]>([])

  const rows = useMemo(() => {
    return markets.map((market) => {
      const entry = entries[market.symbol]

      const ready =
        !!entry &&
        !entry.error &&
        entry.digits.length >= 100 &&
        entry.quotes.length >= 100 &&
        !!entry.epochs &&
        entry.epochs.length >= 100

      const evidence = ready
        ? analyzeContractEvidenceAtDuration(
            contract,
            entry.digits,
            entry.quotes,
            entry.epochs!,
            barrier,
            10,
          )
        : null

      return { market, entry, evidence, ready }
    }).sort((a, b) => {
      const aScore =
        a.evidence?.lowerBound != null
          ? a.evidence.lowerBound - a.evidence.baseline
          : -Infinity

      const bScore =
        b.evidence?.lowerBound != null
          ? b.evidence.lowerBound - b.evidence.baseline
          : -Infinity

      return bScore - aScore
    })
  }, [markets, entries, contract, barrier])

  // Track CHECK signals and settle pending signals at expiry.
  useEffect(() => {
    let changed = false

    for (const row of rows) {
      const { market, entry, evidence } = row

      if (
        !entry ||
        !entry.epochs ||
        !evidence
      ) {
        continue
      }

      processSignalSnapshot({
        market: market.symbol,
        contract,
        selection: evidence.selection,
        signal: evidence.signal,
        probability: evidence.probability,
        baseline: evidence.baseline,
        lowerBound: evidence.lowerBound ?? 0,
        quotes: entry.quotes,
        digits: entry.digits,
        epochs: entry.epochs,
        barrier,
        durationSeconds: 10,
      })

      changed = true
    }

    if (changed) {
      setPerformance(getSignalPerformance())
      setRecords(getSignalRecords().slice(0, 8))
    }
  }, [rows, contract, barrier])

  useEffect(() => {
    setPerformance(getSignalPerformance())
    setRecords(getSignalRecords().slice(0, 8))
  }, [])

  const bestRow =
    rows.find(row => row.evidence?.signal === 'CHECK') ??
    rows[0]

  useEffect(() => {
    if (
      bestRow?.market.symbol &&
      bestRow.evidence?.signal === 'CHECK'
    ) {
      onBestMarketChange(bestRow.market.symbol)
    }
  }, [
    bestRow?.market.symbol,
    bestRow?.evidence?.signal,
    onBestMarketChange,
  ])

  const liveCount = rows.filter(
    row =>
      row.entry &&
      !row.entry.error &&
      Date.now() - row.entry.updatedAt < 15000,
  ).length

  return (
    <section className="space-y-4">

      {/* Scanner controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <Activity className="h-5 w-5" />
            10-second market scanner
          </div>

          <p className="text-sm text-muted-foreground">
            {liveCount} of {markets.length} markets reporting fresh ticks
          </p>

          <p className="text-xs text-muted-foreground">
            Contract: {CONTRACT_LABELS[contract]} ·
            Barrier: {barrier} ·
            Window: {windowSize} ticks
          </p>
        </div>

        <button
          type="button"
          onClick={onToggle}
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
        >
          {running ? (
            <>
              <Square className="h-4 w-4" />
              Stop scanner
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Start scanner
            </>
          )}
        </button>
      </div>

      {/* Performance summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          label="Settled signals"
          value={performance.total}
        />

        <Metric
          label="Wins"
          value={performance.wins}
        />

        <Metric
          label="Losses"
          value={performance.losses}
        />

        <Metric
          label="Win rate"
          value={`${performance.winRate.toFixed(1)}%`}
        />
      </div>

      {/* Market results */}
      <div className="rounded-xl border">

        <div className="border-b p-4">
          <h3 className="font-semibold">
            Market scan results
          </h3>

          <p className="text-sm text-muted-foreground">
            CHECK requires at least 100 historical,
            non-overlapping 10-second tests and a lower
            confidence bound above baseline.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-sm">

            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3">Market</th>
                <th className="p-3">Selection</th>
                <th className="p-3">Tests</th>
                <th className="p-3">Accuracy</th>
                <th className="p-3">Lower bound</th>
                <th className="p-3">Signal</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>

            <tbody>
              {rows.map(({ market, entry, evidence, ready }) => (
                <tr key={market.symbol} className="border-t">

                  <td className="p-3 font-medium">
                    {market.name}

                    {activeSymbol === market.symbol && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        Active
                      </span>
                    )}

                    {entry?.error && (
                      <div className="text-xs text-red-500">
                        {entry.error}
                      </div>
                    )}
                  </td>

                  <td className="p-3">
                    {evidence?.selection ?? '—'}
                  </td>

                  <td className="p-3">
                    {evidence?.tests ?? (ready ? '—' : 'Collecting')}
                  </td>

                  <td className="p-3">
                    {evidence?.accuracy == null
                      ? '—'
                      : `${evidence.accuracy.toFixed(1)}%`}
                  </td>

                  <td className="p-3">
                    {evidence?.lowerBound == null
                      ? '—'
                      : `${evidence.lowerBound.toFixed(1)}%`}
                  </td>

                  <td className="p-3">
                    <span
                      className={
                        evidence?.signal === 'CHECK'
                          ? 'rounded-md bg-green-500/10 px-2 py-1 font-semibold text-green-600'
                          : 'rounded-md bg-muted px-2 py-1'
                      }
                    >
                      {evidence?.signal ?? 'WAIT'}
                    </span>
                  </td>

                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => onAnalyze(market.symbol)}
                      className="rounded-md border px-3 py-1.5"
                    >
                      Analyse
                    </button>
                  </td>

                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="p-6 text-center text-muted-foreground"
                  >
                    No markets are available.
                  </td>
                </tr>
              )}
            </tbody>

          </table>
        </div>
      </div>

      {/* Recent performance */}
      <div className="rounded-xl border p-4">

        <h3 className="font-semibold">
          Recent signal results
        </h3>

        <p className="mb-3 text-sm text-muted-foreground">
          CHECK signals are tracked until the first available
          tick at or after 10 seconds. Results are saved
          on this device.
        </p>

        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tracked signals yet. Start the scanner and
            wait for a qualifying CHECK signal.
          </p>
        ) : (
          <div className="space-y-2">

            {records.map(record => (
              <div
                key={record.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm last:border-0"
              >

                <div>
                  <div className="font-medium">
                    {record.market} ·
                    {CONTRACT_LABELS[record.contract]}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {record.selection} ·
                    {record.durationSeconds}s expiry
                  </div>
                </div>

                <span className="rounded-md bg-muted px-2 py-1 font-medium">
                  {record.status}
                </span>

              </div>
            ))}

          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        These are historical statistical estimates, not
        guaranteed predictions. CHECK is for manual review,
        not an instruction to place a trade.
      </p>

    </section>
  )
}

function Metric({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-muted-foreground">
        {label}
      </div>

      <div className="mt-1 text-xl font-semibold tabular-nums">
        {value}
      </div>
    </div>
  )
}
