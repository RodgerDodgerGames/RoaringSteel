/**
 * Payoffs (payoffs.js)
 *
 * What a demand pays when it is delivered.
 *
 * In Empire Builder a demand pays more the further its commodity has to come:
 * the printed payoffs track the distance from the nearest place that
 * produces it. The same is done here, by the numbers in `gameRules.payoffs`:
 * the straight-line distance from the nearest producing town to the
 * destination, at so much per km, rounded, and never less than a minimum.
 *
 * Only the nearest producer counts, because that is where a sensible player
 * fetches it from — a commodity made all over the map is cheap to bring
 * anywhere, and one made in a single far corner pays well everywhere else.
 *
 * Pure functions over plain data, so the rule can be tested without stores.
 *
 * @module composables/payoffs
 */

import * as turf from '@turf/turf'
import { gameRules } from '@/config/game'

/**
 * How far a commodity has to travel to a town: the straight-line distance,
 * in km, from the nearest other town that produces it.
 * @param {Object} destination - The town it is wanted in, with lat and lon
 * @param {string} industry - The commodity's name
 * @param {Array<Object>} towns - Every town, each with lat, lon and industries
 * @returns {number|null} Kilometers, or null when no other town produces it
 */
export function haulKm(destination, industry, towns) {
  const to = turf.point([destination.lon, destination.lat])
  const distances = towns
    .filter(
      (town) => town !== destination && town.industries.some(({ name }) => name === industry)
    )
    .map((town) => turf.distance(turf.point([town.lon, town.lat]), to))
  return distances.length ? Math.min(...distances) : null
}

/**
 * What delivering a commodity to a town pays.
 * @param {Object} destination - The town it is wanted in, with lat and lon
 * @param {string} industry - The commodity's name
 * @param {Array<Object>} towns - Every town, each with lat, lon and industries
 * @returns {number} The payoff, in dollars; the minimum when no other town
 *   produces the commodity
 */
export function demandPayoff(destination, industry, towns) {
  const { perKm, roundTo, minimum } = gameRules.payoffs
  const km = haulKm(destination, industry, towns) ?? 0
  return Math.max(minimum, Math.round((km * perKm) / roundTo) * roundTo)
}
