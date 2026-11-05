/**
 * Water (water.js)
 *
 * Which grid cells are water, and what a bridge over them costs.
 *
 * A cell is water when most of its land cover is open water — a lake, a
 * reservoir, a wide river or bay (see useLandCoverAPI.js). (Permanent ice is counted the same way;
 * the grid gives the two one cost and cannot tell them apart.) The big water
 * on a state's edge — the sea, the Great Lakes, Chesapeake Bay — is mostly
 * outside the state's outline, so it is under the region mask already; the
 * water here is the water inside the state.
 *
 * Track may cross water on a bridge. Each km of a crossing costs more the
 * further out it is, and a crossing too long to bridge cannot be built (see
 * `gameRules.bridges`). Both are set in km, and turned into cells here for
 * the size of the grid's cells.
 *
 * @module composables/map/water
 */

import { nlcdCostMap } from '@/config/nlcd'
import { gameRules } from '@/config/game'
import { cellKm } from '@/composables/map/cellGrid'

/**
 * The land cover cost the grid gives open water (NLCD class 11). The grid
 * keeps a cell's land cover only as its cost, so this is how water is told
 * apart from land.
 */
export const WATER_LAND_COVER = nlcdCostMap[11]

/**
 * @param {Object} grid - The grid (see cellGrid.js)
 * @param {number} cell - A cell's index
 * @returns {boolean} True if the cell is water
 */
export function isWaterCell(grid, cell) {
  return grid.landCover[cell] === WATER_LAND_COVER
}

/**
 * What the bridge over one water cell costs, by how far into the crossing
 * the cell is: `costPerKm` for each km of it, times which `stepKm` of the
 * crossing the cell reaches into. With 10 km cells and steps, the first
 * water cell in a row costs $5,000 and the second $10,000; with 1 km cells,
 * each of the first ten costs $500 and each of the next ten $1,000 — the
 * same $15,000 for 20 km of water.
 * @param {number} position - The cell's place in its row of water cells, from 1
 * @param {number} cellWidthKm - The grid's cell width (see `cellKm`)
 * @returns {number} The cost, in dollars
 */
export function bridgeCellCost(position, cellWidthKm) {
  const { costPerKm, stepKm } = gameRules.bridges
  // The step the cell's far edge is in; a hair's leeway keeps a cell that
  // ends exactly on a step's end in that step
  const step = Math.ceil((position * cellWidthKm) / stepKm - 1e-9)
  return Math.round(costPerKm * cellWidthKm * step)
}

/**
 * How many water cells in a row a bridge may cross on this grid: as many as
 * fit in `gameRules.bridges.maxKm`.
 * @param {Object} grid - The grid
 * @returns {number} Cells
 */
export function maxBridgeCells(grid) {
  return Math.floor(gameRules.bridges.maxKm / cellKm(grid) + 1e-9)
}

/**
 * The longest crossing of water along a line: the most water cells it
 * passes through between one land cell and the next. A water cell the line
 * comes back to within a crossing counts once.
 * @param {Array<number>} path - Grid cells in order along a line (see
 *   `cellPath` in trackCost.js)
 * @param {Object} grid - The grid the cells are in
 * @param {Array<number>} [landCells] - Cells to count as land whatever their
 *   land cover: the cells towns sit in, since a town on the shore is the
 *   land a bridge reaches even when its cell's center is in the water
 * @returns {number} How many water cells the longest crossing has; 0 for none
 */
export function longestCrossing(path, grid, landCells = []) {
  const land = new Set(landCells)
  let longest = 0
  const crossing = new Set()
  path.forEach((cell) => {
    if (isWaterCell(grid, cell) && !land.has(cell)) crossing.add(cell)
    else crossing.clear()
    longest = Math.max(longest, crossing.size)
  })
  return longest
}
