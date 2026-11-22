/**
 * Build Town Points (scripts/build-town-points.mjs)
 *
 * Writes src/config/townPoints.json: where each metro and micro area's town
 * goes, by the area's code (see composables/setup/townPoints.js).
 *
 * Run it by hand when the government redraws its metro areas (every few
 * years; add the new release to `AREA_LISTS`) — never at game time:
 *
 *   node scripts/build-town-points.mjs
 *
 * It needs no key, but does need `unzip`, and takes about a minute.
 *
 * Why not the Census Bureau's point for each city: that point is only
 * promised to be inside the city limits. San Francisco's limits take in the
 * Farallon Islands, so its point is 54 km out to sea, off every board;
 * Anchorage's and Yuma's are out where nobody lives (#180). The U.S.
 * Geological Survey's place names (GNIS, public domain) mark a city's
 * original center instead: usually city hall, or the main intersection.
 *
 * For each area:
 * 1. Its main city is found just as the game would find it, with the game's
 *    own `findPrincipalCity`, so the town's name and state come out the same.
 * 2. The GNIS populated place of that name in one of the area's counties is
 *    taken: the nearest to the Census point, if several have the name. The
 *    counties tell San Francisco, California from San Francisco, Texas.
 * 3. The Census point is kept instead where no GNIS place matches by name
 *    and county (a few are there under another name, or across a county
 *    line: Heber City, Holland), or where downtown is just outside the
 *    state's outline as the game draws it. The
 *    outlines are simplified, so a downtown on a border river, like El
 *    Paso's, can fall outside and would be left off the board.
 *
 * Both the 2023 and the 2020 lists of areas are covered, as a state whose
 * jobs data runs behind is played from an older Census release, with that
 * release's areas (see useCensus.js): Michigan's ran to 2021 when this was
 * written. No area code changed its main city between the two, so one table
 * keyed by code serves both.
 *
 * Not covered, and looked up at game time: Puerto Rico, and the two areas
 * on the 2020 list whose main city TIGERweb no longer has by that name
 * (Pecos, TX and Fort Polk South, LA).
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runnerImport } from 'vite'
import { areasFromLists, choosePoint, downtown, placesFromGnis } from './townMatching.mjs'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const STATES_FILE = path.join(ROOT, 'public/data/us-states.geojson')
const OUT_FILE = path.join(ROOT, 'src/config/townPoints.json')

const POPEST_URL = 'https://www2.census.gov/programs-surveys/popest/datasets'

/**
 * The Census Bureau's lists of areas and their counties, newest first: an
 * area in both is taken as the newer draws it.
 */
const AREA_LISTS = [
  `${POPEST_URL}/2020-2023/metro/totals/cbsa-est2023-alldata.csv`,
  `${POPEST_URL}/2020-2022/metro/totals/cbsa-est2022.csv`
]

/** Every named place in the country, as pipe-separated text in a zip */
const GNIS_URL =
  'https://prd-tnm.s3.amazonaws.com/StagedProducts/GeographicNames/DomesticNames/DomesticNames_National_Text.zip'
const GNIS_FILE = 'Text/DomesticNames_National.txt'

/** How many areas' main cities are looked up at once */
const LOOKUPS_AT_ONCE = 6

/**
 * Loads one of the game's own modules, which import each other by "@/".
 * @param {string} file - Its path under src/
 * @returns {Promise<Object>} The module
 */
async function gameModule(file) {
  const src = path.join(ROOT, 'src')
  const { module } = await runnerImport(path.join(src, file), {
    logLevel: 'error',
    resolve: { alias: { '@': src } }
  })
  return module
}

/**
 * Downloads a file.
 * @param {string} url - Where it is
 * @returns {Promise<Buffer>} Its bytes
 */
async function download(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

/**
 * Downloads the lists of areas and reads them.
 * @returns {Promise<Array<Object>>} The areas (see `areasFromLists`)
 */
async function readAreas() {
  const texts = []
  // Latin-1, for names like Cañon City
  for (const url of AREA_LISTS) texts.push(new TextDecoder('latin1').decode(await download(url)))
  return areasFromLists(texts)
}

/**
 * Downloads GNIS's national file and reads its populated places.
 * @returns {Promise<Map<string, Array<Object>>>} The places (see `placesFromGnis`)
 */
async function readPlaces() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'town-points-'))
  try {
    const zip = path.join(folder, 'names.zip')
    fs.writeFileSync(zip, await download(GNIS_URL))
    const text = execFileSync('unzip', ['-p', zip, GNIS_FILE], {
      encoding: 'utf8',
      maxBuffer: 400 * 1024 * 1024
    })
    return placesFromGnis(text)
  } finally {
    fs.rmSync(folder, { recursive: true, force: true })
  }
}

/** Builds the table and writes it, saying which areas kept their Census point */
async function main() {
  const { findPrincipalCity, parseCbsaName, cityCandidates } = await gameModule(
    'composables/setup/useTigerWeb.js'
  )
  const { regionTest } = await gameModule('composables/map/region.js')
  const inState = new Map(
    JSON.parse(fs.readFileSync(STATES_FILE, 'utf8')).features.map((state) => [
      state.properties.STATE,
      regionTest(state)
    ])
  )
  const [areas, places] = await Promise.all([readAreas(), readPlaces()])
  console.log(`${areas.length} areas`)

  const rows = []
  const kept = { noMatch: [], outsideOutline: [], noCity: [] }
  for (let i = 0; i < areas.length; i += LOOKUPS_AT_ONCE) {
    const batch = areas.slice(i, i + LOOKUPS_AT_ONCE)
    const cities = await Promise.all(batch.map(({ name }) => findPrincipalCity(name)))
    batch.forEach((area, j) => {
      const city = cities[j]
      if (!city) {
        kept.noCity.push(area.name)
        return
      }
      const candidates = cityCandidates(parseCbsaName(area.name).cities)
      const place = downtown(area, city, candidates, places)
      const point = choosePoint(city, place, inState.get(city.stateFips))
      if (point.kept) kept[point.kept].push(area.name)
      const row = [point.lat, point.lon, city.name, city.stateFips]
      // One area to a line, spaced as Prettier would, so a rebuild's diff reads easily
      rows.push(`  "${area.code}": [${row.map((value) => JSON.stringify(value)).join(', ')}]`)
    })
  }

  fs.writeFileSync(OUT_FILE, `{\n${rows.join(',\n')}\n}\n`)
  console.log(`Wrote ${rows.length} towns to ${path.relative(ROOT, OUT_FILE)}`)
  console.log('Census point kept, no GNIS match:', kept.noMatch)
  console.log('Census point kept, downtown outside the outline:', kept.outsideOutline)
  console.log('Left to the game to look up, no main city found:', kept.noCity)
}

await main()
