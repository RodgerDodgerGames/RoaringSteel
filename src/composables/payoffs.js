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
 * On top of the per-km rate, long hauls earn a bonus. Reaching a distant town
 * means building (and risking) a lot of track before the first delivery pays,
 * so the payoff is multiplied by a factor that grows with the logarithm of
 * how far the haul is, measured against the map's own span — the distance
 * between its two furthest-apart towns. Measuring against the span keeps the
 * bonus the same shape on a small region as on a large one: a haul halfway
 * across the map gets the same multiplier either way.
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
    .filter((town) => town !== destination && town.industries.some(({ name }) => name === industry))
    .map((town) => turf.distance(turf.point([town.lon, town.lat]), to))
  return distances.length ? Math.min(...distances) : null
}

/**
 * The map's span: the straight-line distance, in km, between the two towns
 * furthest apart. No haul can be longer than this, so it is the yardstick the
 * long-haul bonus is measured against.
 *
 * Every pair is compared, which is quadratic in the number of towns — fine
 * for a map's tens-to-hundreds of towns, but it is why the deck builder works
 * this out once per deck and hands it to `demandPayoff`, rather than each
 * payoff working it out again.
 * @param {Array<Object>} towns - Every town, each with lat and lon
 * @returns {number} Kilometers; 0 when there are fewer than two towns
 */
export function mapSpanKm(towns) {
  const points = towns.map((town) => turf.point([town.lon, town.lat]))
  let span = 0
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      span = Math.max(span, turf.distance(points[i], points[j]))
    }
  }
  return span
}

/**
 * The long-haul bonus: what the per-km payoff is multiplied by for a haul of
 * this length on a map of this span.
 *
 *   multiplier = 1 + maxBonus · ln(1 + km / span) / ln 2
 *
 * At zero km the logarithm is 0, so a short haul pays (nearly) the plain
 * per-km rate. At the full span it is ln 2, which the division cancels, so the
 * map's longest possible haul pays exactly (1 + maxBonus) times the rate. In
 * between, the logarithm rises fastest early on, so even a moderate haul gets
 * a noticeable share of the bonus — but since the payoff is km × multiplier,
 * every extra km still pays more than the last.
 * @param {number} km - The haul's length
 * @param {number} spanKm - The map's span (see `mapSpanKm`)
 * @returns {number} The multiplier, from 1 up to 1 + maxBonus
 */
export function longHaulMultiplier(km, spanKm) {
  // A map with one town, or all towns in one spot, has no long hauls; this
  // also keeps the division below from going by zero
  if (spanKm <= 0) return 1
  const { maxBonus } = gameRules.payoffs.longHaul
  return 1 + (maxBonus * Math.log(1 + km / spanKm)) / Math.LN2
}

/**
 * What delivering a commodity to a town pays: the per-km rate times the
 * long-haul multiplier, rounded, and never under the minimum.
 * @param {Object} destination - The town it is wanted in, with lat and lon
 * @param {string} industry - The commodity's name
 * @param {Array<Object>} towns - Every town, each with lat, lon and industries
 * @param {number} spanKm - The map's span (see `mapSpanKm`)
 * @returns {number} The payoff, in dollars; the minimum when no other town
 *   produces the commodity
 */
export function demandPayoff(destination, industry, towns, spanKm) {
  const { perKm, roundTo, minimum } = gameRules.payoffs
  const km = haulKm(destination, industry, towns) ?? 0
  const dollars = km * perKm * longHaulMultiplier(km, spanKm)
  return Math.max(minimum, Math.round(dollars / roundTo) * roundTo)
}
