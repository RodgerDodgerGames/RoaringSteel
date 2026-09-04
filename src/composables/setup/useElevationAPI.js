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
import { gridApiConfig } from '@/config/grid'

/**
 * Composable for batch fetching elevation data.
 *
 * @returns {Object} { fetchElevationsInBatches }
 */
export function useElevationAPI() {
  const apiUrl = 'https://api.open-elevation.com/api/v1/lookup'

  /**
   * Fetches elevation data for multiple locations in one request.
   *
   * Always resolves to exactly `locations.length` entries so the caller can
   * line results up with the locations it asked for. Positions the API did
   * not answer for are `null`, which reads as "unknown" rather than being
   * confused with a real sea-level reading of 0.
   *
   * @param {Array} locations - An array of location objects {lat, lng}.
   * @returns {Promise<Array<{elevation: number}|null>>} One entry per location.
   */
  async function fetchElevationBatch(locations) {
    const locationString = locations.map((loc) => `${loc.lat},${loc.lng}`).join('|')
    const url = `${apiUrl}?locations=${encodeURIComponent(locationString)}`

    try {
      const response = await fetch(url)

      // A rate-limited or failing response still parses as JSON, just without
      // a `results` array. Checking status first keeps that from being read as
      // a successful lookup.
      if (!response.ok) {
        throw new Error(`Elevation API responded ${response.status}`)
      }

      const data = await response.json()
      const results = Array.isArray(data?.results) ? data.results : []

      // Pad or trim to the requested length. A short response would otherwise
      // shift every later location onto the wrong grid cell.
      return locations.map((_, index) => results[index] ?? null)
    } catch (error) {
      console.error('Error fetching elevation data:', error)
      return locations.map(() => null)
    }
  }

  /**
   * Splits large location arrays into smaller batches to avoid URL length limits.
   *
   * @param {Array} locations - Array of location objects {lat, lng}.
   * @param {Number} batchSize - Number of locations per request (URL size limit).
   * @param {Function} [onProgress] - Called with (completed, total) after each batch.
   * @returns {Promise<Array<{elevation: number}|null>>} One entry per location.
   */
  async function fetchElevationsInBatches(locations, batchSize = 100, onProgress = null) {
    const elevationResults = []

    for (let i = 0; i < locations.length; i += batchSize) {
      // Pace requests apart, but don't make the player wait before the first one.
      if (i > 0) {
        await waitRandomly(gridApiConfig.elevationPauseMinMs, gridApiConfig.elevationPauseMaxMs)
      }

      const batch = locations.slice(i, i + batchSize)
      elevationResults.push(...(await fetchElevationBatch(batch)))

      if (onProgress) onProgress(elevationResults.length, locations.length)
    }

    return elevationResults
  }

  return {
    fetchElevationsInBatches
  }
}
