/**
 * Coarse Grid (coarseGrid.js)
 *
 * A coarser copy of the board's grid: each block of `factor` × `factor`
 * cells merged into one. Used where the game wants a rough answer over the
 * whole board quickly, such as the cheapest route between every pair of
 * towns when the demand deck is priced (see payoffs.js). A search over a
 * grid with a sixteenth of the cells takes about a sixteenth of the time.
 *
 * A merged cell keeps what the cells in its block share, the way the grid
 * itself averages the pixels in each cell (see stores/grid.js):
 * - it is water when at least half of the block's cells on the board are
 *   lake or sea, and land otherwise;
 * - its land cover, roughness and height are the averages over the block's
 *   land cells (its water cells' when it is water: the sea's height is its
 *   floor, which no land cell should be averaged with);
 * - a block with no cell on the board is a hole.
 *
 * Its cells are `factor` times as wide, so track across one costs about
 * `factor` times a fine cell's (see `trackPriceScale` in trackCost.js), and
 * a climb between two is measured over `factor` times the distance.
 *
 * Pure functions over the grid, so they can be tested without a map.
 *
 * @module composables/map/coarseGrid
 */

import { createCellGrid, setCell, rowOf, colOf, cellIndexes } from '@/composables/map/cellGrid'
import { isWaterCell } from '@/composables/map/water'

/**
 * How many fine cells each side of a merged cell should span for a coarse
 * grid of no more than about `cells` cells.
 * @param {Object} grid - The grid (see cellGrid.js)
 * @param {number} cells - The most cells wanted
 * @returns {number} The factor, 1 or more (1 keeps the grid as it is)
 */
export function coarseFactor(grid, cells) {
  return Math.max(1, Math.ceil(Math.sqrt((grid.rows * grid.cols) / cells)))
}

/**
 * The grid with each block of `factor` × `factor` cells merged into one.
 * The coarse grid starts at the same south-west corner; the last row and
 * column of blocks may reach past the fine grid's edge, and merge only the
 * cells it has.
 * @param {Object} grid - The grid (see cellGrid.js)
 * @param {number} factor - Fine cells each side of a merged cell, 1 or more
 * @returns {Object} The coarse grid (the same grid when the factor is 1)
 */
export function coarsenGrid(grid, factor) {
  if (factor <= 1) return grid
  const rows = Math.ceil(grid.rows / factor)
  const cols = Math.ceil(grid.cols / factor)
  const coarse = createCellGrid({
    rows,
    cols,
    south: grid.south,
    west: grid.west,
    latStep: grid.latStep * factor,
    lngStep: grid.lngStep * factor
  })

  // Running totals per merged cell, land and water kept apart
  const size = rows * cols
  const land = { count: new Uint32Array(size), cover: new Float64Array(size) }
  land.roughness = new Float64Array(size)
  land.height = new Float64Array(size)
  const water = { count: new Uint32Array(size), height: new Float64Array(size) }

  cellIndexes(grid).forEach((index) => {
    const block =
      Math.floor(rowOf(grid, index) / factor) * cols + Math.floor(colOf(grid, index) / factor)
    if (isWaterCell(grid, index)) {
      water.count[block]++
      water.height[block] += grid.elevation[index]
      return
    }
    land.count[block]++
    land.cover[block] += grid.landCover[index]
    // Every cell of a built grid has its roughness (see stores/grid.js); one
    // without counts as level
    const roughness = grid.roughness[index]
    land.roughness[block] += Number.isFinite(roughness) ? roughness : 0
    land.height[block] += grid.elevation[index]
  })

  for (let block = 0; block < size; block++) {
    const onBoard = land.count[block] + water.count[block]
    if (onBoard === 0) continue
    const isWater = water.count[block] * 2 >= onBoard
    if (isWater) {
      setCell(coarse, block, {
        elevation: water.height[block] / water.count[block],
        landCover: 0,
        roughness: 0,
        water: true
      })
    } else {
      const n = land.count[block]
      setCell(coarse, block, {
        elevation: land.height[block] / n,
        landCover: Math.round(land.cover[block] / n),
        roughness: land.roughness[block] / n
      })
    }
  }
  return coarse
}
