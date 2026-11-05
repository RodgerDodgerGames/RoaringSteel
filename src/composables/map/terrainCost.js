/**
 * Terrain Cost (terrainCost.js)
 *
 * How hard each grid cell's ground is to build track over: its terrain cost,
 * which pricing turns into dollars for the board (see trackCost.js).
 *
 *   terrain cost = land cover cost + slopeCost · slope
 *
 * The land cover cost is the average over the cell's land (see
 * useLandCoverAPI.js): grassland $70, forest $350, a city $500–800. The slope
 * is how steep the cell is, as rise over run (0.1 is a 10% grade): the
 * steeper of
 * - its roughness, the average steepness between neighboring pixels inside
 *   it (see useElevationTiles.js), which finds the hills and valleys within
 *   the cell, and
 * - its grade to its neighbors, the average climb from its height to each of
 *   theirs over the distance between them, which finds a long, even slope
 *   that no single cell shows much of.
 *
 * Both are measured as grades, not meters of climb, so the same ground costs
 * the same whatever the size of the cells it is cut into: a cell half the
 * width over the same slope climbs half as far, over half the distance.
 *
 * Pure functions over the grid, so the model can be tested without
 * downloads.
 *
 * @module composables/map/terrainCost
 */

import { gridConfig } from '@/config/grid'
import { cellAt } from '@/composables/map/cellGrid'
import {
  latitudeDegreesToMeters,
  longitudeDegreesToMeters
} from '@/composables/setup/useMapSupport'

/**
 * Works out every cell's terrain cost, writing it into the grid's `cost`.
 *
 * @param {Object} grid - A grid being built (see cellGrid.js), each cell on
 *   the board with its average height (`elevation`) and land cover cost
 *   (`landCover`) filled in
 * @param {Float32Array} roughness - Per cell, its roughness as a grade (see
 *   useElevationTiles.js); NaN or missing counts as level
 */
export function fillTerrainCosts(grid, roughness) {
  const { rows, cols, south, latStep, lngStep, elevation, landCover, cost, present } = grid
  const northSouthMeters = latitudeDegreesToMeters(latStep)

  for (let row = 0; row < rows; row++) {
    // A degree of longitude shrinks toward the poles, so the distance to the
    // cells east and west is worked out row by row
    const lat = south + (row + 0.5) * latStep
    const eastWestMeters = longitudeDegreesToMeters(lngStep, lat)
    const diagonalMeters = Math.hypot(northSouthMeters, eastWestMeters)

    for (let col = 0; col < cols; col++) {
      const index = row * cols + col
      if (!present[index]) continue

      // The average grade to the neighbors on the board; a cell at the edge,
      // or beside a hole, is measured against the neighbors it has
      let gradeSum = 0
      let neighbors = 0
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue
          const neighbor = cellAt(grid, row + dr, col + dc)
          if (neighbor === -1) continue
          const meters = dr === 0 ? eastWestMeters : dc === 0 ? northSouthMeters : diagonalMeters
          gradeSum += Math.abs(elevation[index] - elevation[neighbor]) / meters
          neighbors++
        }
      }
      const grade = neighbors ? gradeSum / neighbors : 0
      const rough = Number.isFinite(roughness[index]) ? roughness[index] : 0

      cost[index] = Math.round(landCover[index] + gridConfig.slopeCost * Math.max(grade, rough))
    }
  }
}
