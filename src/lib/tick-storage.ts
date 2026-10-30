
/**
 * TickLens — Persistent Tick Storage
 *
 * Stores up to 100,000 ticks per synthetic market.
 * Uses IndexedDB so data survives page refreshes
 * and closing the browser.
 */

export const MAX_TICKS_PER_MARKET = 100_000

const DB_NAME = 'TickLensAI'
const DB_VERSION = 1
const STORE_NAME = 'ticks'

export interface StoredTick {
  id?: number
  market: string
  digit: number
  quote: number
  epoch: number
  savedAt: number
}

export interface NewTick {
  digit: number
  quote: number
  epoch?: number
}

export interface MarketStorageStats {
  market: string
  count: number
  maximum: number
  remaining: number
  progress: number
}

function requireBrowser(): void {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is not available in this browser.')
  }
}

function openDatabase(): Promise<IDBDatabase> {
  requireBrowser()

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        })

        store.createIndex('market', 'market', {
          unique: false,
        })

        store.createIndex(
          'marketSequence',
          ['market', 'id'],
          { unique: true },
        )
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Database could not open.'))

    request.onblocked = () =>
      reject(new Error('Database upgrade is blocked by another tab.'))
  })
}

function transactionDone(
  transaction: IDBTransaction,
): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()

    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Database transaction failed.'))

    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Database transaction aborted.'))
  })
}

function validateMarket(market: string): string {
  const value = market.trim()

  if (!value) {
    throw new Error('A market symbol is required.')
  }

  return value
}

function validateTick(tick: NewTick): boolean {
  return (
    Number.isInteger(tick.digit) &&
    tick.digit >= 0 &&
    tick.digit <= 9 &&
    Number.isFinite(tick.quote) &&
    (tick.epoch === undefined || Number.isFinite(tick.epoch))
  )
}

/**
 * Save one tick.
 * Oldest ticks are removed automatically when
 * a market reaches its 100,000 tick limit.
 */
export async function saveTick(
  marketInput: string,
  tick: NewTick,
): Promise<void> {
  await saveTicks(marketInput, [tick])
}

/**
 * Save multiple ticks in one operation.
 */
export async function saveTicks(
  marketInput: string,
  ticks: NewTick[],
): Promise<void> {
  const market = validateMarket(marketInput)

  if (!ticks.length) return

  const valid = ticks.filter(validateTick)

  if (!valid.length) return

  const db = await openDatabase()

  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    for (const tick of valid) {
      const record: StoredTick = {
        market,
        digit: tick.digit,
        quote: tick.quote,
        epoch: tick.epoch ?? Math.floor(Date.now() / 1000),
        savedAt: Date.now(),
      }

      store.add(record)
    }

    // Keep only the newest 100,000 records for this market.
    const index = store.index('marketSequence')
    const range = IDBKeyRange.bound(
      [market, 0],
      [market, Number.MAX_SAFE_INTEGER],
    )

    const count = await new Promise<number>((resolve, reject) => {
      const request = index.count(range)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () =>
        reject(request.error ?? new Error('Could not count ticks.'))
    })

    const excess = count - MAX_TICKS_PER_MARKET

    if (excess > 0) {
      await new Promise<void>((resolve, reject) => {
        let removed = 0

        const request = index.openCursor(range, 'next')

        request.onsuccess = () => {
          const cursor = request.result

          if (!cursor || removed >= excess) {
            resolve()
            return
          }

          cursor.delete()
          removed++
          cursor.continue()
        }

        request.onerror = () =>
          reject(request.error ?? new Error('Could not remove old ticks.'))
      })
    }

    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

/**
 * Read the newest ticks for a market.
 * Results are returned oldest-to-newest.
 */
export async function getTicks(
  marketInput: string,
  limit = MAX_TICKS_PER_MARKET,
): Promise<StoredTick[]> {
  const market = validateMarket(marketInput)
  const safeLimit = Math.max(
    0,
    Math.min(MAX_TICKS_PER_MARKET, Math.floor(limit)),
  )

  if (safeLimit === 0) return []

  const db = await openDatabase()

  try {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const index = transaction
      .objectStore(STORE_NAME)
      .index('marketSequence')

    const range = IDBKeyRange.bound(
      [market, 0],
      [market, Number.MAX_SAFE_INTEGER],
    )

    const records = await new Promise<StoredTick[]>((resolve, reject) => {
      const results: StoredTick[] = []

      const request = index.openCursor(range, 'prev')

      request.onsuccess = () => {
        const cursor = request.result

        if (!cursor || results.length >= safeLimit) {
          resolve(results.reverse())
          return
        }

        results.push(cursor.value as StoredTick)
        cursor.continue()
      }

      request.onerror = () =>
        reject(request.error ?? new Error('Could not read ticks.'))
    })

    return records
  } finally {
    db.close()
  }
}

/**
 * Count stored ticks for one market.
 */
export async function getTickCount(
  marketInput: string,
): Promise<number> {
  const market = validateMarket(marketInput)
  const db = await openDatabase()

  try {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const index = transaction
      .objectStore(STORE_NAME)
      .index('market')

    return await new Promise<number>((resolve, reject) => {
      const request = index.count(IDBKeyRange.only(market))

      request.onsuccess = () => resolve(request.result)
      request.onerror = () =>
        reject(request.error ?? new Error('Could not count ticks.'))
    })
  } finally {
    db.close()
  }
}

/**
 * Return storage progress for a market.
 */
export async function getMarketStorageStats(
  marketInput: string,
): Promise<MarketStorageStats> {
  const market = validateMarket(marketInput)
  const count = await getTickCount(market)

  return {
    market,
    count,
    maximum: MAX_TICKS_PER_MARKET,
    remaining: Math.max(0, MAX_TICKS_PER_MARKET - count),
    progress: (count / MAX_TICKS_PER_MARKET) * 100,
  }
}

/**
 * Return storage progress for several markets.
 */
export async function getAllStorageStats(
  markets: string[],
): Promise<MarketStorageStats[]> {
  return Promise.all(
    markets.map((market) => getMarketStorageStats(market)),
  )
}

/**
 * Delete all stored ticks for one market.
 */
export async function clearMarketTicks(
  marketInput: string,
): Promise<void> {
  const market = validateMarket(marketInput)
  const db = await openDatabase()

  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('market')

    await new Promise<void>((resolve, reject) => {
      const request = index.openCursor(IDBKeyRange.only(market))

      request.onsuccess = () => {
        const cursor = request.result

        if (!cursor) {
          resolve()
          return
        }

        cursor.delete()
        cursor.continue()
      }

      request.onerror = () =>
        reject(request.error ?? new Error('Could not clear market ticks.'))
    })

    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

/**
 * Delete all TickLens training data.
 */
export async function clearAllTicks(): Promise<void> {
  const db = await openDatabase()

  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).clear()
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}
