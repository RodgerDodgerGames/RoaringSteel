// Land Cover API

import { nlcdCostMap } from '@/config/nlcd'

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
   */
  async function fetchLandCover(location) {
    console.log(`Fetching land cover data for location: ${location.lat}, ${location.lng}`)

    // Define a small bounding box around the point for the GetFeatureInfo query
    const bbox = {
      minLng: location.lng - 0.01,
      minLat: location.lat - 0.01,
      maxLng: location.lng + 0.01,
      maxLat: location.lat + 0.01
    }
    const width = 256 // Example map width
    const height = 256 // Example map height
    const x = Math.floor(width / 2) // Center pixel
    const y = Math.floor(height / 2) // Center pixel

    const url = getFeatureInfoUrl(location, bbox, width, height, x, y)
    console.log(`Constructed GetFeatureInfo URL: ${url}`)

    try {
      const response = await fetch(url)
      const data = await response.json()
      console.log('Received land cover data:', data)
      // convert to cost using class map
      // just grab first feature
      const cost = nlcdCostMap[data.features[0].properties['PALETTE_INDEX']]
      return cost
    } catch (error) {
      console.error('Error fetching land cover data:', error)
      return null // Return null in case of error
    }
  }

  return {
    fetchLandCover
  }
}
