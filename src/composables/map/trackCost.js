/**
 * Track Cost (trackCost.js)
 *
 * Prices a line of track from the grid cells it passes through. Each cell the
 * line crosses is charged once, at that cell's cost — the cell the line starts
 * in included — however many of the line's legs pass through it.
 *
 * A land cell's price comes from its terrain cost: how hard its ground is to
 * build on, which has two parts — its land cover and its slope (see
 * stores/grid.js) — each weighed by its own tuning knob (`terrainCost`).
 * What that comes to in dollars depends on the board, because track is
 * priced per speed unit (see boardScale.js and `gameRules.trackPrice`):
 * `trackPriceScale` works out the dollars per point of terrain cost for a
 * grid on a board, and pricing multiplies by it.
 *
 * Water is the exception (see water.js): a lake or sea cell is bridged, at
 * the bridge's price instead of its own, and each place the line crosses a
 * river adds a river bridge.
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

import { gameRules } from '@/config/game'
import { isWaterCell, bridgeCellPrice, riverCrossings } from '@/composables/map/water'
import { findCell, cellAt, cellKm, walkCells } from '@/composables/map/cellGrid'
import {
  latitudeDegreesToMeters,
  longitudeDegreesToMeters
} from '@/composables/setup/useMapSupport'

/**
 * What one point of a land cell's terrain cost comes to in dollars, for this
 * grid on a board with this speed unit.
 *
 * A cell of ordinary ground (terrain cost `openGroundCost`) is priced at
 * `perSpeedUnit` for every speed unit of its width, and rougher ground costs
 * more in proportion to its terrain cost. So:
 *
 *   dollars per point = perSpeedUnit / openGroundCost
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
  const { perSpeedUnit, openGroundCost } = gameRules.trackPrice
  return (perSpeedUnit / openGroundCost) * (cellKm(grid) / speedUnitKm)
}

/**
 * A land cell's terrain cost, in points: its land cover cost plus
 * `slopeCost` times its slope, each part weighed by its tuning knob
 * (`gameRules.trackPrice.knobs`).
 *
 * The ground is capped first, at `maxTerrainFactor` times ordinary ground's
 * terrain cost, as Empire Builder's dearest ground (alpine, 5) is five times
 * its clear ground (1). Without the cap the steepest cells cost many times a
 * turn's allowance, a wall no one could ever build across. Ground past the
 * cap is trimmed back with both its parts shrunk alike, so each knob still
 * weighs its own part of what is left — and at equal knobs a capped cell
 * costs the cap times the knob.
 *
 * @param {number} landCover - The cell's land cover cost (see config/nlcd.js)
 * @param {number} slope - The cell's slope, as a grade (see slope.js)
 * @returns {number} Points of terrain cost
 */
export function terrainCost(landCover, slope) {
  const { openGroundCost, slopeCost, maxTerrainFactor, knobs } = gameRules.trackPrice
  const slopePoints = slopeCost * slope
  const ground = landCover + slopePoints
  const cap = maxTerrainFactor * openGroundCost
  const trim = ground > cap ? cap / ground : 1
  return trim * (knobs.landCover * landCover + knobs.elevation * slopePoints)
}

/**
 * What track through one land cell costs, in whole dollars: its terrain cost
 * (see `terrainCost`) at the board's price scale.
 *
 * A cell whose slope has not been worked out (its terrain data failed to
 * load) costs nothing, rather than making every line through it
 * unpriceable.
 *
 * Rounded per cell, so every price the game shows or charges is in whole
 * dollars, and the computer players' search (which adds up the same cells,
 * see botPathfinder.js) comes to the same sums.
 * @param {Object} grid - The grid
 * @param {number} cell - The cell
 * @param {number} priceScale - Dollars per point of terrain cost (see
 *   `trackPriceScale`)
 * @returns {number} Dollars
 */
export function landCellPrice(grid, cell, priceScale) {
  const slope = grid.slope[cell]
  if (!Number.isFinite(slope)) return 0
  return Math.round(terrainCost(grid.landCover[cell], slope) * priceScale)
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
 * @param {number} spacingKm - The most the points may be apart
 * @returns {Array<{lat: number, lng: number}>} The points, in order
 */
function pointsAlongLeg(from, to, spacingKm) {
  const dLat = to.lat - from.lat
  const dLng = to.lng - from.lng
  // Rough length, only used to decide how many points to take
  const steps = Math.max(1, Math.ceil(kmBetween(from, to) / spacingKm))

  const points = []
  for (let i = 0; i <= steps; i++) {
    points.push({ lat: from.lat + (dLat * i) / steps, lng: from.lng + (dLng * i) / steps })
  }
  return points
}

/**
 * Points along a line, a quarter of one of the grid's cells apart along each
 * leg, every vertex included. The build rules that look at where a line is
 * rather than which cells it crosses (inside the region, alongside other
 * track, see buildRules.js) check it at these points; a leg can only slip
 * past them by less than a quarter of a cell. Pricing does not use them: it
 * walks the cells exactly (see `cellPath`).
 * @param {Array<{lat: number, lng: number}>} latlngs - The line's vertices
 * @param {Object} grid - The grid the line is checked against
 * @returns {Array<{lat: number, lng: number}>} The points, in order
 */
export function pointsAlongLine(latlngs, grid) {
  const spacingKm = cellKm(grid) / 4
  // A single vertex is a line that has only just started: it sits in one cell
  return latlngs.length === 1
    ? [latlngs[0]]
    : latlngs.slice(1).flatMap((to, i) => pointsAlongLeg(latlngs[i], to, spacingKm))
}

/**
 * Every grid cell a line passes through, each listed once, in the order the
 * line reaches them (see `cellPath`).
 * @param {Array<{lat: number, lng: number}>} latlngs - The line's vertices
 * @param {Object} grid - The grid
 * @returns {Array<number>} The cells crossed
 */
export function cellsAlongLine(latlngs, grid) {
  return [...new Set(cellPath(latlngs, grid))]
}

/**
 * The grid cells a line passes through, in the order it passes through them,
 * found exactly, leg by leg (see `walkCells` in cellGrid.js): every cell a leg enters is in,
 * however little of it the leg clips, and a cell the leg only touches at a
 * corner is not.
 *
 * A cell the line comes back to later is listed again, so the path shows
 * where the line goes in and out of water; it is only listed once for as long
 * as the line stays in it.
 *
 * Holes (cells whose terrain failed to load) and ground off the grid are no
 * cell, and a leg crossing them lists nothing there. A vertex in one is given
 * the nearest cell instead (see `findCell`), as the town cells are, so a line
 * to a town that sits in a hole still ends in that town's cell.
 * @param {Array<{lat: number, lng: number}>} latlngs - The line's vertices
 * @param {Object} grid - The grid
 * @returns {Array<number>} The cells, in order along the line
 */
export function cellPath(latlngs, grid) {
  const path = []
  const add = (cell) => {
    if (cell !== -1 && cell !== path.at(-1)) path.push(cell)
  }
  if (latlngs.length === 0 || !grid) return path

  // Each vertex's own cell is added beside its legs' walks. For a vertex on
  // the board that is the cell the walk starts or ends in, and adds nothing;
  // for one in a hole or off the grid, it is the nearest cell, which the walk
  // cannot give. (A single vertex is a line that has only just started, and
  // sits in its one cell.)
  add(findCell(latlngs[0], grid))
  latlngs.slice(1).forEach((to, i) => {
    walkCells(latlngs[i], to, grid, (row, col) => add(cellAt(grid, row, col)))
    add(findCell(to, grid))
  })
  return path
}

/**
 * What a line of track costs to build, and how much of that is bridges.
 *
 * Each land cell the line passes through adds its own price (see
 * `landCellPrice`), once however often the line passes through it. Each lake
 * or sea cell adds a bridge instead, at the same price for every cell of a
 * crossing (see `bridgeCellPrice`). And each place the line crosses a river
 * adds a river bridge (see `riverCrossings`).
 *
 * @param {Array<{lat: number, lng: number}>} latlngs - The line's vertices
 * @param {Object} board - What the line is priced against, as the track
 *   builder holds it (`buildRules` in trackBuilder.js)
 * @param {Object} board.grid - The grid
 * @param {number} board.priceScale - Dollars per point of terrain cost (see
 *   `trackPriceScale`)
 * @param {number} board.speedUnitKm - The board's speed unit (see
 *   boardScale.js), which bridges are priced by
 * @param {Object|null} [board.rivers] - The rivers on the board (see
 *   `riverIndex` in water.js); none if left out
 * @returns {{total: number, bridges: number}} The price, and the part of it
 *   that is bridges
 */
export function linePrice(latlngs, { grid, priceScale, speedUnitKm, rivers = null }) {
  const waterCell = bridgeCellPrice(grid, speedUnitKm)
  let total = 0
  let bridges = 0
  // Cells already paid for: each is charged once, however often it is crossed
  const charged = new Set()

  cellPath(latlngs, grid).forEach((cell) => {
    if (charged.has(cell)) return
    charged.add(cell)
    if (isWaterCell(grid, cell)) {
      bridges += waterCell
      total += waterCell
    } else {
      total += landCellPrice(grid, cell, priceScale)
    }
  })

  const riverBridges =
    riverCrossings(latlngs, grid, rivers).length * gameRules.bridges.riverCrossing
  return { total: total + riverBridges, bridges: bridges + riverBridges }
}
