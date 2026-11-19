/**
 * Region (region.js)
 *
 * Reads the region being played — the state the game is set in, as GeoJSON —
 * for the map's mask (regionMask.js) and the build rules (buildRules.js).
 * Both read it through here, so what is grayed out and what track is kept
 * out of can never disagree.
 *
 * @module composables/map/region
 */

import { toRaw } from 'vue'
import { bbox, booleanPointInPolygon } from '@turf/turf'

/**
 * The region's polygons, as GeoJSON features. The region is a Feature, or a
 * FeatureCollection whose features together make it up; anything in it that
 * is not a Polygon or MultiPolygon (a damaged save) is left out.
 *
 * Read from the raw object, not the store's reactive copy: a state outline
 * has thousands of points, and every read through Vue's proxy costs extra on
 * checks that run as the cursor moves.
 *
 * @param {Object|null} region - GeoJSON Feature or FeatureCollection
 * @returns {Array<Object>} Polygon and MultiPolygon features; none for no region
 */
export function regionPolygons(region) {
  const raw = toRaw(region)
  if (!raw) return []
  const features = raw.type === 'FeatureCollection' ? raw.features.map(toRaw) : [raw]
  return features.filter(({ geometry } = {}) =>
    ['Polygon', 'MultiPolygon'].includes(geometry?.type)
  )
}

/**
 * The test made for each region so far (see `regionTest`), by the region's
 * raw object, so a game asks for its region's test as often as it likes and
 * always gets the same one back.
 * @type {WeakMap<Object, Function>}
 */
const regionTests = new WeakMap()

/**
 * A test for whether points are inside the region, made once per region so
 * each point costs as little as possible: a point outside a polygon's
 * bounding box is ruled out before the polygon itself is looked at.
 *
 * The same region always gets the same test back. What is worked out from
 * a test can then be kept and found again by it: the route search marks
 * every cell of the grid as in or out of the region once per test (see
 * `regionMask` in botPathfinder.js), which takes seconds on a board with a
 * long, ragged coastline, and setup's check of which towns track can reach
 * (see reachableTowns.js) leaves that marking for the computer players'
 * searches to use, rather than each working it out again.
 *
 * With no region at all (a damaged save) there is no outside to keep track
 * out of, so every point counts as inside.
 *
 * @param {Object|null} region - GeoJSON Feature or FeatureCollection
 * @returns {Function} (point: {lat, lng}) => boolean, true if inside
 */
export function regionTest(region) {
  // Only an object can be kept by: a damaged save's region may be anything
  const raw = toRaw(region)
  const canKeep = raw !== null && typeof raw === 'object'
  if (canKeep && regionTests.has(raw)) return regionTests.get(raw)

  const polygons = regionPolygons(region).map((feature) => ({ feature, box: bbox(feature) }))
  const test =
    polygons.length === 0
      ? () => true
      : ({ lat, lng }) =>
          polygons.some(
            ({ feature, box: [west, south, east, north] }) =>
              lng >= west &&
              lng <= east &&
              lat >= south &&
              lat <= north &&
              booleanPointInPolygon([lng, lat], feature)
          )
  if (canKeep) regionTests.set(raw, test)
  return test
}
