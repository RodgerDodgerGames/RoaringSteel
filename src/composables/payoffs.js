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
 * so the payoff is multiplied by a factor that grows exponentially with how
 * far the haul is, measured against the map's own span — the distance
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
 *   share      = km / span                       (0 to 1)
 *   multiplier = 1 + maxBonus · (e^(steepness · share) − 1) / (e^steepness − 1)
 *
 * The fraction is an exponential curve squeezed to run from 0 at no distance
 * to 1 at the full span: e^0 − 1 is 0 on top, and at the full span the top and
 * bottom are equal. So a haul of no length pays the plain per-km rate and the
 * map's longest possible haul pays exactly (1 + maxBonus) times it.
 *
 * In between, the curve is exponential: it stays low for short and middling
 * hauls and climbs fastest at the far end, so the bonus is saved for the
 * hauls that really cross the map. `steepness` sets how hard it bends. At 2,
 * a haul a quarter of the way across gets about a tenth of the bonus and one
 * halfway across about a quarter of it; higher holds more back for the very
 * longest hauls, and values near 0 straighten it into a plain line.
 * @param {number} km - The haul's length
 * @param {number} spanKm - The map's span (see `mapSpanKm`)
 * @returns {number} The multiplier, from 1 up to 1 + maxBonus
 */
export function longHaulMultiplier(km, spanKm) {
  // A map with one town, or all towns in one spot, has no long hauls; this
  // also keeps the division below from going by zero
  if (spanKm <= 0) return 1
  const { maxBonus, steepness } = gameRules.payoffs.longHaul
  // A haul runs between two of the map's towns, so it should never be longer
  // than the span. Capped anyway: past the span the exponential runs away
  // fast (twice the span would pay over 9 times the rate), so a span worked
  // out from a different set of towns must not turn into a runaway payoff.
  const share = Math.min(1, km / spanKm)
  // At a steepness of 0 the curve is 0 / 0, and it tends to a straight line
  // as steepness shrinks, so use the line. A negative or missing steepness
  // gets the line too, rather than a curve bent the wrong way or NaN.
  const curve = steepness > 0 ? Math.expm1(steepness * share) / Math.expm1(steepness) : share
  return 1 + maxBonus * curve
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
