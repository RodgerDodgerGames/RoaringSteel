/**
 * Water Filters (scripts/waterFilters.mjs)
 *
 * Which of Natural Earth's rivers and lakes build-water-data.mjs keeps for
 * the game. Natural Earth draws far more water than a board should have —
 * a couple of hundred rivers on a board like the Southeast — so only the
 * major rivers and the big lakes are kept, and a board has a handful of
 * each, as Empire Builder's does. The rest never reach public/data/water.json:
 * not drawn, not named, and track builds over them as ordinary land (a
 * dropped lake's cells fall back to their land cover, see config/nlcd.js).
 *
 * The filters run when the water file is built, not when the game loads
 * it, so the game downloads only the water it plays with. Change a cutoff
 * here, then run the script again to see it in the game:
 *
 *   node scripts/build-water-data.mjs
 *
 * Pure functions over GeoJSON features, kept apart from the script so they
 * are tested without downloading anything.
 *
 * Decided 2026-11-22: rivers in #185, lakes in #189.
 */

import { area, bbox, booleanPointInPolygon } from '@turf/turf'

/**
 * The least important river kept, by Natural Earth's rank for it (its
 * `scalerank`: lower is more important — the Rio Grande is 4, the
 * Mississippi 5, the Minnesota River 7, Colorado's South Platte 8). At 7, a
 * sub-region board has between 1 river (Florida) and about 20 (Southeast),
 * against 20 to 200 with every river kept.
 */
export const MAX_RIVER_RANK = 7

/**
 * The smallest lake kept, in square miles of water. Lakes are judged by
 * size rather than by Natural Earth's rank, which keeps few of the South's
 * reservoirs: at rank 7 the South Central board kept 4 of its 51 lakes.
 * At 50, Minnesota keeps 12 lakes (Lake Winnibigoshish, at 82, and up) and
 * drops lakes like Cass Lake (26) and Otter Tail Lake (18).
 */
export const MIN_LAKE_SQUARE_MILES = 50

/** Square meters in a square mile, to turn turf's areas into square miles */
const SQUARE_METERS_PER_SQUARE_MILE = 2589988.11

/**
 * Whether a river is important enough to keep (see `MAX_RIVER_RANK`).
 * @param {Object} feature - A Natural Earth river feature, with its
 *   `scalerank` property
 * @returns {boolean} True to keep it
 */
export function isMajorRiver(feature) {
  return feature.properties.scalerank <= MAX_RIVER_RANK
}

/**
 * A lake's area in square miles: all of its outline, every part and island
 * hole counted, as Natural Earth gives it. It is worked out before the
 * script cuts features to the country and splits them into separate parts,
 * so a lake drawn in parts — such as Lac la Croix on the Canadian border —
 * is judged by its whole size, not by its parts'. A lake Natural Earth draws
 * as separate features is judged feature by feature: Basswood Lake, on the
 * same border, is three (49, 8 and 3 square miles), so none is kept.
 * @param {Object} feature - A Natural Earth lake feature
 * @returns {number} Its area, in square miles; 0 if it has no outline
 */
export function lakeSquareMiles(feature) {
  if (!feature.geometry) return 0
  return area(feature) / SQUARE_METERS_PER_SQUARE_MILE
}

/**
 * Whether a lake is big enough to keep (see `MIN_LAKE_SQUARE_MILES`).
 * @param {Object} feature - A Natural Earth lake feature
 * @returns {boolean} True to keep it
 */
export function isBigLake(feature) {
  return lakeSquareMiles(feature) >= MIN_LAKE_SQUARE_MILES
}

/**
 * A lake centerline's course with the stretches over kept lakes taken out.
 *
 * Natural Earth carries a river through a lake on a "Lake Centerline" line.
 * Over a lake the game keeps, that line is not wanted — the lake is crossed
 * as a lake, by its own bridge — but where the lake is dropped, the
 * centerline is all that joins the river on either side of it: without it
 * the Mississippi would stop at each end of Cass Lake, and track could cross
 * the gap for free. One centerline can run through a chain of lakes, some
 * kept and some not, so it is cut piece by piece rather than kept or dropped
 * whole.
 *
 * A step of the line is over a kept lake when its midpoint is. The pieces
 * left end within a step of each kept lake's shore; a little overlap with
 * the lake does no harm, as a river crossing on a lake's water cells is not
 * charged (see `riverCrossings` in src/composables/map/water.js).
 *
 * @param {Object} feature - A Natural Earth "Lake Centerline" feature
 * @param {Array<Object>} keptLakes - The lakes kept (see `isBigLake`)
 * @returns {Object|null} The feature with a MultiLineString of what is left,
 *   or null if nothing is left
 */
export function centerlineOutsideLakes(feature, keptLakes) {
  if (!feature.geometry) return null
  const lines =
    feature.geometry.type === 'LineString'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates
  // Only the lakes whose box reaches the line's box can hold any of it
  const [west, south, east, north] = bbox(feature)
  const nearby = keptLakes.filter((lake) => {
    lake.bbox ??= bbox(lake)
    const [lw, ls, le, ln] = lake.bbox
    return lw <= east && le >= west && ls <= north && ln >= south
  })
  const overLake = (point) =>
    nearby.some(
      (lake) =>
        point[0] >= lake.bbox[0] &&
        point[0] <= lake.bbox[2] &&
        point[1] >= lake.bbox[1] &&
        point[1] <= lake.bbox[3] &&
        booleanPointInPolygon(point, lake)
    )

  // Walk each line step by step, starting a new piece after each stretch
  // over a kept lake
  const pieces = []
  lines.forEach((line) => {
    let piece = []
    line.slice(1).forEach((to, i) => {
      const from = line[i]
      const middle = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]
      if (overLake(middle)) {
        if (piece.length >= 2) pieces.push(piece)
        piece = []
      } else {
        if (piece.length === 0) piece.push(from)
        piece.push(to)
      }
    })
    if (piece.length >= 2) pieces.push(piece)
  })
  if (pieces.length === 0) return null
  return { ...feature, geometry: { type: 'MultiLineString', coordinates: pieces } }
}
