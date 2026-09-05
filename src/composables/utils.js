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

/**
 * Waits for a random amount of time between min and max milliseconds.
 * Used to add jitter to API requests to avoid rate limiting.
 *
 * @param {number} minWaitTime - Minimum wait time in ms (default: 500)
 * @param {number} maxWaitTime - Maximum wait time in ms (default: 2000)
 * @returns {Promise<void>} Resolves after the random delay
 */
export function waitRandomly(minWaitTime = 500, maxWaitTime = 2000) {
  const waitTime = Math.floor(Math.random() * (maxWaitTime - minWaitTime)) + minWaitTime
  return wait(waitTime)
}

/** Fallback ceiling for any request that does not name its own. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000

/**
 * Fetches a URL that is guaranteed to settle.
 *
 * A browser `fetch` against a connection that stalls mid-flight never resolves
 * and never rejects. Setup awaits these requests, so one stalled socket parked
 * the whole game on the loading modal with a full progress bar and no error
 * (#85). The timer both aborts the request, so the socket is released, and
 * rejects on its own, so the returned promise settles even if the underlying
 * fetch ignores the abort.
 *
 * @param {string} url - Request URL
 * @param {Object} [options] - Standard fetch options, plus `timeoutMs`
 * @param {number} [options.timeoutMs] - Ceiling before the request is abandoned
 * @returns {Promise<Response>} Rejects with a timeout error if the ceiling is hit
 */
export function fetchWithTimeout(url, { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, ...options } = {}) {
  const controller = new AbortController()

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort()
      reject(new Error(`Request timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    // The timer is cleared before settling rather than in a trailing `finally`,
    // so an answered request never leaves a pending timer behind it.
    fetch(url, { ...options, signal: controller.signal }).then(
      (response) => {
        clearTimeout(timer)
        resolve(response)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
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
