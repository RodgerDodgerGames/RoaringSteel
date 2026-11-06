/**
 * Build Water Data (scripts/build-water-data.mjs)
 *
 * Writes public/data/water.json: the rivers, lakes, sea and named bays the
 * game builds over and draws, trimmed from Natural Earth's 10m physical
 * vectors (https://www.naturalearthdata.com, public domain) to the parts of
 * the world a board can be on.
 *
 * Run it by hand when the water data should change — never at game time:
 *
 *   node scripts/build-water-data.mjs
 *
 * It downloads the Natural Earth files from their GitHub repository at a
 * fixed release, so running it again gives the same file. Players never
 * fetch Natural Earth; they get the trimmed file with the game.
 *
 * Why Natural Earth: it is drawn for maps at about 1:10,000,000, so it has
 * only the big rivers and lakes — a few dozen rivers in a state like
 * Colorado. That is on purpose: water should shape a board without
 * dominating it, as Empire Builder's handful of rivers does. (Water data was
 * compared on 2026-11-05; see the "Task 4 research" tab of the playtest
 * follow-up plan.)
 *
 * What it keeps, each a GeoJSON FeatureCollection:
 * - `rivers`: river lines from the main rivers file and the North America
 *   supplement. Lines through lakes ("Lake Centerline") are left out: a
 *   lake is crossed as a lake, not as a river.
 * - `lakes`: lake and reservoir outlines, from the main lakes file and the
 *   North America supplement.
 * - `sea`: the ocean, as polygons.
 * - `bays`: a label point for each named bay, sound and gulf, for the map's
 *   labels only (the water itself is in `sea`).
 *
 * Every feature keeps only what the game reads: its `name` (a river's with
 * "River" added where Natural Earth leaves it off, see `riverName`), its `rank`
 * (Natural Earth's `scalerank`: lower is more important), and its `label`
 * (Natural Earth's `min_label`: the web-map zoom from which its name is
 * worth showing). Coordinates are rounded to 4 decimal places, about 10 m,
 * far finer than the board's smallest cells (250 m).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bboxClip, bbox, pointOnFeature } from '@turf/turf'

/** The Natural Earth release the data is taken from */
const RELEASE = 'v5.1.2'
const SOURCE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${RELEASE}/geojson`

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const STATES_FILE = path.join(ROOT, 'public/data/us-states.geojson')
const OUT_FILE = path.join(ROOT, 'public/data/water.json')

/**
 * How far past a group of states' outlines the data reaches, in degrees.
 * A board's grid covers its state's bounding box (see stores/grid.js), so
 * water just outside the state — a bay, a border lake — is on the board,
 * and a little more is drawn at the edge of the map.
 */
const MARGIN_DEGREES = 1

/** Decimal places coordinates are kept to: about 10 m */
const PLACES = 4

/**
 * The states, grouped into the separate parts of the country a board can
 * be in. Each group gets one box: the lower 48 (and DC) share one, and
 * Alaska, Hawaii and Puerto Rico get their own, so the sea between them —
 * most of the Pacific — is not kept.
 */
const GROUPS = {
  Alaska: ['Alaska'],
  Hawaii: ['Hawaii'],
  'Puerto Rico': ['Puerto Rico']
}

/**
 * A river's name as the map should show it. Natural Earth names most rivers
 * bare — "Arkansas", "Colorado" — which on a map of a state reads as the
 * name of a state, so "River" is added to any name that has no word for
 * running water in it already ("Rio Grande", "Bear Creek", "Platte River").
 * @param {string|null} name - Natural Earth's name
 * @returns {string|null} The name to show, or null for an unnamed river
 */
function riverName(name) {
  if (!name) return null
  return /\b(river|creek|rio|run|fork|branch|brook|bayou|canal|wash|water)\b/i.test(name)
    ? name
    : `${name} River`
}

/**
 * Fetches one Natural Earth file.
 * @param {string} name - Its name, e.g. "ne_10m_lakes"
 * @returns {Promise<Object>} The FeatureCollection
 */
async function download(name) {
  const response = await fetch(`${SOURCE}/${name}.geojson`)
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
  const data = await response.json()
  console.log(`${name}: ${data.features.length} features`)
  return data
}

/**
 * The box each group of states reaches, [west, south, east, north].
 *
 * Only the parts of an outline west of the date line count: Alaska's
 * Aleutian Islands run past it to positive longitudes, and counting those
 * would stretch Alaska's box around the whole world.
 *
 * @param {Object} states - The states' outlines (FeatureCollection)
 * @returns {Array<Array<number>>} The boxes
 */
function groupBoxes(states) {
  const groupOf = (name) =>
    Object.keys(GROUPS).find((group) => GROUPS[group].includes(name)) ?? 'Lower 48'
  const boxes = new Map()
  states.features.forEach((state) => {
    const group = groupOf(state.properties.NAME)
    const parts =
      state.geometry.type === 'Polygon' ? [state.geometry.coordinates] : state.geometry.coordinates
    parts
      .filter((polygon) => polygon[0].every(([lng]) => lng <= 0))
      .forEach((polygon) => {
        const [west, south, east, north] = bbox({ type: 'Polygon', coordinates: polygon })
        const box = boxes.get(group) ?? [Infinity, Infinity, -Infinity, -Infinity]
        boxes.set(group, [
          Math.min(box[0], west),
          Math.min(box[1], south),
          Math.max(box[2], east),
          Math.max(box[3], north)
        ])
      })
  })
  return [...boxes.values()].map(([west, south, east, north]) => [
    west - MARGIN_DEGREES,
    south - MARGIN_DEGREES,
    Math.min(east + MARGIN_DEGREES, 180),
    north + MARGIN_DEGREES
  ])
}

/**
 * Coordinates rounded to `PLACES`, with points that round onto the one
 * before them dropped.
 * @param {Array<Array<number>>} line - [lng, lat] points
 * @returns {Array<Array<number>>} The rounded points
 */
function roundLine(line) {
  const factor = 10 ** PLACES
  const rounded = []
  line.forEach(([lng, lat]) => {
    const point = [Math.round(lng * factor) / factor, Math.round(lat * factor) / factor]
    const last = rounded.at(-1)
    if (!last || last[0] !== point[0] || last[1] !== point[1]) rounded.push(point)
  })
  return rounded
}

/**
 * A feature's geometry cut to one box and rounded, as a list of simple parts
 * (LineStrings or Polygons). Parts left with too few points to be a line or
 * a ring — a sliver at the box's edge — are dropped.
 * @param {Object} feature - A GeoJSON Feature
 * @param {Array<number>} box - [west, south, east, north]
 * @returns {Array<Object>} The parts' geometries
 */
function clippedParts(feature, box) {
  const { geometry } = bboxClip(feature, box)
  if (!geometry) return []
  if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
    const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates
    return lines
      .map(roundLine)
      .filter((line) => line.length >= 2)
      .map((coordinates) => ({ type: 'LineString', coordinates }))
  }
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons
    .map((rings) => rings.map(roundLine).filter((ring) => ring.length >= 4))
    .filter((rings) => rings.length > 0)
    .map((coordinates) => ({ type: 'Polygon', coordinates }))
}

/**
 * Every part of some features inside the boxes, one Feature per part, with
 * the properties the game reads.
 * @param {Array<Object>} features - Natural Earth features
 * @param {Array<Array<number>>} boxes - See `groupBoxes`
 * @param {Function} [nameOf] - Turns Natural Earth's name into the one kept
 * @returns {Array<Object>} The trimmed features
 */
function trim(features, boxes, nameOf = (name) => name ?? null) {
  return features
    .filter((feature) => feature.geometry)
    .flatMap((feature) => {
      const properties = {
        name: nameOf(feature.properties.name),
        rank: feature.properties.scalerank,
        label: feature.properties.min_label
      }
      return boxes.flatMap((box) =>
        clippedParts(feature, box).map((geometry) => ({ type: 'Feature', properties, geometry }))
      )
    })
}

/**
 * A label point for each named bay, sound and gulf with any of itself
 * inside the boxes: a point inside its outline, cut to the box.
 * @param {Array<Object>} features - Natural Earth's marine areas
 * @param {Array<Array<number>>} boxes - See `groupBoxes`
 * @returns {Array<Object>} Point features
 */
function bayLabels(features, boxes) {
  return trim(features, boxes)
    .filter(({ properties }) => properties.name)
    .map((feature) => ({
      type: 'Feature',
      properties: feature.properties,
      geometry: {
        type: 'Point',
        coordinates: roundLine([pointOnFeature(feature).geometry.coordinates])[0]
      }
    }))
}

/** Builds the file */
async function main() {
  const states = JSON.parse(fs.readFileSync(STATES_FILE, 'utf8'))
  const boxes = groupBoxes(states)

  const [rivers, riversNA, lakes, lakesNA, ocean, marine] = await Promise.all(
    [
      'ne_10m_rivers_lake_centerlines',
      'ne_10m_rivers_north_america',
      'ne_10m_lakes',
      'ne_10m_lakes_north_america',
      'ne_10m_ocean',
      'ne_10m_geography_marine_polys'
    ].map(download)
  )

  const isRiver = ({ properties }) => properties.featurecla !== 'Lake Centerline'
  const collection = (features) => ({ type: 'FeatureCollection', features })
  const water = {
    source: `Natural Earth 10m physical vectors, ${RELEASE}`,
    rivers: collection(
      trim([...rivers.features, ...riversNA.features].filter(isRiver), boxes, riverName)
    ),
    lakes: collection(trim([...lakes.features, ...lakesNA.features], boxes)),
    sea: collection(trim(ocean.features, boxes)),
    bays: collection(bayLabels(marine.features, boxes))
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(water))
  const counts = ['rivers', 'lakes', 'sea', 'bays'].map(
    (part) => `${water[part].features.length} ${part}`
  )
  console.log(`Wrote ${OUT_FILE}: ${counts.join(', ')}, ${fs.statSync(OUT_FILE).size} bytes`)
}

await main()
