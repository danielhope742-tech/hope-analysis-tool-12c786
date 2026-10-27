// Minimal browser client for the Deriv WebSocket API (Options API public
// channel; the message format matches the legacy v3 API).
// One instance = one socket. Requests are matched to responses by req_id;
// streaming responses (ticks) keep arriving with the same req_id.

export const DEFAULT_APP_ID = '34o4SxPCuUD2SvZD5jrE6'
// New developers.deriv.com app IDs only work on this endpoint, not on the
// legacy wss://ws.derivws.com/websockets/v3 (which rejects them at handshake).
export const DEFAULT_ENDPOINT =
  'wss://api.derivws.com/trading/v1/options/ws/public'
export const LEGACY_ENDPOINT = 'wss://ws.derivws.com/websockets/v3'
export const PUBLIC_DEMO_APP_ID = '1089'

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed'

export interface DerivError {
  code: string
  message: string
}

// Loosely typed: the API returns many shapes and we only read a few fields.
export interface DerivMessage {
  msg_type: string
  req_id?: number
  error?: DerivError
  subscription?: { id: string }
  [key: string]: unknown
}

export interface TickPayload {
  symbol: string
  quote: number
  epoch: number
  pip_size: number
}

export interface HistoryPayload {
  prices: number[]
  times: number[]
}

type Handler = (msg: DerivMessage) => void

export interface DerivSettings {
  appId: string
  endpoint: string
}

export class DerivClient {
  private ws: WebSocket | null = null
  private nextReqId = 1
  private handlers = new Map<number, Handler>()
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private closedByUser = false
  private failedAttempts = 0
  private statusListeners = new Set<(s: ConnectionStatus) => void>()
  private errorListeners = new Set<(e: DerivError) => void>()
  status: ConnectionStatus = 'idle'

  constructor(private settings: DerivSettings) {}

  connect() {
    this.closedByUser = false
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return
    let ws: WebSocket
    try {
      const url = new URL(this.settings.endpoint)
      url.searchParams.set('app_id', this.settings.appId)
      ws = new WebSocket(url)
    } catch {
      this.setStatus('closed')
      this.errorListeners.forEach((l) =>
        l({
          code: 'InvalidEndpoint',
          message: 'The WebSocket endpoint is not a valid wss:// URL.',
        }),
      )
      return
    }
    this.setStatus('connecting')
    this.ws = ws

    ws.onopen = () => {
      this.failedAttempts = 0
      this.setStatus('open')
      this.pingTimer = setInterval(() => this.sendRaw({ ping: 1 }), 30_000)
    }
    ws.onmessage = (event) => {
      let msg: DerivMessage
      try {
        msg = JSON.parse(event.data as string) as DerivMessage
      } catch {
        return
      }
      if (
        msg.error &&
        (msg.req_id === undefined || !this.handlers.has(msg.req_id))
      ) {
        this.errorListeners.forEach((l) => l(msg.error!))
      }
      if (msg.req_id !== undefined) this.handlers.get(msg.req_id)?.(msg)
    }
    ws.onclose = () => {
      const neverOpened = this.status === 'connecting'
      this.cleanupSocket()
      this.setStatus('closed')
      if (this.closedByUser) return
      if (neverOpened) {
        this.failedAttempts++
        if (this.failedAttempts === 2) {
          this.errorListeners.forEach((l) =>
            l({
              code: 'ConnectionFailed',
              message:
                'Could not connect to Deriv. Check your App ID and WebSocket endpoint.',
            }),
          )
        }
      }
      // Back off: 2s, 4s, 8s … capped at 30s.
      const delay = Math.min(30_000, 2_000 * 2 ** this.failedAttempts)
      this.reconnectTimer = setTimeout(() => this.connect(), delay)
    }
    ws.onerror = () => {
      // onclose follows and handles reconnect
    }
  }

  disconnect() {
    this.closedByUser = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.cleanupSocket()
    this.setStatus('closed')
  }

  onStatus(listener: (s: ConnectionStatus) => void) {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  onError(listener: (e: DerivError) => void) {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }

  /** One-shot request. Resolves with the response or rejects with its error. */
  request<T extends DerivMessage = DerivMessage>(
    payload: Record<string, unknown>,
  ) {
    return new Promise<T>((resolve, reject) => {
      const reqId = this.nextReqId++
      this.handlers.set(reqId, (msg) => {
        this.handlers.delete(reqId)
        if (msg.error) reject(msg.error)
        else resolve(msg as T)
      })
      if (!this.sendRaw({ ...payload, req_id: reqId })) {
        this.handlers.delete(reqId)
        reject({ code: 'NotConnected', message: 'Not connected to Deriv' })
      }
    })
  }

  /**
   * Streaming request (e.g. `ticks` or `ticks_history` with `subscribe: 1`).
   * Every message for this req_id is passed to `onMessage`. The returned
   * function stops the stream with `forget`.
   */
  subscribe(payload: Record<string, unknown>, onMessage: Handler) {
    const reqId = this.nextReqId++
    let subscriptionId: string | null = null
    let stopped = false
    this.handlers.set(reqId, (msg) => {
      if (msg.subscription?.id) subscriptionId = msg.subscription.id
      if (stopped) {
        // Stopped before the subscription id arrived: forget it now.
        if (subscriptionId) {
          this.sendRaw({ forget: subscriptionId })
          this.handlers.delete(reqId)
        }
        return
      }
      onMessage(msg)
    })
    this.sendRaw({ ...payload, subscribe: 1, req_id: reqId })
    return () => {
      stopped = true
      if (subscriptionId) {
        this.sendRaw({ forget: subscriptionId })
        this.handlers.delete(reqId)
      }
    }
  }

  private sendRaw(payload: Record<string, unknown>) {
    if (this.ws?.readyState !== WebSocket.OPEN) return false
    this.ws.send(JSON.stringify(payload))
    return true
  }

  private cleanupSocket() {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
    this.handlers.clear()
    this.ws = null
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status
    this.statusListeners.forEach((l) => l(status))
  }
}

/** Format a quote with the market's pip precision and return its last digit. */
export function lastDigit(quote: number, pipSize: number) {
  const text = quote.toFixed(pipSize)
  return Number(text[text.length - 1])
}
