/**
 * Town Industries (townIndustries.js)
 *
 * Which towns make which industries.
 *
 * The game knows about 125 industries (public/data/game_industries.csv).
 * Every board can draw on all of them; which ones it ends up with depends on
 * where its towns' jobs are.
 *
 * 1. Scoring (`candidatePairs`): each town's industries are scored by their
 *    "extra jobs": the town's jobs in the industry, minus what an average
 *    town with the same total jobs would have (its total jobs times the
 *    industry's share of the country's jobs). So a town counts for what it
 *    is unusually good at, not for what every town has: a small town with a
 *    tannery scores for leather, and a big city scores for little but what
 *    it is known for. An industry whose extra jobs are under a small share
 *    of the town's jobs is not a candidate there at all.
 *
 *    The farm and fishing industries are scored with their jobs multiplied
 *    (see `undercountMultiplier`): the jobs data counts only jobs on a
 *    payroll, and most farmers and fishermen work for themselves.
 *
 * 2. Handing out (`assignIndustries`): every pair of town and industry, from
 *    the most extra jobs down, is given out unless the town already makes
 *    three things (its Tourism included) or the industry already has its
 *    share of the board's towns.
 *
 * 3. Shaping: then, so the board looks something like Empire Builder's,
 *    where most cities make one or two things:
 *    - only so many towns keep a third thing: those where it is the biggest
 *      part of the town's jobs, its extra jobs over the town's jobs, a
 *      town's "strength" in it. The others drop it;
 *    - likewise, only so many keep a second thing;
 *    - and if too few towns make nothing, the towns whose best thing is the
 *      weakest are emptied, until enough are.
 *    Ranking by strength rather than by jobs lets a small town that leans
 *    hard on an industry beat a big city where it is one of many. Tourism
 *    is never dropped, so a major city is never emptied.
 *
 * The limits are in `townIndustryConfig`. Pure functions over plain data, so
 * they are tested without stores.
 *
 * @module composables/setup/townIndustries
 */

import { townIndustryConfig } from '@/config/towns'

/**
 * Takes away floating-point noise before rounding a share of the towns up:
 * 14% of 50 towns comes out a hair over 7, which would round up to 8
 */
const ROUNDING_ALLOWANCE = 1e-9

/**
 * Every pair of town and industry that could be given out: an industry
 * whose extra jobs in a town are at least `minExtraShare` of the town's jobs.
 *
 * @param {Array<{msa: string}>} towns - The towns on the board
 * @param {Array<{industry: number, label: string, nationalShare: number, meanEmp: Object}>} employment -
 *   The industries: each one's NAICS code, its name in the game, its share
 *   of the country's jobs, and its jobs by area code
 * @param {Object} totalJobs - Each area's jobs in all industries, by area code
 * @param {Object} [config] - See `townIndustryConfig`
 * @returns {Array<{town: number, industry: Object, extra: number, strength: number}>}
 *   The pairs, most extra jobs first: the town's index in `towns`, the
 *   industry from `employment`, its extra jobs there, and those as a share
 *   of the town's jobs. Ties go by NAICS code and then town, so the same
 *   data always gives the same board.
 */
export function candidatePairs(towns, employment, totalJobs, config = townIndustryConfig) {
  const undercounted = new Set(config.undercountIndustries.map(String))
  const pairs = []
  towns.forEach((town, index) => {
    const total = totalJobs[town.msa] ?? 0
    if (!(total > 0)) return
    employment.forEach((industry) => {
      const jobs = industry.meanEmp[town.msa] ?? 0
      if (!(jobs > 0)) return
      const multiplier = undercounted.has(String(industry.industry))
        ? config.undercountMultiplier
        : 1
      // Multiplied after the average town's share is taken off, which is
      // the same as multiplying both the town's jobs and the country's
      const extra = multiplier * (jobs - total * industry.nationalShare)
      if (extra >= config.minExtraShare * total) {
        pairs.push({ town: index, industry, extra, strength: extra / total })
      }
    })
  })
  return pairs.sort(
    (a, b) =>
      b.extra - a.extra ||
      String(a.industry.industry).localeCompare(String(b.industry.industry)) ||
      a.town - b.town
  )
}

/**
 * Keeps a thing in a given place of the towns' lists only in the strongest
 * towns: those whose thing there is the biggest share of their jobs. The
 * rest drop it, and anything after it.
 * @param {Array<Array<{strength: number}>>} held - Each town's things, in
 *   the order they were given; changed here
 * @param {number} place - Which thing: 1 for the second, 2 for the third
 * @param {number} limit - How many towns may keep one there
 */
function keepStrongest(held, place, limit) {
  held
    .map((things, town) => ({ things, town }))
    .filter(({ things }) => things.length > place)
    .sort((a, b) => b.things[place].strength - a.things[place].strength || a.town - b.town)
    .slice(limit)
    .forEach(({ things }) => things.splice(place))
}

/**
 * Empties the towns whose best thing is weakest until enough towns make
 * nothing. That is nearly always a town that makes one thing, since a town
 * that kept a second is strong in its first. A town that makes something
 * it always does (Tourism) is never emptied.
 * @param {Array<Array<{strength: number}>>} held - Each town's things;
 *   changed here
 * @param {number} wanted - How many towns should make nothing
 */
function emptyWeakest(held, wanted) {
  const alreadyEmpty = held.filter((things) => things.length === 0).length
  held
    .map((things, town) => ({ things, town }))
    .filter(
      ({ things }) => things.length > 0 && things.every(({ strength }) => strength < Infinity)
    )
    .sort((a, b) => a.things[0].strength - b.things[0].strength || a.town - b.town)
    .slice(0, Math.max(0, wanted - alreadyEmpty))
    .forEach(({ things }) => things.splice(0))
}

/**
 * Gives the board's towns their industries (see the module's notes).
 *
 * @param {Array<Object>} towns - The towns on the board, each with msa and
 *   industries (Tourism already given to the major cities, which keep it)
 * @param {Array<Object>} employment - The industries (see `candidatePairs`)
 * @param {Object} totalJobs - Each area's jobs in all industries, by area code
 * @param {Object} [config] - See `townIndustryConfig`
 * @returns {Array<Object>} The towns, copied, each with its industries added
 *   as {name, industry}
 */
export function assignIndustries(towns, employment, totalJobs, config = townIndustryConfig) {
  const townCount = towns.length

  // Each town's things, what it already makes first, never to be dropped
  const held = towns.map((town) => town.industries.map((made) => ({ made, strength: Infinity })))

  // From the most extra jobs down, within the limits per town and per industry
  const perIndustry = Math.max(1, Math.floor(config.maxTownShare * townCount))
  const townsOf = new Map()
  candidatePairs(towns, employment, totalJobs, config).forEach(({ town, industry, strength }) => {
    const taken = townsOf.get(industry.industry) ?? 0
    if (held[town].length >= config.maxPerTown || taken >= perIndustry) return
    held[town].push({ made: { name: industry.label, industry: industry.industry }, strength })
    townsOf.set(industry.industry, taken + 1)
  })

  // The town shapes: few with three things, not too many with two, and
  // some with none
  keepStrongest(held, 2, Math.floor(config.maxThreeShare * townCount))
  keepStrongest(held, 1, Math.floor(config.maxTwoShare * townCount))
  emptyWeakest(held, Math.ceil(config.minNoneShare * townCount - ROUNDING_ALLOWANCE))

  return towns.map((town, index) => ({
    ...town,
    industries: held[index].map(({ made }) => made)
  }))
}
