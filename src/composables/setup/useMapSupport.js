// useMapSupport.js
// export functions that support the mapping operations

// Conversion constants
const METERS_PER_DEGREE_LAT = 111320 // Approximate meters per degree latitude

/**
 * Converts meters to latitude degrees.
 * @param {number} meters - Distance in meters.
 * @returns {number} - Distance in latitude degrees.
 */
export function metersToLatitudeDegrees(meters) {
  return meters / METERS_PER_DEGREE_LAT
}

/**
 * Converts meters to longitude degrees based on latitude.
 * @param {number} meters - Distance in meters.
 * @param {number} latitude - The latitude at which to calculate (affects longitude).
 * @returns {number} - Distance in longitude degrees.
 */
export function metersToLongitudeDegrees(meters, latitude) {
  const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos(latitude * (Math.PI / 180))
  return meters / metersPerDegreeLon
}

/**
 * Converts latitude degrees to meters.
 * @param {number} latDegrees - Distance in latitude degrees.
 * @returns {number} - Distance in meters.
 */
export function latitudeDegreesToMeters(latDegrees) {
  return latDegrees * METERS_PER_DEGREE_LAT
}

/**
 * Converts longitude degrees to meters based on latitude.
 * @param {number} lonDegrees - Distance in longitude degrees.
 * @param {number} latitude - The latitude at which to calculate (affects longitude).
 * @returns {number} - Distance in meters.
 */
export function longitudeDegreesToMeters(lonDegrees, latitude) {
  const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos(latitude * (Math.PI / 180))
  return lonDegrees * metersPerDegreeLon
}
