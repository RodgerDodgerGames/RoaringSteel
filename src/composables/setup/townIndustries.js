/**
 * Town Industries (townIndustries.js)
 *
 * Which industries a board plays with, and which towns make them.
 *
 * The game knows about fifty industries (public/data/game_industries.csv),
 * each in a category: Farm, Mining, Food, Materials, Metals, Goods,
 * Machinery, Vehicles. A board plays with only some of them, so its demand
 * cards and its map's icons stay few enough to learn in one game.
 *
 * 1. Choosing (`chooseIndustries`): a bigger board, with more towns, plays
 *    with more industries, between a floor and a ceiling (see
 *    `townIndustryConfig`). They are taken a category at a time, round and
 *    round: each category's biggest industry on the board, then each one's
 *    next biggest, and so on, the categories with the most jobs going first.
 *    So a farming state still gets a factory or two, and an industrial one
 *    still gets its farms. An industry with only a sliver of the board's jobs
 *    is passed over. Only jobs in the board's own towns count (see
 *    `boardEmployment`).
 *
 * 2. Assigning (`assignIndustries`): an industry goes to the towns where it
 *    is most concentrated — its jobs per person — rather than simply the
 *    biggest towns. Its towns are split by concentration into high, medium
 *    and low (see `naturalBreaks`); it can go to the high ones first, then
 *    the medium ones, and to a low one only if it would otherwise go to no
 *    town at all.
 *
 *    Two limits hold throughout: a town makes at most three things, its
 *    Tourism included; and an industry goes to no more towns than its share
 *    of the board's jobs in the chosen industries, held to at most 20%, says
 *    (but always at least one). The industries take turns, each getting its
 *    best town still free before any gets its second, and those with the
 *    fewest towns to choose from going first in every round, so one with
 *    many choices cannot fill the towns another needed.
 *
 * Pure functions over plain data, so they are tested without stores.
 *
 * @module composables/setup/townIndustries
 */

import { townIndustryConfig } from '@/config/towns'

/**
 * How many jobs an industry has on the board, across all its areas.
 * @param {{meanEmp: Object}} industry - The industry's jobs, by area
 * @returns {number} Its jobs
 */
function jobsOf(industry) {
  return Object.values(industry.meanEmp).reduce((sum, jobs) => sum + jobs, 0)
}

/**
 * The board's jobs by industry: each industry's jobs in the areas whose
 * towns are on the board, and only those. A state's jobs data covers every
 * area with a part in it, some of whose towns are off the board
 * (Massachusetts's covers Providence's area, whose town is in Rhode
 * Island); counted, an industry could be chosen for jobs no town on the
 * board has.
 * @param {Array<{meanEmp: Object}>} employment - Jobs by industry and area
 *   (the industry store's `employmentData`)
 * @param {Array<{msa: string}>} towns - The towns on the board
 * @returns {Array<Object>} The industries, each with only its jobs on the
 *   board in `meanEmp`
 */
export function boardEmployment(employment, towns) {
  const onBoard = new Set(towns.map(({ msa }) => String(msa)))
  return employment.map((industry) => ({
    ...industry,
    meanEmp: Object.fromEntries(
      Object.entries(industry.meanEmp).filter(([msa]) => onBoard.has(msa))
    )
  }))
}

/**
 * How many industries a board with this many towns plays with: a share of
 * its towns, between the floor and the ceiling, and no more than its towns
 * have room for.
 * @param {number} townCount - The towns on the board
 * @param {number} freeSlots - How many industries its towns can still take,
 *   with their Tourism counted
 * @param {Object} [config] - See `townIndustryConfig`
 * @returns {number} How many industries
 */
export function industryCount(townCount, freeSlots, config = townIndustryConfig) {
  const { industriesPerTown, minIndustries, maxIndustries } = config
  const wanted = Math.round(townCount * industriesPerTown)
  const held = Math.min(maxIndustries, Math.max(minIndustries, wanted))
  return Math.max(0, Math.min(held, freeSlots))
}

/**
 * Chooses the industries a board plays with, taking turns between the
 * categories so the board gets a spread of them (see the module's notes).
 *
 * @param {Array<{industry: number, category: string, meanEmp: Object}>} employment -
 *   The board's jobs by industry and area (the industry store's
 *   `employmentData`)
 * @param {number} count - How many to choose (see `industryCount`)
 * @param {Object} [config] - See `townIndustryConfig`
 * @returns {Array<Object>} The industries chosen, from `employment`, in the
 *   order they were chosen
 */
export function chooseIndustries(employment, count, config = townIndustryConfig) {
  const withJobs = employment.map((industry) => ({ industry, jobs: jobsOf(industry) }))
  const boardJobs = withJobs.reduce((sum, { jobs }) => sum + jobs, 0)
  if (boardJobs === 0) return []

  // Each category's industries, biggest first, leaving out the slivers
  const byCategory = new Map()
  withJobs
    .filter(({ jobs }) => jobs / boardJobs >= config.minJobShare)
    .sort((a, b) => b.jobs - a.jobs)
    .forEach((entry) => {
      const category = entry.industry.category ?? ''
      if (!byCategory.has(category)) byCategory.set(category, { jobs: 0, queue: [] })
      const group = byCategory.get(category)
      group.jobs += entry.jobs
      group.queue.push(entry.industry)
    })

  // The categories with the most jobs choose first in every round
  const categories = [...byCategory.values()].sort((a, b) => b.jobs - a.jobs)
  const chosen = []
  while (chosen.length < count && categories.some(({ queue }) => queue.length > 0)) {
    for (const { queue } of categories) {
      if (chosen.length >= count) break
      if (queue.length > 0) chosen.push(queue.shift())
    }
  }
  return chosen
}

/**
 * Splits values into classes at their widest gaps: three classes are split
 * at the two widest gaps between neighboring values, so the values in a
 * class sit closer to one another than to the next class.
 *
 * @param {Array<number>} values - The values, in any order
 * @param {number} classCount - How many classes
 * @returns {Array<number>} Each value's class, in the order given: 0 for the
 *   lowest, classCount - 1 for the highest
 */
export function naturalBreaks(values, classCount) {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value)

  // The gap below each value; the lowest has none. The widest are where the
  // classes break: a class starts at each of them.
  const starts = order
    .map((entry, i) => ({ i, gap: i === 0 ? 0 : entry.value - order[i - 1].value }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, classCount - 1)
    .map(({ i }) => i)
    .sort((a, b) => a - b)

  // Every value from one break up to the next is in that break's class, and
  // those past the last break in the highest. A break at the very bottom
  // leaves its class empty, as when there are fewer values than classes.
  const classes = new Array(values.length)
  let from = 0
  starts.forEach((end, cls) => {
    for (let i = from; i < end; i++) classes[order[i].index] = cls
    from = end
  })
  for (let i = from; i < order.length; i++) classes[order[i].index] = classCount - 1
  return classes
}

/**
 * The towns an industry may go to, best first: those in its high class of
 * concentration, then its medium class, each most concentrated first. Its
 * low class is kept apart, for an industry that would otherwise go nowhere.
 * @param {Object} industry - From the industry store's `employmentData`
 * @param {Array<Object>} towns - The towns on the board, each with msa and
 *   population
 * @returns {{preferred: Array<number>, fallback: Array<number>}} Indexes into
 *   `towns`: the high and medium classes, and the low class
 */
function candidateTowns(industry, towns) {
  const concentrated = towns
    .map((town, index) => ({
      index,
      density: town.population > 0 ? (industry.meanEmp[town.msa] ?? 0) / town.population : 0
    }))
    .filter(({ density }) => density > 0)
  const HIGH = 2
  const MEDIUM = 1
  const LOW = 0
  const classes = naturalBreaks(
    concentrated.map(({ density }) => density),
    3
  )
  const inClass = (cls) =>
    concentrated
      .filter((_, i) => classes[i] === cls)
      .sort((a, b) => b.density - a.density)
      .map(({ index }) => index)
  return { preferred: [...inClass(HIGH), ...inClass(MEDIUM)], fallback: inClass(LOW) }
}

/**
 * The next town an industry should try. An industry whose concentrated towns
 * are all full (often a major city that makes three things already), and has
 * no town yet, moves on to the towns where it is less concentrated, rather
 * than be left off the board.
 * @param {{candidates: Array<number>, fallback: Array<number>, taken: number}} queue -
 *   The industry's towns still to try, and how many it has
 * @returns {number|undefined} The town's index; none when there is no town left
 */
function nextCandidate(queue) {
  if (queue.candidates.length === 0 && queue.taken === 0) {
    queue.candidates = queue.fallback
    queue.fallback = []
  }
  return queue.candidates.shift()
}

/**
 * Gives the board's towns their industries (see the module's notes).
 *
 * @param {Array<Object>} towns - The towns on the board, each with msa,
 *   population and industries (Tourism already given to the major cities)
 * @param {Array<Object>} chosen - The industries the board plays with (see
 *   `chooseIndustries`), each with industry (its NAICS code), meanEmp, and
 *   label (its name in the game)
 * @param {Object} [config] - See `townIndustryConfig`
 * @returns {Array<Object>} The towns, copied, each with its industries added
 *   as {name, industry}
 */
export function assignIndustries(towns, chosen, config = townIndustryConfig) {
  const result = towns.map((town) => ({ ...town, industries: [...town.industries] }))
  const chosenJobs = chosen.reduce((sum, industry) => sum + jobsOf(industry), 0)

  // Each industry's best towns still to try, and how many more it may have.
  // The industries with the fewest towns to choose from choose first: one
  // made in only two towns must not find them both taken by one that could
  // have gone to five.
  const queues = chosen.map((industry) => {
    const share = chosenJobs > 0 ? Math.min(jobsOf(industry) / chosenJobs, config.maxTownShare) : 0
    const { preferred, fallback } = candidateTowns(industry, result)
    return {
      industry,
      candidates: preferred,
      fallback,
      taken: 0,
      left: Math.max(1, Math.floor(result.length * share))
    }
  })
  queues.sort(
    (a, b) => a.candidates.length + a.fallback.length - (b.candidates.length + b.fallback.length)
  )

  // Round after round, each industry takes its best town that still has room
  let isAnyTaken = true
  while (isAnyTaken) {
    isAnyTaken = false
    for (const queue of queues) {
      if (queue.left === 0) continue
      let next
      while ((next = nextCandidate(queue)) !== undefined) {
        const town = result[next]
        if (town.industries.length >= config.maxPerTown) continue
        town.industries.push({ name: queue.industry.label, industry: queue.industry.industry })
        queue.taken++
        queue.left--
        isAnyTaken = true
        break
      }
    }
  }
  return result
}
