/**
 * Track Cost (trackCost.js)
 *
 * Prices a line of track from the grid cells it passes through. Each cell the
 * line crosses is charged once, at that cell's cost — the cell the line starts
 * in included — however many of the line's legs pass through it.
 *
 * A land cell's cost on the grid is its terrain cost: how hard its ground is
 * to build on (land cover plus slope, see stores/grid.js). What that comes to
 * in dollars depends on the board, because track is priced per speed unit
 * (see boardScale.js and `gameRules.trackPrice`): `trackPriceScale` works out
 * the dollars per point of terrain cost for a grid on a board, and pricing
 * multiplies by it.
 *
 * Water is the exception: a water cell is bridged, and its price is the
 * bridge's, which climbs with each water cell in a row (see water.js).
 *
 * The price depends only on where the line's vertices are, never on the path
 * the cursor took to get there. Pricing used to add a cell each time the
 * cursor entered one, so wandering out and back while placing a leg kept
 * adding cells the track would never cross, and the price only ever went up.
 *
 * Cells are named by their index in the grid (see cellGrid.js).
 *
 * Pure functions over plain data, so the rules can be tested without a map.
 *
 * @module composables/map/trackCost
 */

import { gridConfig } from '@/config/grid'
import { gameRules } from '@/config/game'
import { isWaterCell, bridgeCellCost } from '@/composables/map/water'
import { findCell } from '@/composables/map/cellGrid'
import {
  latitudeDegreesToMeters,
  longitudeDegreesToMeters
} from '@/composables/setup/useMapSupport'

/**
 * How far apart, in meters, the points a leg is checked at are spaced. A
 * quarter of a cell's width, so a leg can only miss a cell it barely clips the
 * corner of, while a long leg is still only a few hundred lookups.
 */
const SAMPLE_SPACING_METERS = gridConfig.cellSize / 4

/**
 * What one point of a land cell's terrain cost comes to in dollars, for this
 * grid on a board with this speed unit.
 *
 * A cell of open, level ground (terrain cost `openGroundCost`) is priced at
 * `perSpeedUnit` for every speed unit of its width; rougher ground costs more
 * in proportion to its terrain cost; and the tuning knob, `multiplier`,
 * scales the lot. So:
 *
 *   dollars per point = perSpeedUnit · multiplier / openGroundCost
 *                       · (cell width in km / speed unit in km)
 *
 * The cell's width is read off the grid itself, not the configured cell size,
 * so a grid saved with a game prices at its own size.
 *
 * @param {Object} grid - The grid (see cellGrid.js)
 * @param {number} speedUnitKm - The board's speed unit (see boardScale.js)
 * @returns {number} Dollars per point of terrain cost
 */
export function trackPriceScale(grid, speedUnitKm) {
  const { perSpeedUnit, openGroundCost, multiplier } = gameRules.trackPrice
  const cellKm = latitudeDegreesToMeters(grid.latStep) / 1000
  return ((perSpeedUnit * multiplier) / openGroundCost) * (cellKm / speedUnitKm)
}

/**
 * What track through one land cell costs, in whole dollars: its terrain cost
 * at the board's price scale.
 *
 * The terrain cost is capped at `maxTerrainFactor` times ordinary ground's,
 * as Empire Builder's dearest ground (alpine, 5) is five times its clear
 * ground (1). Without the cap the steepest cells cost many times a turn's
 * allowance, a wall no one could ever build across.
 *
 * Rounded per cell, so every price the game shows or charges is in whole
 * dollars, and the computer players' search (which adds up the same cells,
 * see botPathfinder.js) comes to the same sums.
 * @param {number} terrainCost - The cell's terrain cost
 * @param {number} priceScale - Dollars per point of terrain cost (see
 *   `trackPriceScale`)
 * @returns {number} Dollars
 */
export function landCellPrice(terrainCost, priceScale) {
  const { openGroundCost, maxTerrainFactor } = gameRules.trackPrice
  return Math.round(Math.min(terrainCost, maxTerrainFactor * openGroundCost) * priceScale)
}

/**
 * The distance between two points, in km. Measured on a flat projection —
 * longitude shrunk by the cosine of the latitude — which is close enough at
 * the scale of a few grid cells.
 * @param {{lat: number, lng: number}} a - A point
 * @param {{lat: number, lng: number}} b - Another point
 * @returns {number} Kilometers
 */
export function kmBetween(a, b) {
  const north = latitudeDegreesToMeters(b.lat - a.lat)
  const east = longitudeDegreesToMeters(b.lng - a.lng, a.lat)
  return Math.hypot(north, east) / 1000
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
  // Rough length, only used to decide how many points to take
  const steps = Math.max(1, Math.ceil((kmBetween(from, to) * 1000) / SAMPLE_SPACING_METERS))

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
 * @param {Object} grid - The grid
 * @returns {Array<number>} The cells crossed
 */
export function cellsAlongLine(latlngs, grid) {
  return [...new Set(cellPath(latlngs, grid))]
}

/**
 * The grid cells a line passes through, in the order it passes through them.
 * A cell the line comes back to later is listed again, so the path shows
 * where the line goes in and out of water; it is only listed once for as long
 * as the line stays in it.
 * @param {Array<{lat: number, lng: number}>} latlngs - The line's vertices
 * @param {Object} grid - The grid
 * @returns {Array<number>} The cells, in order along the line
 */
export function cellPath(latlngs, grid) {
  const path = []
  pointsAlongLine(latlngs).forEach((point) => {
    const cell = findCell(point, grid)
    if (cell !== -1 && cell !== path.at(-1)) path.push(cell)
  })
  return path
}

/**
 * What a line of track costs to build, and how much of that is bridges.
 *
 * Each land cell the line passes through adds its own cost, turned into
 * dollars by `priceScale` (see `trackPriceScale`). Each water cell
 * adds a bridge instead, priced by how far into its crossing it is: the line
 * is followed cell by cell (see `cellPath`), and the water cells it passes
 * through between one land cell and the next are one crossing.
 *
 * A land cell whose cost is missing (its terrain data failed to load) adds
 * nothing rather than making the whole line unpriceable.
 *
 * @param {Array<{lat: number, lng: number}>} latlngs - The line's vertices
 * @param {Object} grid - The grid
 * @param {number} priceScale - Dollars per point of terrain cost (see
 *   `trackPriceScale`)
 * @returns {{total: number, bridges: number}} The price, and the part of it
 *   that is bridges
 */
export function linePrice(latlngs, grid, priceScale) {
  let total = 0
  let bridges = 0
  // Cells already paid for: each is charged once, however often it is crossed
  const charged = new Set()
  // The water cells of the crossing the line is on, if it is on one
  const crossing = new Set()

  cellPath(latlngs, grid).forEach((cell) => {
    if (!isWaterCell(grid, cell)) {
      crossing.clear()
      const cost = grid.cost[cell]
      if (!charged.has(cell) && Number.isFinite(cost)) total += landCellPrice(cost, priceScale)
      charged.add(cell)
      return
    }
    crossing.add(cell)
    if (charged.has(cell)) return
    charged.add(cell)
    // Priced by how far into its crossing the cell is
    const bridge = bridgeCellCost(crossing.size)
    bridges += bridge
    total += bridge
  })
  return { total, bridges }
}
