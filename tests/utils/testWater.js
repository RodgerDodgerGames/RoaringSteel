/**
 * Water for Tests
 *
 * Water data shaped like the game's water file (see
 * scripts/build-water-data.mjs and composables/map/waterData.js): rivers as
 * lines, lakes and sea as polygons, and bays as label points, each a GeoJSON
 * FeatureCollection whose features carry a `name`, `rank` and `label`.
 */

/**
 * A feature with the properties the water file gives every feature.
 * @param {Object} geometry - GeoJSON geometry
 * @param {Object} [properties] - name, rank and label; unnamed, rank 10,
 *   named from zoom 7 if left out
 * @returns {Object} The feature
 */
export function waterFeature(geometry, properties = {}) {
  return {
    type: 'Feature',
    properties: { name: null, rank: 10, label: 7, ...properties },
    geometry
  }
}

/**
 * A river, as a line through some points.
 * @param {Array<{lat: number, lng: number}>} points - Its course
 * @param {Object} [properties] - See `waterFeature`
 * @returns {Object} The feature
 */
export function river(points, properties) {
  return waterFeature(
    { type: 'LineString', coordinates: points.map(({ lat, lng }) => [lng, lat]) },
    properties
  )
}

/**
 * A lake (or sea), as a polygon with these corners, and holes (islands) if
 * given.
 * @param {Array<{lat: number, lng: number}>} corners - Its outline
 * @param {Array<Array<{lat: number, lng: number}>>} [holes] - Islands in it
 * @param {Object} [properties] - See `waterFeature`
 * @returns {Object} The feature
 */
export function lake(corners, holes = [], properties) {
  const ring = (points) => {
    const coordinates = points.map(({ lat, lng }) => [lng, lat])
    return [...coordinates, coordinates[0]]
  }
  return waterFeature(
    { type: 'Polygon', coordinates: [ring(corners), ...holes.map(ring)] },
    properties
  )
}

/**
 * Water data, as the water file holds it.
 * @param {Object} [parts] - Features for each part; any left out are empty
 * @returns {Object} The data, for the water store's `setData`
 */
export function waterData({ rivers = [], lakes = [], sea = [], bays = [] } = {}) {
  const collection = (features) => ({ type: 'FeatureCollection', features })
  return {
    source: 'test',
    rivers: collection(rivers),
    lakes: collection(lakes),
    sea: collection(sea),
    bays: collection(bays)
  }
}
