
import { useEffect, useRef, useState } from 'react'

import {
  DerivClient,
  lastDigit,
  type ConnectionStatus,
  type DerivError,
  type DerivMessage,
  type DerivSettings,
  type HistoryPayload,
  type TickPayload,
} from '@/lib/deriv'

import {
  predictNextDigit as estimateNextDigit,
  type DigitPrediction,
} from '@/lib/analysis'

import {
  FALLBACK_MARKETS,
  marketsFromActiveSymbols,
  type Market,
} from '@/lib/markets'

import {
  saveTick,
  saveTicks,
} from '@/lib/tick-storage'

/**
 * Opens a Deriv socket while enabled.
 * Automatically disconnects when disabled or unmounted.
 */
export function useDerivConnection(
  settings: DerivSettings,
  enabled: boolean,
) {
  const [client, setClient] = useState<DerivClient | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [error, setError] = useState<DerivError | null>(null)

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      setClient(null)
      return
    }

    const c = new DerivClient(settings)

    const offStatus = c.onStatus((s) => {
      setStatus(s)
      if (s === 'open') setError(null)
    })

    const offError = c.onError(setError)

    c.connect()
    setClient(c)

    return () => {
      offStatus()
      offError()
      c.disconnect()
      setClient(null)
    }
  }, [settings.appId, settings.endpoint, enabled])

  return { client, status, error }
}

/**
 * Loads available synthetic markets from Deriv.
 * Uses fallback markets if the request fails.
 */
export function useSyntheticMarkets(
  client: DerivClient | null,
  status: ConnectionStatus,
) {
  const [markets, setMarkets] = useState<Market[]>(FALLBACK_MARKETS)
  const loaded = useRef(false)

  useEffect(() => {
    if (!client || status !== 'open' || loaded.current) return

    let active = true

    client
      .request<
        DerivMessage & {
          active_symbols: Parameters<
            typeof marketsFromActiveSymbols
          >[0]
        }
      >({
        active_symbols: 'brief',
      })
      .then((res) => {
        if (!active) return

        const list = marketsFromActiveSymbols(res.active_symbols)

        if (list.length) {
          loaded.current = true
          setMarkets(list)
        }
      })
      .catch(() => {
        // Keep the fallback list.
      })

    return () => {
      active = false
    }
  }, [client, status])

  return markets
}

export interface Accuracy {
  predictions: number
  digitHits: number
  top3Hits: number
  sideHits: number
  differsHits: number
}

export interface PredictionRecord {
  predictedDigit: number
  actualDigit: number
  confidence: number
  timestamp: number
  correct: boolean
  top3Correct: boolean
}

export interface FeedState {
  quotes: number[]
  digits: number[]
  epochs: number[]
  pipSize: number
  tickCount: number
  lastDigitValue: number | null
  prediction: DigitPrediction | null
  predictionHistory: PredictionRecord[]
  accuracy: Accuracy
  error: DerivError | null
  loading: boolean
}

const emptyAccuracy: Accuracy = {
  predictions: 0,
  digitHits: 0,
  top3Hits: 0,
  sideHits: 0,
  differsHits: 0,
}

function emptyFeed(pipSize: number): FeedState {
  return {
    quotes: [],
    digits: [],
    epochs: [],
    pipSize,
    tickCount: 0,
    lastDigitValue: null,
    prediction: null,
    predictionHistory: [],
    accuracy: { ...emptyAccuracy },
    error: null,
    loading: false,
  }
}

/**
 * Loads historical ticks and follows the selected
 * market's live tick stream.
 *
 * No trades are placed by this hook.
 */
export function useTickFeed(
  client: DerivClient | null,
  status: ConnectionStatus,
  market: Market | undefined,
  count: number,
  running: boolean,
) {
  const [feed, setFeed] = useState<FeedState>(() =>
    emptyFeed(market?.pipSize ?? 2),
  )

  useEffect(() => {
    setFeed(emptyFeed(market?.pipSize ?? 2))
  }, [market?.symbol, count])

  useEffect(() => {
    if (!client || status !== 'open' || !running || !market) return

    let active = true

    let state: FeedState = {
      ...emptyFeed(market.pipSize),
      loading: true,
    }

    setFeed(state)

    const stop = client.subscribe(
      {
        ticks_history: market.symbol,
        count,
        end: 'latest',
        style: 'ticks',
      },
      (msg) => {
        if (!active) return

        if (msg.error) {
          state = {
            ...state,
            error: msg.error,
            loading: false,
          }

          setFeed(state)
          return
        }

        if (msg.msg_type === 'history') {
          const history = msg.history as HistoryPayload

          const pip =
            (msg.pip_size as number | undefined) ??
            market.pipSize

          const digits = history.prices.map((price) =>
            lastDigit(price, pip),
          )

          state = {
            ...state,
            quotes: history.prices,
            epochs: history.times,
            digits,
            pipSize: pip,
            lastDigitValue: digits[digits.length - 1] ?? null,
            prediction: estimateNextDigit(digits),
            loading: false,
          }

          setFeed(state)
          return
        }

        if (msg.msg_type === 'tick') {
          const tick = msg.tick as TickPayload
          const pip = tick.pip_size ?? state.pipSize
          const digit = lastDigit(tick.quote, pip)
          const previousPrediction = state.prediction

          const accuracy: Accuracy = previousPrediction
            ? {
                predictions: state.accuracy.predictions + 1,

                digitHits:
                  state.accuracy.digitHits +
                  (previousPrediction.digit === digit ? 1 : 0),

                top3Hits:
                  state.accuracy.top3Hits +
                  (
                    previousPrediction.ranked
                      .slice(0, 3)
                      .includes(digit) ? 1 : 0
                  ),

                sideHits:
                  state.accuracy.sideHits +
                  (sideOf(previousPrediction) === digit % 2 ? 1 : 0),

                differsHits:
                  state.accuracy.differsHits +
                  (previousPrediction.ranked[9] !== digit ? 1 : 0),
              }
            : state.accuracy

          const predictionHistory: PredictionRecord[] =
            previousPrediction
              ? [
                  {
                    predictedDigit: previousPrediction.digit,
                    actualDigit: digit,
                    confidence: previousPrediction.confidence,
                    timestamp: tick.epoch,
                    correct: previousPrediction.digit === digit,
                    top3Correct: previousPrediction.ranked
                      .slice(0, 3)
                      .includes(digit),
                  },
                  ...state.predictionHistory,
                ].slice(0, 20)
              : state.predictionHistory

          const digits = [...state.digits, digit].slice(-count)

          state = {
            ...state,
            quotes: [...state.quotes, tick.quote].slice(-count),
            epochs: [...state.epochs, tick.epoch].slice(-count),
            digits,
            pipSize: pip,
            tickCount: state.tickCount + 1,
            lastDigitValue: digit,
            prediction: estimateNextDigit(digits),
            predictionHistory,
            accuracy,
          }

          setFeed(state)
        }
      },
    )

    return () => {
      active = false
      stop()
    }
  }, [
    client,
    status,
    running,
    market?.symbol,
    count,
  ])

  return feed
}

/** Returns 0 for even and 1 for odd. */
function sideOf(prediction: DigitPrediction): number {
  const even = prediction.distribution.reduce(
    (acc, value, digit) =>
      digit % 2 === 0 ? acc + value : acc,
    0,
  )

  return even >= 0.5 ? 0 : 1
}

export interface ScanEntry {
  quotes: number[]
  digits: number[]
  pipSize: number
  updatedAt: number
  error?: string
}

/**
 * Streams selected markets and automatically saves
 * their historical and live ticks into IndexedDB.
 */
export function useMarketScanner(
  client: DerivClient | null,
  status: ConnectionStatus,
  markets: Market[],
  count: number,
  running: boolean,
) {
  const [entries, setEntries] = useState<
    Record<string, ScanEntry>
  >({})

  const symbolsKey = markets
    .map((market) => market.symbol)
    .join(',')

  useEffect(() => {
    if (!client || status !== 'open' || !running) return

    let active = true

    const store: Record<string, ScanEntry> = {}
    let dirty = false

    const stops = markets.map((market) =>
      client.subscribe(
        {
          ticks_history: market.symbol,
          count,
          end: 'latest',
          style: 'ticks',
        },
        (msg) => {
          if (!active) return

          if (msg.error) {
            store[market.symbol] = {
              quotes: [],
              digits: [],
              pipSize: market.pipSize,
              updatedAt: Date.now(),
              error: msg.error.message,
            }

            dirty = true
            return
          }

          if (msg.msg_type === 'history') {
            const history = msg.history as HistoryPayload

            const pip =
              (msg.pip_size as number | undefined) ??
              market.pipSize

            const digits = history.prices.map((price) =>
              lastDigit(price, pip),
            )

            store[market.symbol] = {
              quotes: history.prices,
              digits,
              pipSize: pip,
              updatedAt: Date.now(),
            }

            // Save the historical ticks for this market.
            const historicalTicks = history.prices.map(
              (quote, index) => ({
                quote,
                digit: digits[index],
                epoch: history.times[index],
              }),
            )

            void saveTicks(
              market.symbol,
              historicalTicks,
            ).catch((error) => {
              console.error(
                `TickLens history storage error (${market.symbol}):`,
                error,
              )
            })

            dirty = true
            return
          }

          if (msg.msg_type === 'tick') {
            const tick = msg.tick as TickPayload
            const entry = store[market.symbol]

            if (!entry) return

            const pip = tick.pip_size ?? entry.pipSize
            const digit = lastDigit(tick.quote, pip)

            entry.quotes = [
              ...entry.quotes,
              tick.quote,
            ].slice(-count)

            entry.digits = [
              ...entry.digits,
              digit,
            ].slice(-count)

            entry.pipSize = pip
            entry.updatedAt = Date.now()

            // Save the incoming live tick.
            void saveTick(market.symbol, {
              quote: tick.quote,
              digit,
              epoch: tick.epoch,
            }).catch((error) => {
              console.error(
                `TickLens live storage error (${market.symbol}):`,
                error,
              )
            })

            dirty = true
          }
        },
      ),
    )

    // Update the visible scanner once per second.
    const timer = setInterval(() => {
      if (!active || !dirty) return

      dirty = false
      setEntries({ ...store })
    }, 1000)

    return () => {
      active = false
      clearInterval(timer)
      stops.forEach((stop) => stop())
    }
  }, [
    client,
    status,
    running,
    symbolsKey,
    count,
  ])

  return entries
}
