/**
 * Town Matching (scripts/townMatching.mjs)
 *
 * The working parts of build-town-points.mjs: reading the Census Bureau's
 * lists of areas and the USGS's place names, finding each area's main city
 * among the places, and choosing the town's point.
 *
 * Pure functions over text and plain data, kept apart from the script so
 * they are tested without downloading anything.
 */

import { distance } from '@turf/turf'
import Papa from 'papaparse'

/** The kinds of row in those lists that are areas rather than their parts */
const AREA_KINDS = ['Metropolitan Statistical Area', 'Micropolitan Statistical Area']

/**
 * Connecticut, whose areas are now made of planning regions, where GNIS
 * still goes by its old counties. Its places are matched by state alone.
 */
const STATE_WITHOUT_COUNTIES = '09'

/** Decimal places coordinates are kept to: about 10 m */
const PLACES = 4

/**
 * Every area in some of the Census Bureau's lists, with its name and its
 * counties.
 * @param {Array<string>} texts - The lists as CSV, newest first: an area in
 *   two is taken as the newer draws it
 * @returns {Array<{code: string, name: string, counties: Set<string>}>} The
 *   areas, by code; each county as its five-digit FIPS code
 */
export function areasFromLists(texts) {
  const areas = new Map()
  texts.forEach((text) => {
    const { data } = Papa.parse(text, { header: true, skipEmptyLines: true })
    const listed = new Map()
    data
      .filter(({ LSAD }) => AREA_KINDS.includes(LSAD))
      .forEach(({ CBSA, NAME }) =>
        listed.set(CBSA, { code: CBSA, name: NAME, counties: new Set() })
      )
    data
      .filter(({ STCOU }) => STCOU)
      .forEach(({ CBSA, STCOU }) => listed.get(CBSA)?.counties.add(STCOU.padStart(5, '0')))
    listed.forEach((area, code) => {
      if (!areas.has(code)) areas.set(code, area)
    })
  })
  return [...areas.values()].sort((a, b) => a.code.localeCompare(b.code))
}

/**
 * A place's name boiled down for matching: no case, accents, spaces or
 * punctuation, and "Saint" written "St".
 * @param {string} name - The name
 * @returns {string} What to match by
 */
export function matchKey(name) {
  return name
    .normalize('NFD')
    .toLowerCase()
    .replace(/\bsaint\b/g, 'st')
    .replace(/\bsainte\b/g, 'ste')
    .replace(/[^a-z]/g, '')
}

/**
 * Every populated place in GNIS's national file, by state and name (see
 * `matchKey`).
 * @param {string} text - The file, pipe-separated with a header row
 * @returns {Map<string, Array<{lon: number, lat: number, county: string}>>}
 *   The places, by "06:sanfrancisco"
 * @throws {Error} When a column it reads is gone
 */
export function placesFromGnis(text) {
  const [header, ...lines] = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const columns = header.split('|')
  const column = (name) => {
    const index = columns.indexOf(name)
    if (index === -1) throw new Error(`GNIS no longer has a ${name} column`)
    return index
  }
  const name = column('feature_name')
  const kind = column('feature_class')
  const state = column('state_numeric')
  const county = column('county_numeric')
  const lat = column('prim_lat_dec')
  const lon = column('prim_long_dec')

  const places = new Map()
  lines.forEach((line) => {
    const cells = line.split('|')
    // A place GNIS has no point for is listed at 0, 0
    if (cells[kind] !== 'Populated Place' || !Number(cells[lat])) return
    const key = `${cells[state]}:${matchKey(cells[name])}`
    if (!places.has(key)) places.set(key, [])
    places.get(key).push({
      lon: Number(cells[lon]),
      lat: Number(cells[lat]),
      county: cells[state] + cells[county]
    })
  })
  return places
}

/**
 * The GNIS place that is an area's main city.
 * @param {Object} area - The area (see `areasFromLists`)
 * @param {Object} city - Its main city, from `findPrincipalCity`
 * @param {Array<string>} candidates - The names the city may go by
 * @param {Map<string, Array<Object>>} places - From `readPlaces`
 * @returns {{lon: number, lat: number}|null} The place, or null
 */
export function downtown(area, city, candidates, places) {
  // Besides the game's own names: GNIS has Boise for "Boise City", and
  // Honolulu for "Urban Honolulu"
  const [first] = candidates
  const names = [
    city.name,
    ...[...candidates].reverse(),
    first.replace(/ City$/, ''),
    first.replace(/^Urban /, '')
  ]
  for (const name of names) {
    const found = (places.get(`${city.stateFips}:${matchKey(name)}`) ?? []).filter(
      ({ county }) => city.stateFips === STATE_WITHOUT_COUNTIES || area.counties.has(county)
    )
    if (found.length === 0) continue
    const kmOff = ({ lon, lat }) => distance([lon, lat], [city.lon, city.lat])
    return found.reduce((best, place) => (kmOff(place) < kmOff(best) ? place : best))
  }
  return null
}

/**
 * A town's point: downtown, unless there is none or it falls outside the
 * state's outline, and then the Census Bureau's point for the city.
 * @param {{lon: number, lat: number}} city - The Census Bureau's point
 * @param {{lon: number, lat: number}|null} place - Downtown (see `downtown`)
 * @param {Function} isInState - The state's point test (see `regionTest` in
 *   src/composables/map/region.js)
 * @returns {{lat: number, lon: number, kept: string|null}} The point, rounded
 *   as the table has it; and why the Census point was kept, 'noMatch' or
 *   'outsideOutline', or null if it was not
 * @throws {Error} When neither point is in the state: the town would be
 *   left off every board, as San Francisco was (#180)
 */
export function choosePoint(city, place, isInState) {
  const round = (degrees) => Number(degrees.toFixed(PLACES))
  const fits = ({ lat, lon }) => isInState({ lat: round(lat), lng: round(lon) })
  const useDowntown = place !== null && fits(place)
  const point = useDowntown ? place : city
  if (!useDowntown && !fits(city)) {
    throw new Error(`No point inside the state for ${city.name}; it needs one picked by hand`)
  }
  const kept = useDowntown ? null : place ? 'outsideOutline' : 'noMatch'
  return { lat: round(point.lat), lon: round(point.lon), kept }
}
