
import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'

import { Analyzer, WINDOW_SIZES } from '@/components/ticklens/analyzer'
import { Scanner } from '@/components/ticklens/scanner'
import { SettingsDialog, useSettings } from '@/components/ticklens/settings'

import {
  useDerivConnection,
  useMarketScanner,
  useSyntheticMarkets,
  useTickFeed,
} from '@/hooks/use-deriv'

import type { ConnectionStatus } from '@/lib/deriv'

import {
  FALLBACK_MARKETS,
  TRACKED_MARKET_SYMBOLS,
} from '@/lib/markets'

import { cn } from '@/lib/utils'

export const Route = createFileRoute('/')({
  component: Home,
})

const SCANNER_WINDOW = 500

function Home() {
  const { settings, save, ready } = useSettings()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [symbol, setSymbol] = useState('R_100')
  const [windowSize, setWindowSize] = useState(WINDOW_SIZES[3])
  const [barrier, setBarrier] = useState(4)
  const [running, setRunning] = useState(false)
  const [scanning, setScanning] = useState(false)

  // Main connection for individual market analysis.
  const main = useDerivConnection(settings, ready)

  // Separate connection for the 10-market scanner.
  const scan = useDerivConnection(
    settings,
    ready && scanning,
  )

  // Discover available synthetic markets.
  const discoveredMarkets = useSyntheticMarkets(
    main.client,
    main.status,
  )

  // Enforce exactly the 10 selected markets.
  // Preserve the agreed order and use fallback metadata
  // when a market is temporarily missing from active_symbols.
  const markets = useMemo(
    () =>
      TRACKED_MARKET_SYMBOLS.map((trackedSymbol) => {
        const discovered = discoveredMarkets.find(
          (market) => market.symbol === trackedSymbol,
        )

        const fallback = FALLBACK_MARKETS.find(
          (market) => market.symbol === trackedSymbol,
        )

        return discovered ?? fallback
      }).filter((market) => market !== undefined),
    [discoveredMarkets],
  )

  // Keep the selected market valid.
  const market =
    markets.find((item) => item.symbol === symbol) ??
    markets.find((item) => item.symbol === 'R_100') ??
    markets[0]

  const feed = useTickFeed(
    main.client,
    main.status,
    market,
    windowSize,
    running,
  )

  // The scanner receives only the 10 selected markets.
  const entries = useMarketScanner(
    scan.client,
    scan.status,
    markets,
    SCANNER_WINDOW,
    scanning,
  )

  const connectionError = main.error ?? scan.error

  useEffect(() => {
    if (!connectionError) return

    toast.error(connectionError.message, {
      id: connectionError.code,
      description:
        connectionError.code === 'InvalidAppID'
          ? 'Check the App ID in Connection settings.'
          : undefined,
      action: {
        label: 'Settings',
        onClick: () => setSettingsOpen(true),
      },
    })
  }, [connectionError])

  // Correct the selected symbol if it is unavailable.
  useEffect(() => {
    if (!markets.length) return

    if (!markets.some((item) => item.symbol === symbol)) {
      setSymbol(
        markets.find((item) => item.symbol === 'R_100')?.symbol ??
          markets[0].symbol,
      )
    }
  }, [markets, symbol])

  const analyze = (nextSymbol: string) => {
    setSymbol(nextSymbol)
    setRunning(true)

    setTimeout(() => {
      document
        .getElementById('analyzer')
        ?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
    }, 100)
  }

  return (
    <div className="grid-bg min-h-screen">
      {/* HEADER */}
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo />

            <div>
              <div className="font-display text-lg leading-none font-bold tracking-tight">
                TickLens
              </div>

              <div className="text-xs text-muted-foreground">
                Synthetic digit analyzer
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <StatusPill status={main.status} />

            <button
              type="button"
              onClick={() => {
                window.location.href =
                  'https://oauth.deriv.com/oauth2/authorize?app_id=34NM6oGFpDwmMKeg8t9fU'
              }}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Connect to Deriv
            </button>

            <SettingsDialog
              settings={settings}
              onSave={save}
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
            />
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="mx-auto max-w-7xl space-y-10 px-4 py-8">
        <section className="max-w-3xl space-y-2">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Every tick, every digit,{' '}
            <span className="text-primary">in real time.</span>
          </h1>

          <p className="text-muted-foreground">
            TickLens studies synthetic-market tick history,
            digit distributions, even/odd behaviour, rise/fall
            movement and statistical next-digit estimates.
          </p>
        </section>

        {/* SELECTED MARKETS */}
        <section className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                Selected training markets
              </h2>

              <p className="text-xs text-muted-foreground">
                100,000 target ticks per market
              </p>
            </div>

            <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm font-bold text-primary">
              {markets.length}/10 markets
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {markets.map((item) => (
              <button
                key={item.symbol}
                type="button"
                onClick={() => setSymbol(item.symbol)}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  symbol === item.symbol
                    ? 'border-primary bg-primary/10'
                    : 'bg-background hover:bg-muted',
                )}
              >
                <div className="text-sm font-semibold">
                  {item.symbol}
                </div>

                <div className="mt-1 text-xs text-muted-foreground">
                  {item.name}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ANALYZER */}
        <section id="analyzer" className="scroll-mt-20">
          <Analyzer
            markets={markets}
            market={market}
            onMarketChange={setSymbol}
            windowSize={windowSize}
            onWindowSizeChange={setWindowSize}
            barrier={barrier}
            onBarrierChange={setBarrier}
            running={running}
            onToggle={() => setRunning((value) => !value)}
            connected={main.status === 'open'}
            feed={feed}
          />
        </section>

        {/* TRAINING SCANNER */}
        <section>
          <Scanner
            markets={markets}
            entries={entries}
            barrier={barrier}
            running={scanning}
            onToggle={() => setScanning((value) => !value)}
            onAnalyze={analyze}
            activeSymbol={
              running ? market?.symbol : undefined
            }
            windowSize={SCANNER_WINDOW}
          />
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t">
        <div className="mx-auto max-w-7xl px-4 py-6 text-xs leading-relaxed text-muted-foreground">
          Synthetic indices are generated by a random number
          generator. Historical statistics and predictions are
          estimates, not guarantees of future results. TickLens
          provides analysis only and does not automatically
          place trades.
        </div>
      </footer>
    </div>
  )
}

function StatusPill({
  status,
}: {
  status: ConnectionStatus
}) {
  const label = {
    idle: 'Offline',
    connecting: 'Connecting',
    open: 'Live',
    closed: 'Reconnecting',
  }[status]

  return (
    <span
      className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
      aria-live="polite"
    >
      <span className="relative flex size-2">
        {status === 'open' && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-60" />
        )}

        <span
          className={cn(
            'relative inline-flex size-2 rounded-full',
            status === 'open'
              ? 'bg-up'
              : status === 'idle'
                ? 'bg-muted-foreground'
                : 'bg-warn',
          )}
        />
      </span>

      {label}
    </span>
  )
}

function Logo() {
  return (
    <svg
      viewBox="0 0 32 32"
      className="size-9"
      aria-hidden
    >
      <rect
        width="32"
        height="32"
        rx="9"
        fill="var(--primary)"
      />

      <path
        d="M6 20 L11 14 L15 18 L20 9 L26 15"
        fill="none"
        stroke="var(--primary-foreground)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <circle
        cx="26"
        cy="15"
        r="2.4"
        fill="var(--primary-foreground)"
      />
    </svg>
  )
}
