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
import { predictNextDigit, type DigitPrediction } from '@/lib/analysis'
import {
  FALLBACK_MARKETS,
  marketsFromActiveSymbols,
  type Market,
} from '@/lib/markets'

/** Opens a socket while `enabled` and reconnects automatically. */
export function useDerivConnection(settings: DerivSettings, enabled: boolean) {
  const [client, setClient] = useState<DerivClient | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [error, setError] = useState<DerivError | null>(null)

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
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
  }, [settings.appId, settings.endpoint, enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  return { client, status, error }
}

export function useSyntheticMarkets(
  client: DerivClient | null,
  status: ConnectionStatus,
) {
  const [markets, setMarkets] = useState<Market[]>(FALLBACK_MARKETS)
  const loaded = useRef(false)

  useEffect(() => {
    if (!client || status !== 'open' || loaded.current) return
    client
      .request<
        DerivMessage & {
          active_symbols: Parameters<typeof marketsFromActiveSymbols>[0]
        }
      >({
        active_symbols: 'brief',
      })
      .then((res) => {
        const list = marketsFromActiveSymbols(res.active_symbols)
        if (list.length) {
          loaded.current = true
          setMarkets(list)
        }
      })
      .catch(() => {
        // keep the fallback list
      })
  }, [client, status])

  return markets
}

export interface Accuracy {
  predictions: number
  digitHits: number
  top3Hits: number
  sideHits: number // even/odd side called correctly
  differsHits: number // least likely digit did not appear
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
  tickCount: number // live ticks received since start (excludes history)
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
accuracy: emptyAccuracy,
    
    error: null,
    loading: false,
  }
}

/**
 * Loads `count` ticks of history for one market, then keeps the window
 * rolling with the live tick stream while `running` is true.
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

  // Switching market or window clears the previous market's numbers.
  useEffect(() => {
    setFeed(emptyFeed(market?.pipSize ?? 2))
  }, [market?.symbol, count]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!client || status !== 'open' || !running || !market) return
    let state: FeedState = { ...emptyFeed(market.pipSize), loading: true }
    setFeed(state)

    const stop = client.subscribe(
      { ticks_history: market.symbol, count, end: 'latest', style: 'ticks' },
      (msg) => {
        if (msg.error) {
          state = { ...state, error: msg.error, loading: false }
          setFeed(state)
          return
        }
        if (msg.msg_type === 'history') {
          const history = msg.history as HistoryPayload
          const pip = (msg.pip_size as number | undefined) ?? market.pipSize
          const digits = history.prices.map((p) => lastDigit(p, pip))
          state = {
            ...state,
            quotes: history.prices,
            epochs: history.times,
            digits,
            pipSize: pip,
            lastDigitValue: digits[digits.length - 1] ?? null,
            prediction: predictNextDigit(digits),
            loading: false,
          }
          setFeed(state)
          return
        }
        if (msg.msg_type === 'tick') {
          const tick = msg.tick as TickPayload
          const pip = tick.pip_size ?? state.pipSize
          const digit = lastDigit(tick.quote, pip)
          
const prev = state.prediction

const accuracy = prev
  ? {
      predictions: state.accuracy.predictions + 1,
      digitHits:
        state.accuracy.digitHits + (prev.digit === digit ? 1 : 0),
      top3Hits:
        state.accuracy.top3Hits +
        (prev.ranked.slice(0, 3).includes(digit) ? 1 : 0),
      sideHits:
        state.accuracy.sideHits + (sideOf(prev) === digit % 2 ? 1 : 0),
      differsHits:
        state.accuracy.differsHits + (prev.ranked[9] !== digit ? 1 : 0),
    }
  : state.accuracy

const predictionHistory = prev
  ? [
      {
        predictedDigit: prev.digit,
        actualDigit: digit,
        confidence: prev.confidence,
        timestamp: tick.epoch,
        correct: prev.digit === digit,
        top3Correct: prev.ranked.slice(0, 3).includes(digit),
      },
      ...state.predictionHistory,
    ].slice(0, 20)
  : state.predictionHistory

          
            ? {
                predictions: state.accuracy.predictions + 1,
                digitHits:
                  state.accuracy.digitHits + (prev.digit === digit ? 1 : 0),
                top3Hits:
                  state.accuracy.top3Hits +
                  (prev.ranked.slice(0, 3).includes(digit) ? 1 : 0),
                sideHits:
                  state.accuracy.sideHits +
                  (sideOf(prev) === digit % 2 ? 1 : 0),
                differsHits:
                  state.accuracy.differsHits +
                  (prev.ranked[9] !== digit ? 1 : 0),
              }
            : state.accuracy
          const digits = [...state.digits, digit].slice(-count)
          
state = {
  ...state,
  quotes: [...state.quotes, tick.quote].slice(-count),
  epochs: [...state.epochs, tick.epoch].slice(-count),
  digits,
  pipSize: pip,
  tickCount: state.tickCount + 1,
  lastDigitValue: digit,
  prediction: predictNextDigit(digits),
  predictionHistory,
  accuracy,
}

            
            
            
            
            
            
            
        
            
            
          
          setFeed(state)
        }
      },
    )
    return stop
  }, [client, status, running, market?.symbol, count]) // eslint-disable-line react-hooks/exhaustive-deps

  return feed
}

/** 0 = even side predicted, 1 = odd side predicted. */
function sideOf(p: DigitPrediction) {
  const even = p.distribution.reduce(
    (acc, v, d) => (d % 2 === 0 ? acc + v : acc),
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

/** Streams every given market at once; re-renders at most once per second. */
export function useMarketScanner(
  client: DerivClient | null,
  status: ConnectionStatus,
  markets: Market[],
  count: number,
  running: boolean,
) {
  const [entries, setEntries] = useState<Record<string, ScanEntry>>({})
  const symbolsKey = markets.map((m) => m.symbol).join(',')

  useEffect(() => {
    if (!client || status !== 'open' || !running) return
    const store: Record<string, ScanEntry> = {}
    let dirty = false
    const stops = markets.map((market) =>
      client.subscribe(
        { ticks_history: market.symbol, count, end: 'latest', style: 'ticks' },
        (msg) => {
          if (msg.error) {
            store[market.symbol] = {
              quotes: [],
              digits: [],
              pipSize: market.pipSize,
              updatedAt: Date.now(),
              error: msg.error.message,
            }
          } else if (msg.msg_type === 'history') {
            const history = msg.history as HistoryPayload
            const pip = (msg.pip_size as number | undefined) ?? market.pipSize
            store[market.symbol] = {
              quotes: history.prices,
              digits: history.prices.map((p) => lastDigit(p, pip)),
              pipSize: pip,
              updatedAt: Date.now(),
            }
          } else if (msg.msg_type === 'tick') {
            const tick = msg.tick as TickPayload
            const entry = store[market.symbol]
            if (!entry) return
            const pip = tick.pip_size ?? entry.pipSize
            entry.quotes = [...entry.quotes, tick.quote].slice(-count)
            entry.digits = [...entry.digits, lastDigit(tick.quote, pip)].slice(
              -count,
            )
            entry.pipSize = pip
            entry.updatedAt = Date.now()
          } else return
          dirty = true
        },
      ),
    )
    const timer = setInterval(() => {
      if (!dirty) return
      dirty = false
      setEntries({ ...store })
    }, 1000)
    return () => {
      clearInterval(timer)
      stops.forEach((s) => s())
    }
  }, [client, status, running, symbolsKey, count]) // eslint-disable-line react-hooks/exhaustive-deps

  return entries
}
