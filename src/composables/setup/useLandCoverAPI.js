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
import { mapWithConcurrency } from '@/composables/utils'
import { gridApiConfig } from '@/config/grid'

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

      // Without this a throttled response falls through to the parse below and
      // is written off as a cell with no land cover, quietly shrinking the map.
      if (!response.ok) {
        throw new Error(`Land cover API responded ${response.status}`)
      }

      const data = await response.json()
      const cost = nlcdCostMap[data.features[0].properties['PALETTE_INDEX']]
      return cost ?? null
    } catch (error) {
      console.error('Error fetching land cover data:', error)
      return null
    }
  }

  /**
   * Fetches land cover for many locations with a bounded number of requests in
   * flight, paced so NLCD is not hit in bursts.
   *
   * @param {Array} locations - Array of location objects {lat, lng}.
   * @param {Function} [onProgress] - Called with (completed, total) after each cell.
   * @returns {Promise<Array<number|null>>} Costs in location order; null where the lookup failed.
   */
  function fetchLandCoverInBatches(locations, onProgress = null) {
    return mapWithConcurrency(locations, (location) => fetchLandCover(location), {
      concurrency: gridApiConfig.landCoverConcurrency,
      minIntervalMs: gridApiConfig.landCoverMinIntervalMs,
      onProgress
    })
  }

  return {
    fetchLandCover,
    fetchLandCoverInBatches
  }
}
