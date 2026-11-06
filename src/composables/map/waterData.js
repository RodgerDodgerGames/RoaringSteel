/**
 * Water Data (waterData.js)
 *
 * Reads the game's water file, public/data/water.json (written by
 * scripts/build-water-data.mjs): Natural Earth's rivers, lakes, sea and named
 * bays for the whole country. A board only needs the water near it, so this
 * picks that out — for building the grid's water cells, for finding where
 * track crosses rivers (see water.js), and for drawing (see waterLayer.js).
 *
 * The file holds four GeoJSON FeatureCollections — `rivers` (lines),
 * `lakes` and `sea` (polygons) and `bays` (label points) — each feature
 * with its `name`, `rank` and `label` (see the script).
 *
 * Pure functions over plain data, so they can be tested without a server.
 *
 * @module composables/map/waterData
 */

import { bbox } from '@turf/turf'
import { riverIndex } from '@/composables/map/water'

/** The parts of the water file, each a FeatureCollection */
const PARTS = ['rivers', 'lakes', 'sea', 'bays']

/**
 * The water file made ready to search: every feature given its bounding box
 * (`bbox`, [west, south, east, north]), so the water near a board is found
 * without looking through every point of every river.
 * @param {Object} raw - The file as read
 * @returns {Object} The same data, each feature with its `bbox`
 */
export function prepareWaterData(raw) {
  PARTS.forEach((part) => {
    raw[part]?.features.forEach((feature) => {
      feature.bbox = bbox(feature)
    })
  })
  return raw
}

/**
 * The features of one part whose bounding box reaches into an area.
 * @param {Object|null} data - The water data (see `prepareWaterData`)
 * @param {string} part - 'rivers', 'lakes', 'sea' or 'bays'
 * @param {Array<number>} bounds - The area, [west, south, east, north]
 * @returns {Array<Object>} The features
 */
export function featuresIn(data, part, [west, south, east, north]) {
  return (data?.[part]?.features ?? []).filter(
    ({ bbox: box }) => box[0] <= east && box[2] >= west && box[1] <= north && box[3] >= south
  )
}

/**
 * A grid's rectangle, as [west, south, east, north].
 * @param {Object} grid - The grid (see cellGrid.js)
 * @returns {Array<number>} Its bounds
 */
export function gridBounds(grid) {
  return [
    grid.west,
    grid.south,
    grid.west + grid.cols * grid.lngStep,
    grid.south + grid.rows * grid.latStep
  ]
}

/**
 * The lake and sea outlines that reach into an area, as GeoJSON Polygon
 * coordinates, for working out which cells are water (see `waterCells`).
 * @param {Object|null} data - The water data
 * @param {Array<number>} bounds - [west, south, east, north]
 * @returns {Array<Array<Array<Array<number>>>>} Each polygon's rings
 */
export function waterPolygons(data, bounds) {
  return [...featuresIn(data, 'lakes', bounds), ...featuresIn(data, 'sea', bounds)].map(
    ({ geometry }) => geometry.coordinates
  )
}

/**
 * Each grid's rivers, indexed for finding crossings, kept so the index is
 * made once per grid rather than each time the build rules are worked out.
 * Held weakly, so a grid no longer in play is let go. Each entry remembers
 * the water data it was made from, and is made again from other data.
 * @type {WeakMap<Object, {data: Object, rivers: Object}>}
 */
const riverIndexes = new WeakMap()

/**
 * The rivers on a grid, indexed for finding where track crosses them (see
 * `riverIndex` in water.js), or null when there is no water data.
 * @param {Object|null} grid - The grid
 * @param {Object|null} data - The water data
 * @returns {Object|null} The index
 */
export function riversFor(grid, data) {
  if (!grid || !data) return null
  const kept = riverIndexes.get(grid)
  if (kept?.data === data) return kept.rivers
  const lines = featuresIn(data, 'rivers', gridBounds(grid)).map(
    ({ geometry }) => geometry.coordinates
  )
  const rivers = riverIndex(grid, lines)
  riverIndexes.set(grid, { data, rivers })
  return rivers
}
