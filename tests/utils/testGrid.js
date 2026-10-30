/**
 * Grids for Tests
 *
 * Small grids built the way the grid store builds a real one (see
 * stores/grid.js and composables/map/cellGrid.js): rows of cells from the
 * south, columns from the west, each cell the same size in degrees.
 */

import { createCellGrid, setCell, cellIndexes, rowOf, colOf } from '@/composables/map/cellGrid'
import { gridConfig } from '@/config/grid'
import { metersToLatitudeDegrees } from '@/composables/setup/useMapSupport'

/** Degrees of latitude one grid cell spans */
export const CELL = metersToLatitudeDegrees(gridConfig.cellSize)

/**
 * A grid with the terrain each cell is given.
 *
 * Cells are square in degrees unless told otherwise, which is square on the
 * ground near the equator, where most tests are set.
 *
 * @param {Object} shape
 * @param {number} shape.rows - Rows of cells
 * @param {number} shape.cols - Columns of cells
 * @param {number} [shape.south] - Latitude of the southern edge
 * @param {number} [shape.west] - Longitude of the western edge
 * @param {number} [shape.latStep] - Degrees of latitude per cell
 * @param {number} [shape.lngStep] - Degrees of longitude per cell
 * @param {Function} [shape.cell] - `(row, col)` → the cell's terrain,
 *   `{cost, landCover, elevation}` (any left out: no cost, plain land, sea
 *   level), or null to leave a hole
 * @returns {Object} The grid
 */
export function makeTestGrid({
  rows,
  cols,
  south = 0,
  west = 0,
  latStep = CELL,
  lngStep = CELL,
  cell = () => ({})
}) {
  const grid = createCellGrid({ rows, cols, south, west, latStep, lngStep })
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const terrain = cell(row, col)
      if (!terrain) continue
      setCell(grid, row * cols + col, {
        elevation: terrain.elevation ?? 0,
        landCover: terrain.landCover ?? 150,
        cost: terrain.cost
      })
    }
  }
  return grid
}

/**
 * A grid's cells as plain objects, for checking what a grid holds: each
 * cell's "row-col" id and its terrain, in index order.
 * @param {Object} grid - The grid
 * @returns {Array<{id: string, elevation: number, landCover: number, cost: number}>}
 */
export function cellsOf(grid) {
  return cellIndexes(grid).map((index) => ({
    id: `${rowOf(grid, index)}-${colOf(grid, index)}`,
    elevation: grid.elevation[index],
    landCover: grid.landCover[index],
    cost: grid.cost[index]
  }))
}
