/**
 * TigerWeb API Composable (useTigerWeb.js)
 *
 * Fetches geographic coordinates for MSAs from the Census Bureau's TIGERweb service.
 * TIGERweb provides CBSA (Core Based Statistical Area) boundary data including
 * internal point coordinates (centroid).
 *
 * API: https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/CBSA/MapServer
 *
 * @module composables/setup/useTigerWeb
 */

import {
  CENSUS_ATTEMPT_TIMEOUT_MS,
  fetchWithRetries,
  RequestError,
  RETRY_ATTEMPTS,
  RETRY_PAUSE_MS,
  wait
} from '@/composables/utils'

/**
 * Fetches the centroid coordinates for an MSA/CBSA.
 *
 * Metropolitan areas are on layer 3 and micropolitan areas on layer 4, so
 * layer 4 is asked only when layer 3 has no such area.
 *
 * Not finding the area is an answer, and returns false. A lookup that fails —
 * the server failing even after a few tries, or the connection — throws
 * instead, so the towns store can tell a town that does not exist from one
 * it could not look up.
 *
 * @param {string} cbsaCode - The CBSA code (e.g., "33460" for Minneapolis)
 * @returns {Promise<Object|false>} { centroidLongitude, centroidLatitude } or false if not found
 * @throws {RequestError} When the server fails or turns the query down
 * @throws {Error} When the connection fails
 */
export default async function getMSALatLon(cbsaCode) {
  const baseUrl = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/CBSA/MapServer/{layerID}/query`
  const layerIDs = [3, 4]
  const params = new URLSearchParams({
    where: `CBSA='${cbsaCode}'`,
    outFields: 'INTPTLON,INTPTLAT',
    f: 'json',
    returnGeometry: false
  })

  for (const layerID of layerIDs) {
    const data = await queryLayer(`${baseUrl.replace('{layerID}', layerID)}?${params.toString()}`)
    if (data.features && data.features.length > 0) {
      const { INTPTLON, INTPTLAT } = data.features[0].attributes
      return { centroidLongitude: INTPTLON, centroidLatitude: INTPTLAT }
    }
  }

  return false
}

/**
 * Runs one layer query and returns the server's answer.
 *
 * The server (ArcGIS) reports a query it could not run as a success carrying
 * an error, with the HTTP status it would have sent in the error's `code`.
 * So the answer is read before it can be judged: a 5xx code is the server
 * failing, and is tried again as `fetchWithRetries` tries a 5xx status; any
 * other code is the query turned down, and is not.
 *
 * @param {string} url - Query URL
 * @returns {Promise<Object>} The answer, with `features`
 * @throws {RequestError} When the server fails or turns the query down
 * @throws {Error} When the connection fails
 */
async function queryLayer(url) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetchWithRetries(url, { timeoutMs: CENSUS_ATTEMPT_TIMEOUT_MS })
    if (!response.ok) {
      throw new RequestError(`TIGERweb lookup failed: ${response.status}`, response.status)
    }

    const data = await response.json()
    if (!data.error) return data

    // An error without a code is taken as a refusal: nothing says it would pass
    const { code, message } = data.error
    if (!(code >= 500) || attempt === RETRY_ATTEMPTS) {
      throw new RequestError(`TIGERweb query failed: ${code} ${message}`, code)
    }
    await wait(RETRY_PAUSE_MS)
  }
}
