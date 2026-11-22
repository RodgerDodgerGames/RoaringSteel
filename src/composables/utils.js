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
 * Lets the browser draw the page before long work carries on: the rest of
 * the work waits for a fresh turn of the browser's event loop, and the
 * browser draws in between. Long setup steps call it every so often, so
 * their progress bar moves rather than freezing until they finish.
 *
 * Skipped while the page is hidden: no one is watching the bar then, and a
 * browser holds a hidden page's timers back to about one a second, which
 * would stretch a few seconds of work out to minutes.
 *
 * @returns {Promise<void>} Resolves once the browser has had its turn
 */
export function yieldToBrowser() {
  if (typeof document !== 'undefined' && document.hidden) return Promise.resolve()
  return wait(0)
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

/** How many times `fetchWithRetries` tries a request before giving up */
export const RETRY_ATTEMPTS = 3

/** Pause between those attempts, in ms */
export const RETRY_PAUSE_MS = 1000

/**
 * Ceiling for each try at a Census Bureau request, in ms. The requests setup
 * makes answer in about a second; one still going after this has stalled.
 * Each is tried up to three times, so the default 30-second ceiling would let
 * a stalled API hold setup for a minute and a half per request, and setup
 * makes dozens of them.
 */
export const CENSUS_ATTEMPT_TIMEOUT_MS = 15000

/**
 * Fetches a URL, trying again when the server fails or the connection does.
 *
 * The Census Bureau's APIs fail now and then for no reason of the request's
 * own: about one request in five answered 500 in a test on 2026-10-28, and
 * the same request a moment later worked. Setup makes dozens of them, so
 * without a second try nearly every game would lose an industry or a town.
 *
 * Tried again: a 5xx (the server failing), a 408 or 429 (the server asking
 * to wait), and a request that could not connect or ran out of time. Any
 * other answer — success, or a 4xx such as a bad request — is the server's
 * considered reply, returned as it is: asking again would get the same.
 *
 * @param {string} url - Request URL
 * @param {Object} [options] - Options for `fetchWithTimeout` (its `timeoutMs`
 *   is the ceiling for each attempt), plus:
 * @param {number} [options.attempts] - Tries before giving up
 * @param {number} [options.pauseMs] - Pause between tries
 * @returns {Promise<Object>} The response, from the last attempt
 * @throws {Error} When the last attempt could not connect
 */
export async function fetchWithRetries(
  url,
  { attempts = RETRY_ATTEMPTS, pauseMs = RETRY_PAUSE_MS, ...options } = {}
) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options)
      if (!isWorthRetrying(response.status) || attempt === attempts) return response
    } catch (error) {
      // A request the caller cancelled stays cancelled
      if (attempt === attempts || options.signal?.aborted) throw error
    }
    await wait(pauseMs)
  }
}

/** True for an answer a later try might change: see `fetchWithRetries` */
function isWorthRetrying(status) {
  return status >= 500 || status === 408 || status === 429
}

/**
 * A request the server answered with a failure, carrying the HTTP status so
 * the player can be told what kind of failure it was (see `isRefusal`).
 */
export class RequestError extends Error {
  /**
   * @param {string} message - What failed, for the console
   * @param {number} status - The HTTP status the server answered with
   */
  constructor(message, status) {
    super(message)
    this.name = 'RequestError'
    this.status = status
  }
}

/**
 * The setup screens' explanation of a request a server turned down (see
 * `isRefusal`). It will be turned down again, and the player's connection is
 * fine, so the message does not tell them to check it.
 *
 * @param {string} server - Who turned it down, as in "The Census Bureau"
 * @param {string} what - The data asked for, as in "this state's population"
 * @param {RequestError} refusal - The error, for its status
 * @returns {string} Player-facing message
 */
export function refusalMessage(server, what, refusal) {
  return `${server} turned down the request for ${what} (error ${refusal.status}). Trying again won't help; please report the problem.`
}

/**
 * Whether an error is a server turning a request down for good: a 4xx answer
 * that `fetchWithRetries` would not try again. Asking again won't help, and
 * nor will the player's connection, so the setup screens say so rather than
 * suggest checking it.
 *
 * A bad Census key is not one of these, sadly. The API answers it with a
 * redirect that carries no CORS header, so the browser reports it to the
 * page exactly as it would a dropped connection.
 *
 * @param {*} error - Anything a failed request threw
 * @returns {boolean} True for a `RequestError` with such a status
 */
export function isRefusal(error) {
  return (
    error instanceof RequestError &&
    error.status >= 400 &&
    error.status < 500 &&
    !isWorthRetrying(error.status)
  )
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
 * How many of the game's dollars make one of Empire Builder's millions.
 *
 * The game counts money so that the board game's figures carry straight over
 * (see config/game.js): its $20 million building allowance is 20,000 here.
 * Players see every amount in millions, as the board game prints them, so
 * the formatters below divide by this before showing anything.
 */
const DOLLARS_PER_MILLION = 1000

/**
 * The number of millions, to three decimal places — one of the game's
 * dollars — with trailing zeros dropped: "1.234", "28", "1,250".
 *
 * Three places keep every amount exact to the game's dollar, so a line's cost
 * and what is left of the allowance always add back up to the allowance.
 * Track prices can carry fractions of a dollar; those are rounded off.
 *
 * The smallest number of decimal places is set to none outright. Left out,
 * some browsers (Chrome among them) have filled it in from a money format's
 * two decimal places, and a whole amount came out as "8.0".
 */
const millionsFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3
})

/**
 * An amount as a sign and a number of millions, ready for a "$" and a unit.
 *
 * The sign goes in front of the "$" ("-$1.5M", not "$-1.5M"), so the number
 * is formatted without it. An amount so small it rounds to zero takes no
 * sign: "$0M", not "-$0M".
 *
 * @param {number} value - An amount of money, in the game's dollars
 * @returns {{sign: string, number: string}} e.g. { sign: '-', number: '1.5' }
 */
function inMillions(value) {
  const number = millionsFormat.format(Math.abs(value) / DOLLARS_PER_MILLION)
  const sign = value < 0 && number !== '0' ? '-' : ''
  return { sign, number }
}

/**
 * Formats money for a sentence, in millions: "$12 million" for 12,000,
 * "$1.234 million" for 1,234.
 *
 * Used wherever there is room for the word: the turn history, notices,
 * messages, the legend, the goal to win. Tight spots use
 * `formatShortCurrency`.
 *
 * @param {number} value - An amount of money, in the game's dollars
 * @returns {string} e.g. "$12 million"
 */
export const formatCurrency = (value) => {
  const { sign, number } = inMillions(value)
  return `${sign}$${number} million`
}

/**
 * Formats money compactly, in millions: "$28M" for 28,000, "$1.234M" for
 * 1,234, "$1,250M" for 1,250,000.
 *
 * Used where space is short: the top bar, the cards, buttons, the build
 * panel's figures, the map's tooltips and markers. Sentences use
 * `formatCurrency`.
 *
 * @param {number} value - An amount of money, in the game's dollars
 * @returns {string} e.g. "$28M"
 */
export const formatShortCurrency = (value) => {
  const { sign, number } = inMillions(value)
  return `${sign}$${number}M`
}

/**
 * Text made safe to put in HTML, as an element's text or an attribute's
 * value: a name such as "Oil & Gas" or one with a quote in it.
 * @param {string} text - The text
 * @returns {string} Escaped
 */
export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
