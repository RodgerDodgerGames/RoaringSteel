/**
 * Land Cover API Composable (useLandCoverAPI.js)
 *
 * Fetches land cover data from the USGS National Land Cover Database (NLCD).
 * Uses WMS GetFeatureInfo requests to determine land cover type at a point.
 * Land cover types are mapped to building cost multipliers.
 *
 * API: https://www.mrlc.gov/geoserver (NLCD 2021 Land Cover)
 * Cost mapping: See @/config/nlcd.js for terrain cost values
 *
 * @module composables/setup/useLandCoverAPI
 */

import { nlcdCostMap } from '@/config/nlcd'

/**
 * Composable for fetching land cover data and converting to building costs.
 *
 * @returns {Object} { fetchLandCover, fetchLandCoverInBatches }
 */
export function useLandCoverAPI() {
  const landCoverApiUrl = 'https://www.mrlc.gov/geoserver/mrlc_display/NLCD_2021_Land_Cover_L48/ows'

  /**
   * Constructs the GetFeatureInfo URL to fetch land cover data for a given location.
   * @param {Object} location - The latitude and longitude of the location { lat, lng }.
   * @param {Object} bbox - The bounding box for the GetFeatureInfo request.
   * @param {Number} width - The pixel width of the map request.
   * @param {Number} height - The pixel height of the map request.
   * @param {Number} x - The pixel X-coordinate for the point of interest.
   * @param {Number} y - The pixel Y-coordinate for the point of interest.
   */
  function getFeatureInfoUrl(location, bbox, width, height, x, y) {
    const params = new URLSearchParams({
      SERVICE: 'WMS',
      VERSION: '1.3.0',
      REQUEST: 'GetFeatureInfo',
      LAYERS: 'mrlc_display:NLCD_2021_Land_Cover_L48',
      QUERY_LAYERS: 'mrlc_display:NLCD_2021_Land_Cover_L48',
      BBOX: `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`,
      WIDTH: width,
      HEIGHT: height,
      CRS: 'CRS:84',
      I: x, // X pixel
      J: y, // Y pixel
      INFO_FORMAT: 'application/json' // Response in JSON format
    })

    return `${landCoverApiUrl}?${params.toString()}`
  }

  /**
   * Fetches land cover data for a given location using GetFeatureInfo.
   * @param {Object} location - The latitude and longitude of the location { lat, lng }.
   * @returns {Promise<number|null>} The land cover cost or null on error.
   */
  async function fetchLandCover(location) {
    // Define a small bounding box around the point for the GetFeatureInfo query
    const bbox = {
      minLng: location.lng - 0.01,
      minLat: location.lat - 0.01,
      maxLng: location.lng + 0.01,
      maxLat: location.lat + 0.01
    }
    const width = 256
    const height = 256
    const x = Math.floor(width / 2)
    const y = Math.floor(height / 2)

    const url = getFeatureInfoUrl(location, bbox, width, height, x, y)

    try {
      const response = await fetch(url)
      const data = await response.json()
      const cost = nlcdCostMap[data.features[0].properties['PALETTE_INDEX']]
      return cost
    } catch (error) {
      console.error('Error fetching land cover data:', error)
      return null
    }
  }

  /**
   * Fetches land cover data for multiple locations in parallel batches.
   * @param {Array} locations - Array of location objects {lat, lng}.
   * @param {Number} batchSize - Number of concurrent requests per batch (default: 10).
   * @param {Function} onProgress - Optional callback called after each batch with (completed, total).
   * @returns {Promise<Array>} Array of land cover costs (or null for failed requests).
   */
  async function fetchLandCoverInBatches(locations, batchSize = 10, onProgress = null) {
    const results = []

    for (let i = 0; i < locations.length; i += batchSize) {
      const batch = locations.slice(i, i + batchSize)

      // Fetch all locations in this batch concurrently
      const batchResults = await Promise.all(batch.map((location) => fetchLandCover(location)))

      results.push(...batchResults)

      // Report progress after each batch
      if (onProgress) {
        onProgress(results.length, locations.length)
      }
    }

    return results
  }

  return {
    fetchLandCover,
    fetchLandCoverInBatches
  }
}
