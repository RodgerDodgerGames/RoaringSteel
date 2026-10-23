/**
 * Water (water.js)
 *
 * Which grid cells are water, and what a bridge over them costs.
 *
 * A cell is water when the land cover at its center is open water — a lake,
 * a reservoir, a wide river or bay. (Permanent ice is counted the same way;
 * the grid gives the two one cost and cannot tell them apart.) The big water
 * on a state's edge — the sea, the Great Lakes, Chesapeake Bay — is mostly
 * outside the state's outline, so it is under the region mask already; the
 * water here is the water inside the state.
 *
 * Track may cross water on a bridge. Each water cell in a row costs more
 * than the one before, and a crossing too long to bridge cannot be built
 * (see `gameRules.bridges`).
 *
 * @module composables/map/water
 */

import { nlcdCostMap } from '@/config/nlcd'
import { gameRules } from '@/config/game'

/**
 * The land cover cost the grid gives open water (NLCD class 11). The grid
 * keeps a cell's land cover only as its cost, so this is how water is told
 * apart from land.
 */
const WATER_LAND_COVER = nlcdCostMap[11]

/**
 * @param {Object} cell - A grid cell
 * @returns {boolean} True if the cell is water
 */
export function isWaterCell(cell) {
  return cell.landCover === WATER_LAND_COVER
}

/**
 * What the bridge over one water cell costs, by how far into the crossing
 * the cell is: the first water cell in a row costs `costPerCell`, the second
 * twice that, and so on.
 * @param {number} position - The cell's place in its row of water cells, from 1
 * @returns {number} The cost
 */
export function bridgeCellCost(position) {
  return gameRules.bridges.costPerCell * position
}

/**
 * The longest row of water cells in a list of cells, in the order a line
 * crosses them.
 * @param {Array<Object>} cells - Grid cells, in order along a line
 * @returns {number} How many water cells the longest crossing has; 0 for none
 */
export function longestCrossing(cells) {
  let longest = 0
  let run = 0
  cells.forEach((cell) => {
    run = isWaterCell(cell) ? run + 1 : 0
    longest = Math.max(longest, run)
  })
  return longest
}
