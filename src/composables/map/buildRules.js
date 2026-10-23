/**
 * Build Rules (buildRules.js)
 *
 * Where track may not be laid, and why. The build composable asks these
 * questions of every leg as it is placed, and of the whole line again when
 * it is finished, so a section that breaks a rule is never built.
 *
 * The rule here: track stays inside the region being played — the state the
 * game is set in. The map grays out everything outside it (see
 * regionMask.js), and no track may go into the gray. The one exception is the
 * grid cell a town sits in: a town is placed at the middle of its metro area,
 * and a metro area that spans a state line can have its middle just over it.
 * Such a town can still be built to, up to the edge of its cell.
 *
 * And track may bridge water, but only so far: a crossing of more water
 * cells in a row than the longest bridge allowed cannot be built (see
 * water.js and `gameRules.bridges`).
 *
 * A line is checked at the same points its price is worked out from (see
 * trackCost.js), a quarter of a cell apart, so a leg cannot slip across a
 * narrow neck of gray between two of them unnoticed by more than that.
 *
 * Pure functions over plain data, so the rules can be tested without a map.
 *
 * @module composables/map/buildRules
 */

import { gridConfig } from '@/config/grid'
import { gameRules } from '@/config/game'
import { findCell, pointsAlongLine, cellsAlongLine, cellBounds } from '@/composables/map/trackCost'
import { longestCrossing } from '@/composables/map/water'

/**
 * Whether a point lies inside a grid cell.
 * @param {{lat: number, lng: number}} point - The point
 * @param {Object} cell - Grid cell with a `centroid`
 * @returns {boolean} True if the point is in the cell
 */
function isInCell({ lat, lng }, cell) {
  const { south, west, north, east } = cellBounds(cell)
  return lat >= south && lat <= north && lng >= west && lng <= east
}

/**
 * The grid cells the towns sit in. Track may go into these even where they
 * reach outside the region.
 * @param {Array<Object>} towns - Towns, each with lat and lon
 * @param {Array<Object>} grid - Grid cells
 * @returns {Array<Object>} The cells, each once
 */
export function townCells(towns, grid) {
  const cells = towns.map((town) => findCell({ lat: town.lat, lng: town.lon }, grid))
  return [...new Set(cells.filter(Boolean))]
}

/**
 * Why a line of track may not be built, or null if it may.
 *
 * @param {Array<{lat: number, lng: number}>} latlngs - The line's vertices
 * @param {Object} rules - What the line is checked against
 * @param {Array<Object>} rules.grid - Grid cells
 * @param {Function} rules.isInRegion - Whether a point is inside the region
 *   being played (see `regionTest` in region.js)
 * @param {Array<Object>} rules.townCells - The cells towns sit in (see `townCells`)
 * @returns {{reason: 'outside', point: {lat: number, lng: number}}|{reason:
 *   'water'}|null} The rule broken — for the region, with the first point
 *   along the line that breaks it — or null if the line may be built
 */
export function lineBlock(latlngs, { grid, isInRegion, townCells }) {
  for (const point of pointsAlongLine(latlngs)) {
    if (isInRegion(point)) continue
    if (townCells.some((cell) => isInCell(point, cell))) continue
    return { reason: 'outside', point }
  }
  if (longestCrossing(cellsAlongLine(latlngs, grid)) > gameRules.bridges.maxCells) {
    return { reason: 'water' }
  }
  return null
}

/**
 * What to tell the player when a line breaks a rule.
 * @param {{reason: string}} block - What `lineBlock` found
 * @param {string} [regionName] - The region's name, e.g. "Maryland"
 * @returns {string} The message
 */
export function blockMessage(block, regionName) {
  switch (block.reason) {
    case 'outside':
      return `Track can't go outside ${regionName || 'the map'}.`
    case 'water': {
      const km = (gameRules.bridges.maxCells * gridConfig.cellSize) / 1000
      return `Too much water to bridge: a bridge can span at most ${km} km.`
    }
    default:
      return "Track can't go there."
  }
}
