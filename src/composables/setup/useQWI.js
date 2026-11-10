/**
 * QWI API Composable (useQWI.js)
 *
 * Fetches employment data from the Census Bureau's Quarterly Workforce Indicators (QWI) API.
 * QWI provides detailed employment statistics by industry and geography.
 *
 * API: https://api.census.gov/data/timeseries/qwi/sa
 * Requires: VITE_QWI_KEY environment variable
 *
 * Data returned includes employment counts (Emp) by MSA, by quarter, over the
 * game's data window (see dataWindow.js), for each industry asked for. One
 * request can ask for several industries; each row says which it is for.
 * It can ask for some of the state's counties instead of its metro and
 * micro areas, for the areas QWI has no numbers for as areas (see the
 * industry store's `fillAreas`).
 *
 * @module composables/setup/useQWI
 */

import { ref } from 'vue'
import {
  CENSUS_ATTEMPT_TIMEOUT_MS,
  fetchWithRetries,
  isRefusal,
  RequestError
} from '@/composables/utils'
import { debug } from '@/composables/debug'

/**
 * Composable for fetching QWI employment data.
 *
 * @param {string} state - Two-digit state FIPS code (e.g., "27" for Minnesota)
 * @param {number|Array<number>} industries - The NAICS industry codes to
 *   ask for: one, or several in one request
 * @param {{start: number, end: number}} dataWindow - The years to fetch, inclusive
 * @param {Object} [options]
 * @param {Array<string>} [options.counties] - Three-digit county codes: ask
 *   for these counties rather than every metro and micro area. Each row
 *   then has its county's code in `county`, rather than an area's in
 *   `msa_code`.
 * @returns {Object} { data, error, refused, fetchQWI }
 */
export default function useQWI(state, industries, dataWindow, { counties } = {}) {
  const data = ref([])
  const error = ref(null)

  /**
   * Whether the error is the API turning the request down (see `isRefusal`):
   * an answer that asking again would not change, unlike a failure
   */
  const refused = ref(false)

  const fetchQWI = async () => {
    // Import the QWI configuration
    // api key
    const key = import.meta.env.VITE_QWI_KEY
    // root url
    const rootUrl = 'https://api.census.gov/data/timeseries/qwi/sa'

    // Parameters for the API request
    const params = {
      key: key,
      get: 'Emp', // Indicator code for Employment Stability
      // Every metro and micro area in the state, or the counties asked for
      for: counties
        ? `county:${counties.join(',')}`
        : `metropolitan statistical area/micropolitan statistical area:*`,
      in: `state:${state}`, // FIPS code for the state
      // every quarter of the data window's years
      time: `from ${dataWindow.start} to ${dataWindow.end}`,
      // Each industry is its own `industry=` in the query, which the API
      // takes as "any of these"
      industry: [].concat(industries)
    }

    // Every parameter in the URL, a parameter with a list of values once for
    // each of them
    const query = Object.entries(params)
      .flatMap(([name, value]) => [].concat(value).map((one) => `${name}=${one}`))
      .join('&')
    const url = `${rootUrl}?${query}`

    // Log the key and URL for debugging purposes
    debug.log('QWI URL:', url)

    // Construct the URL for the API request
    // const url = `${rootUrl}?industry=${params.industry}&get=${params.get}&for=${params.for}&in=${params.in}&time=${params.time}&key=${key}`;

    // Use fetch to send a GET request to the API
    try {
      // Send the request
      // Tried a few times: the API fails now and then for no reason of the
      // request's own, and an industry lost here is missing from the game
      debug.log('Sending GET request to the API...')
      const response = await fetchWithRetries(url, { timeoutMs: CENSUS_ATTEMPT_TIMEOUT_MS })

      // Check if the request was successful
      if (!response.ok) {
        // print response status and reason why it failed
        const responseText = await response.text()
        console.error(`HTTP error! status: ${response.status} - ${responseText}`)

        // Log the error information before throwing the error
        const errorMessage = `HTTP error! status: ${response.status} - ${responseText}`
        console.error('About to throw an error with message:', errorMessage)

        throw new RequestError(errorMessage, response.status)
      }

      // skip this industry if there is nothing to process from the server
      // eg. 204 No Content
      if (response.status === 204) {
        return
      }

      // If it was, parse the response as JSON
      debug.log('Parsing response as JSON...')
      const jsonData = await response.json()

      // Process the data - Census API returns data as array of arrays
      // First row is headers, subsequent rows are data
      debug.log('Processing the data...')

      // The Census API uses a long column name for MSA codes - rename it for
      // easier access. A request for counties has none.
      const msaColumn = jsonData[0].indexOf(
        'metropolitan statistical area/micropolitan statistical area'
      )
      if (msaColumn >= 0) jsonData[0][msaColumn] = 'msa_code'

      // Transform from array-of-arrays to array-of-objects format
      // Input:  [["Emp", "msa_code", ...], ["100", "12345", ...], ...]
      // Output: [{Emp: "100", msa_code: "12345", ...}, ...]
      const convertedData = jsonData.map((arr) => {
        return arr.reduce((acc, val, i) => {
          acc[jsonData[0][i]] = val
          return acc
        }, {})
      })

      // Skip the header row (index 0) - it's now embedded as keys in each object
      data.value = convertedData.slice(1)
    } catch (err) {
      // Log any errors to the console
      console.error(`There was a problem with the fetch operation:`, err)
      const errorMessage = err.message || 'No error message available'
      console.error('Setting error value to:', errorMessage)
      error.value = errorMessage
      refused.value = isRefusal(err)
    }
  }

  return {
    data,
    error,
    refused,
    fetchQWI
  }
}
