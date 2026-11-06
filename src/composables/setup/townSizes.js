/**
 * Town Sizes (townSizes.js)
 *
 * Sorts a board's towns into major cities, medium towns and small towns, by
 * population: the biggest few are major cities, the next few medium, and
 * the rest small, each a share of the board's towns (see townSizeConfig in
 * config/towns.js).
 *
 * Sizes used to be set where the population had its biggest gaps. On a
 * board where one city towers over the rest that made it the only major
 * city, and the next the only medium town: Wisconsin had Milwaukee and
 * Madison and nothing else bigger than small. Ranking gives every board a
 * few of each, in proportion to its towns.
 *
 * Pure functions over plain data, so they are tested without stores.
 *
 * @module composables/setup/townSizes
 */

import { townSizeConfig } from '@/config/towns'

/**
 * How many towns of each size a board of this many towns has.
 * @param {number} count - How many towns the board has
 * @param {{largeShare: number, mediumShare: number}} [shares] - The shares
 *   of major cities and medium towns; townSizeConfig's if left out
 * @returns {{large: number, medium: number}} How many major cities and
 *   medium towns; the rest are small
 */
export function sizeCounts(count, shares = townSizeConfig) {
  if (count === 0) return { large: 0, medium: 0 }
  const large = Math.max(1, Math.round(count * shares.largeShare))
  const medium = count >= 3 ? Math.max(1, Math.round(count * shares.mediumShare)) : 0
  // A tiny board cannot have more major cities and medium towns than towns
  return { large: Math.min(large, count), medium: Math.min(medium, count - large) }
}

/**
 * Gives each town its size: "large", "medium" or "small".
 * @param {Array<Object>} towns - The board's towns, each with a population
 * @param {{largeShare: number, mediumShare: number}} [shares] - See `sizeCounts`
 * @returns {Array<Object>} The same towns, each with its `size` set, biggest
 *   first
 */
export function assignSizes(towns, shares = townSizeConfig) {
  const { large, medium } = sizeCounts(towns.length, shares)
  const ranked = [...towns].sort((a, b) => b.population - a.population)
  ranked.forEach((town, rank) => {
    town.size = rank < large ? 'large' : rank < large + medium ? 'medium' : 'small'
  })
  return ranked
}
