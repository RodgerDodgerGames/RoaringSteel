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
import { fetchWithTimeout } from '@/composables/utils'

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
   * Tries the release ending at the data window's last year first, then each
   * year before it, down to the window's first year. The API answers 404 for
   * a release it does not have.
   *
   * @returns {Promise<void>}
   */
  const fetchPopulationData = async () => {
    try {
      let response = null
      for (let year = dataWindow.end; year >= dataWindow.start; year--) {
        const url = setupRequest(year)
        console.log('Fetching population data:', url)
        response = await fetchWithTimeout(url)
        if (response.status !== 404) break
        console.log(`No ACS 5-year release for ${year} yet`)
      }
      if (response.status === 404) {
        throw new Error(
          `No ACS 5-year release from ${dataWindow.start} to ${dataWindow.end} is published`
        )
      }

      const censusData = await response.json()
      console.log('Census data:', censusData)

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
      console.log('Population data:', populationData.value)
    } catch (error) {
      console.error('Error fetching population data:', error)
    }
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
      for: 'metropolitan statistical area/micropolitan statistical area (or part):*',
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
