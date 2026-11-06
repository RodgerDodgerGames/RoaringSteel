/**
 * Slope (slope.js)
 *
 * How steep each grid cell's ground is: one of the two parts of its terrain
 * cost, alongside its land cover (pricing adds them up, each weighed by its
 * tuning knob, see trackCost.js and `trackPrice` in config/game.js).
 *
 * A cell's slope is a grade, rise over run (0.1 is a 10% grade): the
 * steeper of
 * - its roughness, the average steepness between neighboring pixels inside
 *   it (see useElevationTiles.js), which finds the hills and valleys within
 *   the cell, and
 * - its grade to its neighbors, the average climb from its height to each of
 *   theirs over the distance between them, which finds a long, even slope
 *   that no single cell shows much of.
 *
 * Both are measured as grades, not meters of climb, so the same ground is as
 * steep whatever the size of the cells it is cut into: a cell half the width
 * over the same slope climbs half as far, over half the distance.
 *
 * The grid holds the slope rather than a price so that the elevation knob
 * can be turned without building the grid again.
 *
 * Pure functions over the grid, so the model can be tested without
 * downloads.
 *
 * @module composables/map/slope
 */

import { cellAt } from '@/composables/map/cellGrid'
import {
  latitudeDegreesToMeters,
  longitudeDegreesToMeters
} from '@/composables/setup/useMapSupport'

/**
 * Works out every cell's slope, writing it into the grid's `slope`.
 *
 * @param {Object} grid - A grid being built (see cellGrid.js), each cell on
 *   the board with its average height (`elevation`) filled in
 * @param {Float32Array} roughness - Per cell, its roughness as a grade (see
 *   useElevationTiles.js); NaN or missing counts as level
 */
export function fillSlopes(grid, roughness) {
  const { rows, cols, south, latStep, lngStep, elevation, slope, present, water } = grid
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
      // or beside a hole, is measured against the neighbors it has. Water
      // neighbors are left out too: the sea's height is its floor, often far
      // below the shore, and would make every coast look like a cliff
      let gradeSum = 0
      let neighbors = 0
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue
          const neighbor = cellAt(grid, row + dr, col + dc)
          if (neighbor === -1 || water[neighbor]) continue
          const meters = dr === 0 ? eastWestMeters : dc === 0 ? northSouthMeters : diagonalMeters
          gradeSum += Math.abs(elevation[index] - elevation[neighbor]) / meters
          neighbors++
        }
      }
      const grade = neighbors ? gradeSum / neighbors : 0
      const rough = Number.isFinite(roughness[index]) ? roughness[index] : 0

      slope[index] = Math.max(grade, rough)
    }
  }
}
