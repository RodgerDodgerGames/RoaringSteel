/**
 * Build National Shares (scripts/build-national-shares.mjs)
 *
 * Fills in the `national_share` column of public/data/game_industries.csv:
 * each industry's share of all the jobs in the country's metro and micro
 * areas, from the Census Bureau's QWI.
 *
 * The game scores a town's industries by their "extra jobs": the jobs a town
 * has in an industry beyond what an average town of its size would have
 * (see townIndustries.js). "An average town of its size" is the town's
 * total jobs times the industry's national share, so the game needs every
 * industry's share. Working it out takes every state's jobs data, far too
 * much to fetch at game time, so it is worked out here once and kept in the
 * file.
 *
 * Run it by hand whenever an industry is added to the list, or once a year
 * or so as new jobs data comes out — never at game time:
 *
 *   node scripts/build-national-shares.mjs
 *
 * It reads the Census key from .env (VITE_QWI_KEY), and takes a few minutes:
 * it asks for every industry in every state, ten industries to a request.
 *
 * The years are the latest five full years of QWI, as a game uses (see
 * dataWindow.js), found from California's data. Only metro and micro areas
 * count, as only they are towns in the game. The other columns of the file
 * are kept as they are.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const CSV_FILE = path.join(ROOT, 'public/data/game_industries.csv')
const QWI_URL = 'https://api.census.gov/data/timeseries/qwi/sa'
const AREA = 'metropolitan statistical area/micropolitan statistical area'

/** The NAICS code QWI gives every industry together under */
const ALL_INDUSTRIES = '00'

/** How many industries one request asks for, as the game does */
const INDUSTRIES_PER_REQUEST = 10

/** How many states are fetched at once */
const STATES_AT_ONCE = 6

/** How many years the game averages over (see dataWindow.js) */
const WINDOW_YEARS = 5

/** The 50 states and DC, by FIPS code */
const STATES = [
  '01', '02', '04', '05', '06', '08', '09', '10', '11', '12', '13', '15', '16',
  '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29',
  '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42',
  '44', '45', '46', '47', '48', '49', '50', '51', '53', '54', '55', '56'
] // prettier-ignore

/**
 * The Census key, from the .env file at the project's root.
 * @returns {string} The key
 */
function censusKey() {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
  const key = env.match(/^VITE_QWI_KEY=(.*)$/m)?.[1]?.trim()
  if (!key) throw new Error('No VITE_QWI_KEY in .env')
  return key
}

/**
 * Asks QWI for some rows, a few times if it fails.
 * @param {Object} params - The query's parameters; a list is sent once per value
 * @returns {Promise<Array<Array<string>>|null>} The table, header row first;
 *   empty when there is nothing; null when the request was turned down
 */
async function askQWI(params) {
  const query = Object.entries(params)
    .flatMap(([name, value]) => [].concat(value).map((one) => `${name}=${encodeURIComponent(one)}`))
    .join('&')
  let lastError
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(`${QWI_URL}?${query}`, { signal: AbortSignal.timeout(150000) })
      if (response.status === 204) return []
      // Turned down: asking again would not change the answer
      if (response.status === 400) return null
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    } catch (e) {
      lastError = e
      await new Promise((resolve) => setTimeout(resolve, 3000 * attempt))
    }
  }
  throw new Error(`QWI request failed: ${lastError}`)
}

/**
 * The last year QWI has all four quarters of, from California's data.
 * @param {string} key - The Census key
 * @returns {Promise<number>} The year
 */
async function latestFullYear(key) {
  const thisYear = new Date().getFullYear()
  const table = await askQWI({
    get: 'Emp',
    for: 'state:06',
    time: `from ${thisYear - 6} to ${thisYear}`,
    key
  })
  const quarters = new Map()
  table.slice(1).forEach((row) => {
    const [year, quarter] = row[table[0].indexOf('time')].split('-')
    quarters.set(year, (quarters.get(year) ?? new Set()).add(quarter))
  })
  return Math.max(...[...quarters].filter(([, q]) => q.size === 4).map(([y]) => Number(y)))
}

/**
 * One state's jobs in some industries, each industry's average over the
 * years, added up over the state's metro and micro areas. An industry the
 * API will not take with the others is asked for on its own.
 * @param {string} state - The state's FIPS code
 * @param {Array<string>} codes - The industries' NAICS codes
 * @param {{start: number, end: number}} years - The years
 * @param {string} key - The Census key
 * @returns {Promise<Map<string, number>>} Jobs by NAICS code
 */
async function stateJobs(state, codes, years, key) {
  const table = await askQWI({
    get: 'Emp',
    for: `${AREA}:*`,
    in: `state:${state}`,
    time: `from ${years.start} to ${years.end}`,
    industry: codes,
    key
  })
  if (table === null) {
    if (codes.length === 1) {
      console.warn(`State ${state} has no jobs data for ${codes[0]}`)
      return new Map()
    }
    const jobs = new Map()
    for (const code of codes) {
      for (const [one, n] of await stateJobs(state, [code], years, key)) jobs.set(one, n)
    }
    return jobs
  }

  // Each area's quarters, by industry. QWI sometimes sends a row twice, so
  // each quarter is counted once.
  const [header = [], ...rows] = table
  const col = (name) => header.indexOf(name)
  const quarters = new Map()
  rows.forEach((row) => {
    const jobs = row[col('Emp')]
    if (jobs == null || jobs === '') return
    const id = `${row[col('industry')]}|${row[col(AREA)]}`
    if (!quarters.has(id)) quarters.set(id, new Map())
    quarters.get(id).set(row[col('time')], Number(jobs))
  })

  // Each area's average, added up by industry
  const jobs = new Map()
  quarters.forEach((byQuarter, id) => {
    const code = id.split('|')[0]
    const values = [...byQuarter.values()]
    const average = values.reduce((sum, n) => sum + n, 0) / values.length
    jobs.set(code, (jobs.get(code) ?? 0) + average)
  })
  return jobs
}

/**
 * Every state's jobs in the industries, added up.
 * @param {Array<string>} codes - The NAICS codes, ALL_INDUSTRIES among them
 * @param {{start: number, end: number}} years - The years
 * @param {string} key - The Census key
 * @returns {Promise<Map<string, number>>} The country's jobs by NAICS code
 */
async function nationalJobs(codes, years, key) {
  const batches = []
  for (let i = 0; i < codes.length; i += INDUSTRIES_PER_REQUEST) {
    batches.push(codes.slice(i, i + INDUSTRIES_PER_REQUEST))
  }
  const total = new Map()
  const queue = [...STATES]
  let done = 0
  async function worker() {
    for (let state = queue.shift(); state; state = queue.shift()) {
      for (const batch of batches) {
        for (const [code, n] of await stateJobs(state, batch, years, key)) {
          total.set(code, (total.get(code) ?? 0) + n)
        }
      }
      console.log(`${++done} of ${STATES.length} states`)
    }
  }
  await Promise.all(Array.from({ length: STATES_AT_ONCE }, worker))
  return total
}

const key = censusKey()
const end = await latestFullYear(key)
const years = { start: end - (WINDOW_YEARS - 1), end }
console.log(`Jobs data from ${years.start} to ${years.end}`)

const { data: rows, meta } = Papa.parse(fs.readFileSync(CSV_FILE, 'utf8'), {
  header: true,
  skipEmptyLines: true
})
const codes = [ALL_INDUSTRIES, ...rows.map((row) => row.naics_code)]
const jobs = await nationalJobs(codes, years, key)

const allJobs = jobs.get(ALL_INDUSTRIES)
rows.forEach((row) => {
  const share = (jobs.get(row.naics_code) ?? 0) / allJobs
  if (share === 0) console.warn(`No jobs anywhere for ${row.naics_code} ${row.label}`)
  // Four significant figures: far finer than a town's jobs are known to
  row.national_share = Number(share.toPrecision(4))
})
const fields = meta.fields.includes('national_share')
  ? meta.fields
  : [...meta.fields, 'national_share']
fs.writeFileSync(CSV_FILE, Papa.unparse(rows, { columns: fields, newline: '\n' }) + '\n')
console.log(`Wrote ${rows.length} industries to ${path.relative(ROOT, CSV_FILE)}`)
