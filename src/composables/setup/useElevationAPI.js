/**
 * Elevation API Composable (useElevationAPI.js)
 *
 * Fetches elevation data from the Open-Elevation API.
 * Used to determine terrain difficulty for railroad building costs.
 *
 * API: https://api.open-elevation.com/api/v1/lookup
 * No API key required (public API)
 *
 * @module composables/setup/useElevationAPI
 */

import { waitRandomly } from '@/composables/utils'

/**
 * Composable for batch fetching elevation data.
 *
 * @returns {Object} { fetchElevationsInBatches }
 */
export function useElevationAPI() {
  const apiUrl = 'https://api.open-elevation.com/api/v1/lookup'

  /**
   * Fetches elevation data for multiple locations (batch requests).
   * @param {Array} locations - An array of location objects {lat, lng}.
   * @returns {Array} - Array of elevation results for each location.
   */
  async function fetchElevationBatch(locations) {
    const locationString = locations.map((loc) => `${loc.lat},${loc.lng}`).join('|')

    const url = `${apiUrl}?locations=${encodeURIComponent(locationString)}`
    console.log(`Fetching elevation data from: ${url}`)

    try {
      const response = await fetch(url)
      const data = await response.json()
      return data.results // Elevation results in order
    } catch (error) {
      console.error('Error fetching elevation data:', error)
      return locations.map(() => ({ elevation: 0 })) // Default to 0 elevation in case of error
    }
  }

  /**
   * Splits large location arrays into smaller batches to avoid URL length limits.
   * @param {Array} locations - Array of location objects {lat, lng}.
   * @param {Number} batchSize - Number of locations per request (URL size limit).
   */
  async function fetchElevationsInBatches(locations, batchSize = 100) {
    const elevationResults = []

    for (let i = 0; i < locations.length; i += batchSize) {
      const batch = locations.slice(i, i + batchSize)
      console.log(`Fetching batch ${i / batchSize + 1}...`)

      // Wait a random amount of time to avoid overloading the API
      await waitRandomly(500, 5000)

      const batchResults = await fetchElevationBatch(batch)
      elevationResults.push(...batchResults) // Append batch results
    }

    return elevationResults
  }

  return {
    fetchElevationsInBatches
  }
}
