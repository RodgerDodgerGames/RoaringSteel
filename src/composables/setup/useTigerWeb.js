/**
 * TigerWeb API Composable (useTigerWeb.js)
 *
 * Finds where each town goes on the map, from the Census Bureau's TIGERweb
 * service.
 *
 * A town is a metro or micro area (an MSA, or CBSA): a city and the whole
 * counties around it. The town is put at its main city — the first city in
 * the area's name, "Boston" in "Boston-Cambridge-Newton, MA-NH" — at the
 * point the Census Bureau gives for that city (see `findPrincipalCity`). The
 * middle of the whole area, which is where towns used to go, can be far from
 * any city: Boston's was out west of the city, and an area that spreads into
 * a neighboring state can have its middle in that state. When the city
 * cannot be found, the area's middle is used after all (see `getMSALatLon`).
 *
 * APIs:
 * - Places (cities, towns and census designated places):
 *   https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer
 * - Metro and micro areas:
 *   https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/CBSA/MapServer
 *
 * @module composables/setup/useTigerWeb
 */

import usStates from '@/config/usStates'
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

/** The places service: layer 18 is incorporated places, 19 census designated places */
const PLACES_URL =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/{layerID}/query'
const PLACE_LAYERS = [18, 19]

/**
 * The cities and states in a metro or micro area's name, as the Census
 * Bureau writes it: "Boston-Cambridge-Newton, MA-NH Metro Area (part);
 * Massachusetts" lists the cities Boston, Cambridge and Newton, and the
 * states MA and NH, the main city's state first.
 * @param {string} name - The area's name
 * @returns {{cities: Array<string>, states: Array<string>}} Its cities, and
 *   its states' postal abbreviations, in the order named
 */
export function parseCbsaName(name) {
  const [citiesPart = '', rest = ''] = name.split(', ')
  const [statesPart = ''] = rest.split(' ')
  return {
    cities: citiesPart.split('-').filter(Boolean),
    states: statesPart.split('-').filter(Boolean)
  }
}

/**
 * The names the main city may go by, longest last. A hyphen in an area's
 * name usually separates two cities, but some cities have one in their own
 * name: in "Winston-Salem, NC" the city is Winston-Salem, not Winston. So
 * the first one, two and three pieces are all tried. A slash joins a city to
 * its county ("Louisville/Jefferson County"), so the part before it is
 * tried too.
 * @param {Array<string>} cities - The area's cities (see `parseCbsaName`)
 * @returns {Array<string>} The names to try
 */
export function cityCandidates(cities) {
  const joined = [1, 2, 3]
    .filter((n) => n <= cities.length)
    .map((n) => cities.slice(0, n).join('-'))
  const beforeSlash = cities[0]?.split('/')[0]
  return [...new Set([beforeSlash, ...joined].filter(Boolean))]
}

/**
 * The best of the places found for a main city, in one state: the one whose
 * name is the longest of the candidates, if any is named exactly so;
 * otherwise the first whose name starts with the city's name (Nashville's
 * place is named "Nashville-Davidson metropolitan government (balance)").
 * @param {Array<Object>} places - The places found, with BASENAME
 * @param {Array<string>} candidates - From `cityCandidates`
 * @returns {Object|null} The place, or null if none will do
 */
export function pickPlace(places, candidates) {
  return exactPlace(places, candidates) ?? prefixPlace(places, candidates)
}

/**
 * The place named exactly as one of the candidates, the longest first.
 * @param {Array<Object>} places - The places found, with BASENAME
 * @param {Array<string>} candidates - From `cityCandidates`
 * @returns {Object|null} The place, or null
 */
function exactPlace(places, candidates) {
  return (
    [...candidates]
      .reverse()
      .map((name) => places.find((place) => place.BASENAME === name))
      .find(Boolean) ?? null
  )
}

/**
 * The first place whose name starts with the city's.
 * @param {Array<Object>} places - The places found, with BASENAME
 * @param {Array<string>} candidates - From `cityCandidates`
 * @returns {Object|null} The place, or null
 */
function prefixPlace(places, candidates) {
  return places.find((place) => place.BASENAME.startsWith(candidates[0])) ?? null
}

/**
 * Finds a metro or micro area's main city: the first city in its name. The
 * main city's state is named first, so the states are tried in the order
 * named. Incorporated places and census designated places (which some main
 * cities are: Urban Honolulu) are both searched, every named state at once,
 * one request each.
 *
 * A place named exactly as the city, in any of the named states, is taken
 * before one whose name only starts with it (see `pickPlace`), so a main
 * city that is a census designated place is not passed over for an
 * incorporated place whose name merely begins the same way.
 *
 * @param {string} cbsaName - The area's name, as the Census Bureau writes it
 * @returns {Promise<{lon: number, lat: number, name: string, stateFips: string}|null>}
 *   Where the city is, its name (as the place is named, when exactly so;
 *   otherwise as the area names it) and its state's FIPS code; null if no
 *   such place is found
 * @throws {RequestError} When the server fails or turns the query down
 * @throws {Error} When the connection fails
 */
export async function findPrincipalCity(cbsaName) {
  const { cities, states } = parseCbsaName(cbsaName)
  const candidates = cityCandidates(cities)
  const stateCodes = states
    .map((abbr) => usStates.find((state) => state.abbr === abbr)?.fips)
    .filter(Boolean)
  if (candidates.length === 0 || stateCodes.length === 0) return null

  // Quotes doubled, as SQL wants them, for a name like Coeur d'Alene
  const quoted = (name) => `'${name.replaceAll("'", "''")}'`
  const where =
    `STATE IN (${stateCodes.map(quoted).join(',')}) AND ` +
    `(BASENAME IN (${candidates.map(quoted).join(',')}) OR BASENAME LIKE ${quoted(`${candidates[0]}%`)})`
  const params = new URLSearchParams({
    where,
    outFields: 'BASENAME,STATE,INTPTLON,INTPTLAT',
    f: 'json',
    returnGeometry: false
  })
  const places = []
  for (const layerID of PLACE_LAYERS) {
    const data = await queryLayer(`${PLACES_URL.replace('{layerID}', layerID)}?${params}`)
    places.push(...(data.features ?? []).map((feature) => feature.attributes))
  }

  // Each state in turn: an exact name anywhere first, then a near one
  const inState = (stateFips) => places.filter((place) => place.STATE === stateFips)
  for (const pick of [exactPlace, prefixPlace]) {
    for (const stateFips of stateCodes) {
      const place = pick(inState(stateFips), candidates)
      if (place) {
        return {
          lon: parseFloat(place.INTPTLON),
          lat: parseFloat(place.INTPTLAT),
          name: candidates.includes(place.BASENAME) ? place.BASENAME : candidates[0],
          stateFips
        }
      }
    }
  }
  return null
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
