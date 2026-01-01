/**
 * Census API Composable (useCensus.js)
 *
 * Fetches population data from the US Census Bureau's American Community Survey (ACS).
 * Uses the 5-year estimates for MSA/Micropolitan area population counts.
 *
 * API: https://api.census.gov/data/2022/acs/acs5
 * Requires: VITE_QWI_KEY environment variable
 *
 * @module composables/setup/useCensus
 */

import { ref } from 'vue'

/**
 * Composable for fetching Census population data by state.
 *
 * @param {string} state - Two-digit state FIPS code (e.g., "27" for Minnesota)
 * @returns {Object} { populationData, fetchPopulationData }
 */
export default function useCensus(state) {
  const populationData = ref([])

  // api key
  const key = import.meta.env.VITE_QWI_KEY
  // root url
  const rootUrl = 'https://api.census.gov/data/2022/acs/acs5'

  /**
   * Fetches population data for all MSAs in the specified state.
   * Results are stored in populationData ref.
   *
   * @returns {Promise<void>}
   */
  const fetchPopulationData = async () => {
    const url = setupRequest()

    try {
      console.log('Fetching population data...')
      console.log('URL:', url)

      const response = await fetch(url)
      console.log('Response:', response)

      const censusData = await response.json()
      console.log('Census data:', censusData)

      // Census API returns array-of-arrays with header row first
      // Example: [["NAME", "B01001_001E", "state", "msa"], ["Minneapolis...", "3500000", "27", "33460"], ...]
      // Remove the header row since we'll destructure by position
      censusData.shift()

      // Transform array data to named object properties
      // B01001_001E is the Census variable code for total population
      populationData.value = censusData.map(([name, population, state_code, msa_code]) => ({
        name,           // Full MSA name (e.g., "Minneapolis-St. Paul-Bloomington, MN-WI")
        population,     // Total population count
        state_code,     // State FIPS code
        msa_code        // Metropolitan Statistical Area code
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

  // setup API request
  // example:
  // https://api.census.gov/data/2022/acs/acs5?get=NAME,B01001_001E&for=metropolitan%20statistical%20area/micropolitan%20statistical%20area%20(or%20part):*&in=state:06
  function setupRequest() {
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
