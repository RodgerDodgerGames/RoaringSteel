/**
 * Data Window (dataWindow.js)
 *
 * Works out which years a game's data comes from.
 *
 * The jobs data (the Census Bureau's Quarterly Workforce Indicators, QWI)
 * sets the years. A game uses the five years up to the state's latest full
 * year of QWI — the newest year with all four quarters published — and
 * averages employment over them. Everything else follows the window's
 * middle year: land cover is taken from that year, and population from the
 * Census release closest to the window (see useCensus.js). So in a game
 * whose QWI runs 2021-2025, land cover is from 2023, the middle of it.
 *
 * Tying every source to one window keeps a game's towns, industries and
 * terrain describing the same stretch of time, and leaves one place to
 * change if a game is ever set in an earlier period.
 *
 * QWI comes out a quarter at a time, and states publish at their own pace,
 * so the latest full year is looked up for each state rather than assumed.
 *
 * API: https://api.census.gov/data/timeseries/qwi/sa
 *
 * @module composables/setup/dataWindow
 */

import { fetchWithRetries, RequestError } from '@/composables/utils'

/** How many years the window spans. Odd, so it has a single middle year. */
const WINDOW_YEARS = 5

/**
 * How far back to look for the latest full year. A state a year or two
 * behind is normal; the search goes back further so one running late is
 * still found rather than failing setup.
 */
const LOOKBACK_YEARS = 6

/**
 * Ceiling for each attempt, below the other Census requests' (see
 * `CENSUS_ATTEMPT_TIMEOUT_MS`). The lookup is the smallest of them, and every
 * new game makes it, so a player with towns cached should not sit through
 * three long waits (see `fetchWithRetries`) before playing with them.
 */
const ATTEMPT_TIMEOUT_MS = 10000

/**
 * The five-year window that ends at a given year.
 * @param {number} endYear - The window's last year
 * @returns {{start: number, end: number, middle: number}} First, last and
 *   middle year, inclusive (2021, 2025 and 2023 for 2025)
 */
export function dataWindow(endYear) {
  const start = endYear - (WINDOW_YEARS - 1)
  return { start, end: endYear, middle: start + (WINDOW_YEARS - 1) / 2 }
}

/**
 * The newest year with all four quarters present in a set of QWI rows.
 *
 * @param {Array<{time: string}>} rows - QWI rows, each with a quarter such as
 *   "2025-Q4"
 * @returns {number|null} The year, or null if no year is complete
 */
export function latestFullYear(rows) {
  const quartersByYear = new Map()
  rows.forEach(({ time }) => {
    const [year, quarter] = time.split('-')
    if (!quartersByYear.has(year)) quartersByYear.set(year, new Set())
    quartersByYear.get(year).add(quarter)
  })
  const fullYears = [...quartersByYear]
    .filter(([, quarters]) => quarters.size === 4)
    .map(([year]) => Number(year))
  return fullYears.length > 0 ? Math.max(...fullYears) : null
}

/**
 * Looks up a state's data window: one small request for the state's total
 * employment, by quarter, over the last few years.
 *
 * @param {string} stateFipsCode - Two-digit state FIPS code (e.g. "25")
 * @returns {Promise<{start: number, end: number, middle: number}>} The window
 * @throws {Error} When the request fails or no year is complete
 */
export async function fetchDataWindow(stateFipsCode) {
  const thisYear = new Date().getFullYear()
  const params = {
    get: 'Emp',
    for: `state:${stateFipsCode}`,
    time: `from ${thisYear - LOOKBACK_YEARS} to ${thisYear}`,
    key: import.meta.env.VITE_QWI_KEY
  }
  // Spaces encoded by hand, as the other Census requests do: the API wants
  // the rest of each value as written
  const query = Object.entries(params)
    .map(([name, value]) => `${name}=${String(value).replace(/ /g, '%20')}`)
    .join('&')

  const response = await fetchWithRetries(
    `https://api.census.gov/data/timeseries/qwi/sa?${query}`,
    {
      timeoutMs: ATTEMPT_TIMEOUT_MS
    }
  )
  if (!response.ok) {
    throw new RequestError(`QWI year lookup failed: ${response.status}`, response.status)
  }
  // No content: the state has no QWI in the lookback at all
  const table = response.status === 204 ? [] : await response.json()

  // A table of rows with a header row first, as every Census API answers
  const [header = [], ...rows] = table
  const timeColumn = header.indexOf('time')
  if (rows.length > 0 && timeColumn < 0) {
    throw new Error('QWI year lookup came back without quarters')
  }
  const endYear = latestFullYear(rows.map((row) => ({ time: row[timeColumn] })))
  if (endYear == null) {
    throw new Error(`No full year of QWI data for state ${stateFipsCode}`)
  }
  return dataWindow(endYear)
}
