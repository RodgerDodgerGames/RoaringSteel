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
import {
  latitudeDegreesToMeters,
  longitudeDegreesToMeters
} from '../src/composables/setup/useMapSupport.js'

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
 * The towns whose downtown GNIS lists where matching by name and county
 * would not find it, by area code: the name it has there, and its county.
 * Picked by hand, as a looser rule would risk the wrong place for the other
 * areas.
 */
const LISTED_AS = Object.freeze({
  // The town of Amherst; the Census Bureau calls it "Amherst Town"
  11200: { name: 'Amherst', county: '25015' },
  // Barnstable's town hall and main street are in its village of Hyannis,
  // not in its village of Barnstable
  12700: { name: 'Hyannis', county: '25001' },
  25720: { name: 'Heber City', county: '49051' },
  // The city is across the county line from most of its area
  26090: { name: 'Holland', county: '26139' },
  33180: { name: 'Middlesboro', county: '21013' },
  45880: { name: 'Pecos', county: '48389' }
})

/**
 * How far outside its state's outline a downtown may be and still be nudged
 * inside. The outlines are simplified by a kilometer or two: Laredo's is the
 * furthest out, at 1.7 km. Further than this is more likely a wrong place.
 */
const MAX_OUTSIDE_KM = 3

/**
 * How far inside the outline a nudged downtown is put: enough that rounding
 * cannot put it back outside, too little to see on a board.
 */
const INSET_KM = 0.05

/** How many directions are tried for the way in, where straight in is not */
const DIRECTIONS = 72

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
 * The GNIS place that is an area's main city: the one picked by hand for
 * the area (see `LISTED_AS`), or else the one of its name in its counties.
 * @param {Object} area - The area (see `areasFromLists`)
 * @param {Object} city - Its main city, from `findPrincipalCity`
 * @param {Array<string>} candidates - The names the city may go by
 * @param {Map<string, Array<Object>>} places - From `readPlaces`
 * @returns {{lon: number, lat: number}|null} The place, or null
 * @throws {Error} When GNIS no longer has the place picked by hand
 */
export function downtown(area, city, candidates, places) {
  const listed = LISTED_AS[area.code]
  if (listed) {
    const place = places
      .get(`${city.stateFips}:${matchKey(listed.name)}`)
      ?.find(({ county }) => county === listed.county)
    if (!place) throw new Error(`GNIS no longer has ${listed.name}, picked for area ${area.code}`)
    return place
  }

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
 * A point just outside a border moved to just inside it: to `INSET_KM` in
 * from the nearest point of the border. In is straight across the border
 * there, one way or the other — a point can be inside and still round to
 * outside — or, at a sharp corner, whichever direction does lead inside.
 *
 * Worked out with latitude and longitude as flat, longitude shrunk to
 * scale, since the region test takes a border's sides as straight in those.
 * Along a side a hundred kilometers long, the globe's shortest line strays
 * from that by more than the inset.
 *
 * @param {{lat: number, lon: number}} place - The point
 * @param {Array<Array<{lat: number, lng: number}>>} border - The border's
 *   rings (see `regionOutline` in src/composables/map/region.js)
 * @param {Function} fits - Whether a point will do: inside, once rounded
 * @returns {{lat: number, lon: number}|null} The point moved, or null if the
 *   border is further than `MAX_OUTSIDE_KM` or no way in was found
 */
function nudgedInside(place, border, fits) {
  const kmPerLat = latitudeDegreesToMeters(1) / 1000
  const kmPerLon = longitudeDegreesToMeters(1, place.lat) / 1000
  // A border point, in km east and north of the place
  const toKm = ({ lat, lng }) => [(lng - place.lon) * kmPerLon, (lat - place.lat) * kmPerLat]

  let nearest = null
  let nearestKm = Infinity
  border.forEach((ring) => {
    for (let i = 1; i < ring.length; i++) {
      const [x, y] = toKm(ring[i - 1])
      const [endX, endY] = toKm(ring[i])
      const [dx, dy] = [endX - x, endY - y]
      // The share of the way along the side to its point nearest the place
      const along = Math.max(0, Math.min(1, -(x * dx + y * dy) / (dx * dx + dy * dy || 1)))
      const point = [x + along * dx, y + along * dy]
      const km = Math.hypot(...point)
      if (km < nearestKm) {
        nearest = point
        nearestKm = km
      }
    }
  })
  if (!nearest || nearestKm > MAX_OUTSIDE_KM) return null

  const [east, north] = nearest
  // Straight on across the border, straight back from it, then all around
  const across = Math.atan2(north, east)
  const turns = Array.from({ length: DIRECTIONS }, (_, i) => (i * 2 * Math.PI) / DIRECTIONS)
  for (const turn of [0, Math.PI, ...turns]) {
    const moved = {
      lat: place.lat + (north + INSET_KM * Math.sin(across + turn)) / kmPerLat,
      lon: place.lon + (east + INSET_KM * Math.cos(across + turn)) / kmPerLon
    }
    if (fits(moved)) return moved
  }
  return null
}

/**
 * A town's point: downtown; or, for a downtown just outside the state's
 * outline, just inside it (see `nudgedInside`); or else the Census Bureau's
 * point for the city.
 * @param {{lon: number, lat: number}} city - The Census Bureau's point
 * @param {{lon: number, lat: number}|null} place - Downtown (see `downtown`)
 * @param {Function} isInState - The state's point test (see `regionTest` in
 *   src/composables/map/region.js)
 * @param {Array<Array<{lat: number, lng: number}>>} border - The state's
 *   border (see `regionOutline` there)
 * @returns {{lat: number, lon: number, note: string|null}} The point,
 *   rounded as the table has it; and 'nudged' if downtown was nudged,
 *   'noMatch' or 'outsideOutline' if the Census point was kept, else null
 * @throws {Error} When no point is in the state: the town would be left off
 *   every board, as San Francisco was (#180)
 */
export function choosePoint(city, place, isInState, border) {
  const round = (degrees) => Number(degrees.toFixed(PLACES))
  const fits = ({ lat, lon }) => isInState({ lat: round(lat), lng: round(lon) })
  const chosen = ({ lat, lon }, note) => ({ lat: round(lat), lon: round(lon), note })

  if (place) {
    if (fits(place)) return chosen(place, null)
    const nudged = nudgedInside(place, border, fits)
    if (nudged) return chosen(nudged, 'nudged')
  }
  if (fits(city)) return chosen(city, place ? 'outsideOutline' : 'noMatch')
  throw new Error(`No point inside the state for ${city.name}; it needs one picked by hand`)
}
