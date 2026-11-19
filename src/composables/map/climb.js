/**
 * Climb (climb.js)
 *
 * How steeply a line of track climbs as it goes from one grid cell to the
 * next: one of the two parts topography adds to a cell's price, beside the
 * roughness of the ground within the cell (see `terrainCost` in
 * trackCost.js).
 *
 * A railroad is held back far more by grade than by bumps: trains can only
 * haul so much up a steep grade, so real lines were laid to a ruling grade
 * of a percent or two, and where the ground climbs faster than that they
 * wind along valleys, loop and switch back to stretch the climb out. So the
 * climb is measured along the line, in the direction it runs, rather than
 * as how steep a cell is in whatever direction it is steepest: a line up a
 * valley floor climbs gently even where the valley's sides are steep, and a
 * line straight up a ridge climbs hard.
 *
 * The climb from one cell to the next is the difference in their average
 * heights over the distance between their centers. Uphill and downhill
 * count alike: track is laid once and run both ways.
 *
 * There is no climb to or from water, which is bridged level (see
 * water.js) — and the sea's height in the elevation data is its floor, far
 * below the shore — nor to or from a cell whose height is unknown.
 *
 * Pure functions over the grid, so the rules can be tested without a map.
 *
 * @module composables/map/climb
 */

import { rowOf, colOf } from '@/composables/map/cellGrid'
import { isWaterCell } from '@/composables/map/water'
import {
  latitudeDegreesToMeters,
  longitudeDegreesToMeters
} from '@/composables/setup/useMapSupport'

/**
 * The grade a line climbs going from one cell to a neighboring one: the
 * difference in their heights over the distance between their centers,
 * uphill or downhill alike (0.02 is a 2% grade).
 *
 * Only neighbors climb. A line's cells come one after another, but where it
 * crosses a hole (see `cellPath` in trackCost.js) the cells either side are
 * not neighbors, and with the ground between them unknown no climb is
 * charged across it.
 *
 * The distance is measured on a flat projection, longitude shrunk by the
 * cosine of the latitude halfway between the two centers, so a step and the
 * step back are the same length and climb the same grade.
 *
 * @param {Object} grid - The grid (see cellGrid.js)
 * @param {number} from - The cell the line comes from, or -1 for none (the
 *   line starts here, or comes from a hole or off the grid)
 * @param {number} to - The cell it goes into
 * @returns {number} The grade; 0 for no cell to come from, for cells that
 *   are not neighbors, for water at either end, or for a cell of unknown
 *   height
 */
export function stepGrade(grid, from, to) {
  if (from === -1 || to === -1) return 0
  const rows = Math.abs(rowOf(grid, to) - rowOf(grid, from))
  const cols = Math.abs(colOf(grid, to) - colOf(grid, from))
  if (Math.max(rows, cols) !== 1) return 0
  if (isWaterCell(grid, from) || isWaterCell(grid, to)) return 0
  const rise = Math.abs(grid.elevation[to] - grid.elevation[from])
  if (!Number.isFinite(rise)) return 0

  const middleLat = grid.south + ((rowOf(grid, from) + rowOf(grid, to)) / 2 + 0.5) * grid.latStep
  const meters = Math.hypot(
    latitudeDegreesToMeters(rows * grid.latStep),
    longitudeDegreesToMeters(cols * grid.lngStep, middleLat)
  )
  return rise / meters
}
