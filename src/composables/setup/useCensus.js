/**
 * Census API Composable (useCensus.js)
 *
 * Fetches population data from the US Census Bureau's American Community Survey (ACS).
 * Uses the 5-year estimates for MSA/Micropolitan area population counts.
 *
 * A 5-year release is named for its last year: the 2024 release averages
 * 2020-2024. The release used is the one that best covers the game's data
 * window (see dataWindow.js) — the one ending at the window's last year,
 * which spans the same five years. Census publishes each release about a year
 * after it ends, so that one often does not exist yet; the search then steps
 * back a year at a time, keeping as much overlap with the window as it can.
 *
 * API: https://api.census.gov/data/{year}/acs/acs5
 * Requires: VITE_QWI_KEY environment variable
 *
 * @module composables/setup/useCensus
 */

import { ref } from 'vue'
import { CENSUS_ATTEMPT_TIMEOUT_MS, fetchWithRetries, RequestError } from '@/composables/utils'
import { debug } from '@/composables/debug'

/** The ACS's name for a state's part of a metro or micro area */
const AREA_PART = 'metropolitan statistical area/micropolitan statistical area (or part)'

/**
 * Fetches from the ACS 5-year release that best covers the data window.
 *
 * Tries the release ending at the data window's last year first, then each
 * year before it, down to the window's first year. The API answers 404 for
 * a release it does not have. Each request is tried a few times when the
 * API fails (see `fetchWithRetries`).
 *
 * @param {{start: number, end: number}} dataWindow - The game's data years
 * @param {Function} urlForYear - The request's URL for one year's release:
 *   (year) => URL
 * @param {string} what - What is being fetched, for the error message, such
 *   as "population"
 * @returns {Promise<{response: Response, year: number}>} The answer, and the
 *   release it came from
 * @throws {RequestError} When the API fails or turns the request down, or
 *   no release in the window is published
 * @throws {Error} When the connection fails
 */
async function fetchRelease(dataWindow, urlForYear, what) {
  let response = null
  let year
  for (year = dataWindow.end; year >= dataWindow.start; year--) {
    const url = urlForYear(year)
    debug.log(`Fetching ${what}:`, url)
    response = await fetchWithRetries(url, { timeoutMs: CENSUS_ATTEMPT_TIMEOUT_MS })
    if (response.status !== 404) break
    debug.log(`No ACS 5-year release for ${year} yet`)
  }
  if (response.status === 404) {
    throw new RequestError(
      `No ACS 5-year release from ${dataWindow.start} to ${dataWindow.end} is published`,
      response.status
    )
  }
  if (!response.ok) {
    throw new RequestError(`ACS ${what} request failed: ${response.status}`, response.status)
  }
  return { response, year }
}

/**
 * The counties that make up each of some metro and micro areas: each area's
 * part in the state, as the ACS release that best covers the data window
 * draws it (see `fetchRelease`), the same release the towns' populations
 * come from.
 *
 * The towns store needs this for an area the jobs data has no numbers for
 * as an area, so its counties' jobs can be added up instead (see the
 * industry store's `fillAreas`). The ACS answers for one area at a time.
 *
 * @param {string} state - Two-digit state FIPS code
 * @param {Array<string>} msaCodes - The areas' codes
 * @param {{start: number, end: number}} dataWindow - The game's data years
 * @returns {Promise<Map<string, Array<string>>>} Each area's counties'
 *   three-digit codes, by area code; empty for an area the release has no
 *   counties for
 * @throws {RequestError} When the API fails or turns a request down, or no
 *   release in the window is published
 * @throws {Error} When the connection fails
 */
export async function fetchAreaCounties(state, msaCodes, dataWindow) {
  const key = import.meta.env.VITE_QWI_KEY
  const urlFor = (msa) => (year) =>
    `https://api.census.gov/data/${year}/acs/acs5?get=NAME&for=county:*` +
    `&in=state:${state}%20${AREA_PART.replace(/ /g, '%20')}:${msa}&key=${key}`

  /**
   * One area's counties, from the releases in a window
   * @param {string} msa - The area's code
   * @param {{start: number, end: number}} window - The releases to try
   * @returns {Promise<{counties: Array<string>, year: number}>} Its counties,
   *   and the release they came from
   */
  async function countiesOf(msa, window) {
    const { response, year } = await fetchRelease(window, urlFor(msa), 'counties')
    // No content: the release has no counties for the area
    const [header = [], ...rows] = response.status === 204 ? [] : await response.json()
    const column = header.indexOf('county')
    return { counties: rows.map((row) => row[column]), year }
  }

  const counties = new Map()
  if (msaCodes.length === 0) return counties
  // The first area finds the release; the rest are asked of it all at once
  const [first, ...rest] = msaCodes
  const found = await countiesOf(first, dataWindow)
  counties.set(first, found.counties)
  const release = { start: found.year, end: found.year }
  const others = await Promise.all(rest.map((msa) => countiesOf(msa, release)))
  rest.forEach((msa, i) => counties.set(msa, others[i].counties))
  return counties
}

/**
 * Composable for fetching Census population data by state.
 *
 * @param {string} state - Two-digit state FIPS code (e.g., "27" for Minnesota)
 * @param {{start: number, end: number}} dataWindow - The game's data years
 * @returns {Object} { populationData, fetchPopulationData }
 */
export default function useCensus(state, dataWindow) {
  const populationData = ref([])

  // api key
  const key = import.meta.env.VITE_QWI_KEY

  /**
   * Fetches population data for all MSAs in the specified state.
   * Results are stored in populationData ref.
   *
   * From the release that best covers the data window (see `fetchRelease`).
   *
   * Every town needs its population, so a failure is thrown for the towns
   * store to handle, not swallowed into an empty list.
   *
   * @returns {Promise<void>}
   * @throws {RequestError} When the API fails or turns the request down, or
   *   no release in the window is published
   * @throws {Error} When the connection fails
   */
  const fetchPopulationData = async () => {
    const { response } = await fetchRelease(dataWindow, setupRequest, 'population')

    const censusData = await response.json()

    // Census API returns array-of-arrays with header row first
    // Example: [["NAME", "B01001_001E", "state", "msa"], ["Minneapolis...", "3500000", "27", "33460"], ...]
    // Remove the header row since we'll destructure by position
    censusData.shift()

    // Transform array data to named object properties
    // B01001_001E is the Census variable code for total population
    populationData.value = censusData.map(([name, population, state_code, msa_code]) => ({
      name, // Full MSA name (e.g., "Minneapolis-St. Paul-Bloomington, MN-WI")
      population, // Total population count
      state_code, // State FIPS code
      msa_code // Metropolitan Statistical Area code
    }))
  }

  return {
    populationData,
    fetchPopulationData
  }

  // setup API request for one year's release
  // example:
  // https://api.census.gov/data/2024/acs/acs5?get=NAME,B01001_001E&for=metropolitan%20statistical%20area/micropolitan%20statistical%20area%20(or%20part):*&in=state:06
  function setupRequest(year) {
    const rootUrl = `https://api.census.gov/data/${year}/acs/acs5`
    const params = {
      key: key,
      get: 'NAME,B01001_001E',
      for: `${AREA_PART}:*`,
      in: `state:${state}`
    }

    const url = Object.keys(params).reduce((acc, key) => {
      if (acc !== `${rootUrl}?`) {
        acc += '&'
      }
      return acc + `${key}=${params[key]}`
    }, `${rootUrl}?`)

    return url
  }
}
