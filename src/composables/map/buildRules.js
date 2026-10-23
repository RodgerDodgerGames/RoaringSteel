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
 * A line is checked at the same points its price is worked out from (see
 * trackCost.js), a quarter of a cell apart, so a leg cannot slip across a
 * narrow neck of gray between two of them unnoticed by more than that.
 *
 * Pure functions over plain data, so the rules can be tested without a map.
 *
 * @module composables/map/buildRules
 */

import { booleanPointInPolygon } from '@turf/turf'
import { findCell, pointsAlongLine } from '@/composables/map/trackCost'

/**
 * Whether a point is inside the region being played.
 *
 * The region is the state's GeoJSON: a Feature, or a FeatureCollection whose
 * features together make up the region. With no region at all (a damaged
 * save) there is no outside to keep track out of, so every point counts as
 * inside.
 *
 * @param {Object|null} region - GeoJSON Feature or FeatureCollection
 * @param {{lat: number, lng: number}} point - The point
 * @returns {boolean} True if the point is inside the region
 */
export function regionContains(region, point) {
  if (!region) return true
  const features = region.type === 'FeatureCollection' ? region.features : [region]
  return features.some((feature) => booleanPointInPolygon([point.lng, point.lat], feature))
}

/**
 * The ids of the grid cells the towns sit in. Track may go into these even
 * where they reach outside the region.
 * @param {Array<Object>} towns - Towns, each with lat and lon
 * @param {Array<Object>} grid - Grid cells
 * @returns {Set} Cell ids
 */
export function townCellIds(towns, grid) {
  const ids = towns.map((town) => findCell({ lat: town.lat, lng: town.lon }, grid)?.id)
  return new Set(ids.filter((id) => id != null))
}

/**
 * Why a line of track may not be built, or null if it may.
 *
 * @param {Array<{lat: number, lng: number}>} latlngs - The line's vertices
 * @param {Object} rules - What the line is checked against
 * @param {Array<Object>} rules.grid - Grid cells
 * @param {Object|null} rules.region - The region being played
 * @param {Set} rules.townCells - Ids of the cells towns sit in (see `townCellIds`)
 * @returns {{reason: 'outside', point: {lat: number, lng: number}}|null} The
 *   rule broken and the first point along the line that breaks it, or null
 */
export function lineBlock(latlngs, { grid, region, townCells }) {
  for (const point of pointsAlongLine(latlngs)) {
    if (regionContains(region, point)) continue
    // Only looked up for points outside, which few lines have any of
    if (townCells.has(findCell(point, grid)?.id)) continue
    return { reason: 'outside', point }
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
    default:
      return "Track can't go there."
  }
}
