/**
 * Track Cost (trackCost.js)
 *
 * Prices a line of track from the grid cells it passes through. Each cell the
 * line crosses is charged once, at that cell's cost — the cell the line starts
 * in included — however many of the line's legs pass through it.
 *
 * Water is the exception: a water cell is bridged, and its price is the
 * bridge's, which climbs with each water cell in a row (see water.js).
 *
 * The price depends only on where the line's vertices are, never on the path
 * the cursor took to get there. Pricing used to add a cell each time the
 * cursor entered one, so wandering out and back while placing a leg kept
 * adding cells the track would never cross, and the price only ever went up.
 *
 * Pure functions over plain data, so the rules can be tested without a map.
 *
 * @module composables/map/trackCost
 */

import { gridConfig } from '@/config/grid'
import { isWaterCell, bridgeCellCost } from '@/composables/map/water'
import {
  latitudeDegreesToMeters,
  longitudeDegreesToMeters,
  metersToLatitudeDegrees,
  metersToLongitudeDegrees
} from '@/composables/setup/useMapSupport'

/**
 * How far apart, in meters, the points a leg is checked at are spaced. A
 * quarter of a cell's width, so a leg can only miss a cell it barely clips the
 * corner of, while a long leg is still only a few hundred lookups.
 */
const SAMPLE_SPACING_METERS = gridConfig.cellSize / 4

/**
 * Finds the grid cell a point lies in: the one whose center is nearest.
 *
 * Distances are measured on a flat projection (longitude shrunk by the cosine
 * of the latitude) rather than over the globe. At the size of a grid cell the
 * difference is nothing, and it is cheap enough to run for every point of
 * every leg as the cursor moves.
 *
 * @param {{lat: number, lng: number}} latlng - The point
 * @param {Array<Object>} grid - Grid cells, each with a `centroid` {lat, lng}
 * @returns {Object|null} The nearest cell, or null for an empty grid
 */
export function findCell(latlng, grid) {
  const lngScale = Math.cos((latlng.lat * Math.PI) / 180)
  let closestCell = null
  let minDistance = Infinity
  grid.forEach((cell) => {
    const dLat = latlng.lat - cell.centroid.lat
    const dLng = (latlng.lng - cell.centroid.lng) * lngScale
    const distance = dLat * dLat + dLng * dLng
    if (distance < minDistance) {
      minDistance = distance
      closestCell = cell
    }
  })
  return closestCell
}

/**
 * The edges of a grid cell: half a cell's width each way from its center.
 * @param {Object} cell - Grid cell with a `centroid`
 * @returns {{south: number, west: number, north: number, east: number}} The
 *   cell's edges, in degrees
 */
export function cellBounds({ centroid: { lat, lng } }) {
  const halfSize = gridConfig.cellSize / 2
  const dLat = metersToLatitudeDegrees(halfSize)
  const dLng = metersToLongitudeDegrees(halfSize, lat)
  return { south: lat - dLat, west: lng - dLng, north: lat + dLat, east: lng + dLng }
}

/**
 * Points spaced along one straight leg, both ends included.
 * @param {{lat: number, lng: number}} from - Where the leg starts
 * @param {{lat: number, lng: number}} to - Where the leg ends
 * @returns {Array<{lat: number, lng: number}>} The points, in order
 */
function pointsAlongLeg(from, to) {
  const dLat = to.lat - from.lat
  const dLng = to.lng - from.lng
  // Rough length in meters, only used to decide how many points to take
  const lengthMeters = Math.hypot(
    latitudeDegreesToMeters(dLat),
    longitudeDegreesToMeters(dLng, from.lat)
  )
  const steps = Math.max(1, Math.ceil(lengthMeters / SAMPLE_SPACING_METERS))

  const points = []
  for (let i = 0; i <= steps; i++) {
    points.push({ lat: from.lat + (dLat * i) / steps, lng: from.lng + (dLng * i) / steps })
  }
  return points
}

/**
 * The points a line is checked at, a quarter of a cell apart along each leg,
 * every vertex included. Pricing and the build rules both look at the line
 * through these, so they always agree on where it goes.
 * @param {Array<{lat: number, lng: number}>} latlngs - The line's vertices
 * @returns {Array<{lat: number, lng: number}>} The points, in order
 */
export function pointsAlongLine(latlngs) {
  // A single vertex is a line that has only just started: it sits in one cell
  return latlngs.length === 1
    ? [latlngs[0]]
    : latlngs.slice(1).flatMap((to, i) => pointsAlongLeg(latlngs[i], to))
}

/**
 * Every grid cell a line passes through, each listed once, in the order the
 * line reaches them. The line is checked at points a quarter of a cell apart,
 * so a cell whose corner it clips by less than that may be left out.
 * @param {Array<{lat: number, lng: number}>} latlngs - The line's vertices
 * @param {Array<Object>} grid - Grid cells
 * @returns {Array<Object>} The cells crossed
 */
export function cellsAlongLine(latlngs, grid) {
  const cells = new Map()
  pointsAlongLine(latlngs).forEach((point) => {
    const cell = findCell(point, grid)
    if (cell && !cells.has(cell.id)) cells.set(cell.id, cell)
  })
  return [...cells.values()]
}

/**
 * What a line of track costs to build, and how much of that is bridges.
 *
 * Each land cell the line passes through adds its own cost. Each water cell
 * adds a bridge instead, priced by how far into its crossing it is: the line
 * is followed cell by cell, and a run of water cells is one crossing.
 *
 * A land cell whose cost is missing (its terrain data failed to load) adds
 * nothing rather than making the whole line unpriceable.
 *
 * @param {Array<{lat: number, lng: number}>} latlngs - The line's vertices
 * @param {Array<Object>} grid - Grid cells
 * @returns {{total: number, bridges: number}} The price, and the part of it
 *   that is bridges
 */
export function linePrice(latlngs, grid) {
  let total = 0
  let bridges = 0
  // How many water cells in a row the line has crossed so far
  let crossing = 0
  cellsAlongLine(latlngs, grid).forEach((cell) => {
    if (isWaterCell(cell)) {
      crossing += 1
      const bridge = bridgeCellCost(crossing)
      bridges += bridge
      total += bridge
      return
    }
    crossing = 0
    if (Number.isFinite(cell.cost)) total += cell.cost
  })
  return { total, bridges }
}

/**
 * What a line of track costs to build (see `linePrice`).
 * @param {Array<{lat: number, lng: number}>} latlngs - The line's vertices
 * @param {Array<Object>} grid - Grid cells
 * @returns {number} The price
 */
export function priceLine(latlngs, grid) {
  return linePrice(latlngs, grid).total
}
