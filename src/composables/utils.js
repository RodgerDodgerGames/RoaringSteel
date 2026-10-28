/**
 * Utility Functions (utils.js)
 *
 * General-purpose utilities used across the application.
 *
 * @module composables/utils
 */

/**
 * Waits for a fixed number of milliseconds.
 *
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>} Resolves after the delay
 */
export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Fallback ceiling for any request that does not name its own. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000

/**
 * Fetches a URL under a ceiling that covers the whole exchange.
 *
 * A browser `fetch` against a connection that stalls mid-flight never resolves
 * and never rejects. Setup awaits these requests, so one stalled socket parked
 * the whole game on the loading modal with a full progress bar and no error
 * (#85). The timer both aborts the request, so the socket is released, and
 * rejects on its own, so the caller settles even if the underlying fetch
 * ignores the abort.
 *
 * The budget spans headers *and* body. `fetch` resolves as soon as the headers
 * land, so a ceiling that stopped there would leave `response.json()`
 * unbounded — and a connection that stalls part-way through the body hangs
 * exactly as the reported bug did.
 *
 * Returns a response-like object rather than the `Response` itself: only the
 * members the app actually reads are carried over, with the body readers
 * wrapped so they share the request's remaining budget.
 *
 * @param {string} url - Request URL
 * @param {Object} [options] - Standard fetch options, plus `timeoutMs`
 * @param {number} [options.timeoutMs] - Ceiling for the whole exchange
 * @returns {Promise<{ok: boolean, status: number, statusText: string,
 *   json: function(): Promise<*>, text: function(): Promise<string>,
 *   blob: function(): Promise<Blob>}>}
 */
export async function fetchWithTimeout(
  url,
  { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, signal, ...options } = {}
) {
  const controller = new AbortController()
  const expiresAt = Date.now() + timeoutMs

  // A caller's own signal still cancels. Without this it would be dropped in
  // favor of the one this helper installs, silently, and a future cancel
  // button would do nothing.
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true })

  /** Races a step of the exchange against what is left of the budget. */
  async function beforeDeadline(promise) {
    let timer
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(
        () => {
          controller.abort()
          reject(new Error(`Request timed out after ${timeoutMs}ms`))
        },
        Math.max(0, expiresAt - Date.now())
      )
    })

    try {
      return await Promise.race([promise, deadline])
    } finally {
      clearTimeout(timer)
    }
  }

  const response = await beforeDeadline(fetch(url, { ...options, signal: controller.signal }))

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    json: () => beforeDeadline(response.json()),
    text: () => beforeDeadline(response.text()),
    // The terrain images (elevation tiles, land cover) are read this way
    blob: () => beforeDeadline(response.blob())
  }
}

/**
 * Maps over items with a bounded number of concurrent workers, optionally
 * pacing request starts so an upstream API is not hit in bursts.
 *
 * Results keep the order of `items` regardless of completion order, so the
 * caller can zip them back against the input. A pool is used rather than
 * fixed batches because a batch can only finish as fast as its slowest item,
 * which leaves connections idle whenever one request lags.
 *
 * `worker` is expected to handle its own errors; a rejection propagates and
 * leaves the remaining items unprocessed.
 *
 * @param {Array} items - Items to process
 * @param {Function} worker - async (item, index) => result
 * @param {Object} [options]
 * @param {number} [options.concurrency=4] - Maximum requests in flight at once
 * @param {number} [options.minIntervalMs=0] - Minimum gap between request starts
 * @param {Function} [options.onProgress] - Called with (completed, total) after each item
 * @returns {Promise<Array>} Results in the same order as `items`
 */
export async function mapWithConcurrency(items, worker, options = {}) {
  const { concurrency = 4, minIntervalMs = 0, onProgress = null } = options

  const results = new Array(items.length)
  let nextIndex = 0
  let completed = 0
  // Timestamp the next request start is allowed to happen at. Shared by every
  // worker so the pool as a whole is throttled, not each worker separately.
  let nextStartAt = 0

  async function pace() {
    if (minIntervalMs <= 0) return
    const now = Date.now()
    const startAt = Math.max(now, nextStartAt)
    nextStartAt = startAt + minIntervalMs
    if (startAt > now) await wait(startAt - now)
  }

  async function runWorker() {
    for (let index = nextIndex++; index < items.length; index = nextIndex++) {
      await pace()
      results[index] = await worker(items[index], index)
      completed++
      if (onProgress) onProgress(completed, items.length)
    }
  }

  const poolSize = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(Array.from({ length: poolSize }, runWorker))

  return results
}

/**
 * Formats a number as US currency (e.g., "$1,234").
 *
 * @param {number} value - The numeric value to format
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0
  }).format(value)
}

/**
 * Formats money compactly: "$20.3K", "$8K", "$1.3M".
 *
 * The smallest number of decimal places is set to none outright. Left out,
 * some browsers (Chrome among them) fill it in from the dollar's two decimal
 * places, cut to the one allowed, and a whole number of thousands comes out
 * as "$8.0K".
 */
const shortCurrencyFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
})

/**
 * Formats a number as short US currency, to the nearest hundred dollars:
 * "$20.3k" for 20,300, "$8k" for 8,000, "$1.3M" for 1,250,000. An amount
 * under a thousand is given in full.
 *
 * The demand cards switch to this when the window leaves them too little
 * room for the full amount.
 *
 * @param {number} value - An amount of money
 * @returns {string} Short currency string
 */
export const formatShortCurrency = (value) => shortCurrencyFormat.format(value).replace('K', 'k')
