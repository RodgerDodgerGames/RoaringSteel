/**
 * Town Spacing (townSpacing.js)
 *
 * Keeps a board's towns from crowding each other, so that no two towns are
 * closer than the distances in `townSpacingConfig` (config/towns.js).
 *
 * A town is a Census metro or micro area, and those are drawn by where
 * people commute, not by how a board looks. In thickly settled country they
 * sit close together: BosWash had towns 1.6 speed units apart, where Empire
 * Builder's cities are spread out across its map. Two steps space them out,
 * both run during town setup (see stores/towns.js):
 *
 * 1. Merging (`mergeCities`), right after the towns are sized: major and
 *    medium cities too close together are made one town, as the Census
 *    Bureau already makes one area of Minneapolis and St. Paul. Raleigh and
 *    Durham become Raleigh-Durham, at Raleigh's spot, with both areas'
 *    people, and with both areas' jobs when industries are handed out (see
 *    `combinedJobs`). Big cities are never just dropped. The board keeps
 *    its counts of major and medium cities, promoting the next town in line
 *    that has room around it.
 *
 * 2. Thinning (`thinTowns`), once the towns have their industries: small
 *    towns too close to another are left off the board. Which of two close
 *    towns stays is decided by a line-up: major and medium cities first,
 *    then small towns that are the only one on the board making something,
 *    then the other small towns, biggest first in each group. So a
 *    specialist beats a bigger town: Wilson, the only tobacco town on its
 *    board, stays, and Rocky Mount, twice its size, goes. There are no
 *    exceptions to the distance: two specialists too close together lose
 *    the smaller one, and its industry leaves the board with it.
 *
 * Distances here are in km. The store turns the config's speed units into
 * km for the board being set up.
 *
 * Pure functions over plain data, so they are tested without stores.
 *
 * @module composables/setup/townSpacing
 */

import { distance } from '@turf/turf'
import { assignSizes } from './townSizes'

/**
 * The straight-line distance between two towns.
 * @param {{lon: number, lat: number}} a - One town
 * @param {{lon: number, lat: number}} b - The other
 * @returns {number} Kilometers
 */
function kmApart(a, b) {
  return distance([a.lon, a.lat], [b.lon, b.lat])
}

/**
 * Groups towns that are close together: two towns closer than `km` are in
 * the same group, and so is any town close to either of them. So three
 * cities in a row, each close to the next, are one group even if the two at
 * the ends are further apart.
 * @param {Array<Object>} towns - The towns to group, each with lon and lat
 * @param {number} km - How close two towns must be to be grouped
 * @returns {Array<Array<Object>>} The groups, each biggest town first; a
 *   town close to no other is a group of its own
 */
function closeGroups(towns, km) {
  const grouped = new Set()
  const groups = []
  towns.forEach((start) => {
    if (grouped.has(start)) return
    // Spread out from the first town to every town close to one already in
    // the group, until no more are found
    const group = [start]
    grouped.add(start)
    for (let i = 0; i < group.length; i++) {
      towns.forEach((other) => {
        if (!grouped.has(other) && kmApart(group[i], other) < km) {
          grouped.add(other)
          group.push(other)
        }
      })
    }
    groups.push(group.sort((a, b) => b.population - a.population))
  })
  return groups
}

/**
 * Makes one town of a group of close cities. It stands at the biggest
 * city's spot, under its area code and state, with everyone's people. Its
 * name is all the cities' names, biggest first, joined by hyphens, such as
 * "Raleigh-Durham".
 * @param {Array<Object>} group - The cities, biggest first
 * @returns {Object} The merged town
 */
function mergeGroup(group) {
  const [biggest] = group
  return {
    ...biggest,
    name: group.map(({ name }) => name).join('-'),
    fullName: group.map(({ fullName }) => fullName).join(' / '),
    population: group.reduce((sum, { population }) => sum + population, 0)
  }
}

/**
 * Whether any of some towns is closer to a town than `km`.
 * @param {Object} town - The town, with lon and lat
 * @param {Iterable<Object>} others - The towns to measure from
 * @param {number} km - How close is too close
 * @returns {boolean} Whether one is too close
 */
function isNearAny(town, others, km) {
  for (const other of others) {
    if (kmApart(other, town) < km) return true
  }
  return false
}

/**
 * Sizes the towns again once close cities are merged: by population,
 * merged towns by their combined people, keeping the board's counts of
 * major cities and medium towns.
 *
 * Each merge frees a place, and the next town in line is promoted into it,
 * unless it is too close to a city already made major or medium, which it
 * would crowd. Such a town is passed over for the next: it stays small, and
 * is thinned with the other small towns (see `thinTowns`). The big cities
 * left after the merge are all far enough apart, so each keeps a place.
 *
 * @param {Array<Object>} towns - The towns; their sizes are set here
 * @param {{large: number, medium: number}} counts - How many major cities
 *   and medium towns to make
 * @param {number} mergeKm - How close is too close to a big city
 * @returns {Array<Object>} The same towns, biggest first
 */
function resizeSpaced(towns, { large, medium }, mergeKm) {
  const ranked = [...towns].sort((a, b) => b.population - a.population)
  // The major and medium cities, biggest first
  const bigCities = []
  ranked.forEach((town) => {
    if (bigCities.length < large + medium && !isNearAny(town, bigCities, mergeKm)) {
      bigCities.push(town)
    }
  })
  ranked.forEach((town) => {
    const rank = bigCities.indexOf(town)
    town.size = rank === -1 ? 'small' : rank < large ? 'large' : 'medium'
  })
  return ranked
}

/**
 * Sizes the board's towns, then makes one town of each group of major and
 * medium cities closer together than `mergeKm` (see the module's notes),
 * and sizes them again (see `resizeSpaced`).
 *
 * Small towns are never merged: those too close to another are thinned once
 * the board has its industries (see `thinTowns`).
 *
 * @param {Array<Object>} towns - The board's towns, each with msa, name,
 *   fullName, population, lon, lat and industries. Not changed.
 * @param {{large: number, medium: number}} counts - How many major cities
 *   and medium towns the board has (see `sizeCounts` in townSizes.js), from
 *   all its towns before any merge
 * @param {number} mergeKm - How close two major or medium cities must be to
 *   be merged
 * @returns {{towns: Array<Object>, areasOf: Map<string, Array<string>>}}
 *   The towns, each with its size, biggest first; and for each merged town,
 *   by its area code, the codes of every area it stands for, its own first
 *   (see `combinedJobs`)
 */
export function mergeCities(towns, counts, mergeKm) {
  const sized = assignSizes(
    towns.map((town) => ({ ...town, industries: [...town.industries] })),
    counts
  )
  const merging = closeGroups(
    sized.filter(({ size }) => size !== 'small'),
    mergeKm
  ).filter((group) => group.length > 1)
  const areasOf = new Map()
  if (merging.length === 0) return { towns: sized, areasOf }

  // Each group's biggest city is replaced by the merged town, and the rest
  // are taken off
  const replacements = new Map()
  const absorbed = new Set()
  merging.forEach((group) => {
    const [biggest, ...rest] = group
    replacements.set(biggest, mergeGroup(group))
    rest.forEach((city) => absorbed.add(city))
    areasOf.set(
      biggest.msa,
      group.map(({ msa }) => msa)
    )
  })
  const merged = sized
    .filter((town) => !absorbed.has(town))
    .map((town) => replacements.get(town) ?? town)
  return { towns: resizeSpaced(merged, counts, mergeKm), areasOf }
}

/**
 * The jobs data with each merged town's areas added together under its own
 * area code, so its industries are worked out from everyone's jobs: Raleigh-
 * Durham's from Raleigh's jobs and Durham's together (see townIndustries.js).
 * @param {Array<{meanEmp: Object}>} employment - The industries, each with
 *   its jobs by area code. Not changed.
 * @param {Object} totalJobs - Each area's jobs in all industries, by area
 *   code. Not changed.
 * @param {Map<string, Array<string>>} areasOf - The areas each merged town
 *   stands for (see `mergeCities`)
 * @returns {{employment: Array<Object>, totalJobs: Object}} The jobs, with
 *   the merged towns' added up; the same objects when nothing was merged
 */
export function combinedJobs(employment, totalJobs, areasOf) {
  if (areasOf.size === 0) return { employment, totalJobs }
  /** A copy of jobs by area, with each merged town's areas added up */
  const combine = (byArea) => {
    const combined = { ...byArea }
    areasOf.forEach((areas, msa) => {
      combined[msa] = areas.reduce((sum, area) => sum + (byArea[area] ?? 0), 0)
    })
    return combined
  }
  return {
    employment: employment.map((industry) => ({ ...industry, meanEmp: combine(industry.meanEmp) })),
    totalJobs: combine(totalJobs)
  }
}

/**
 * Leaves off the board every small town closer than `gapKm` to a town kept
 * ahead of it (see the module's notes).
 *
 * The towns are lined up: major and medium cities, then small towns that
 * are the only one on the board making something, then the other small
 * towns, biggest first in each group. Going down the line, each town is
 * kept unless it is small and a town already kept is too close. Only kept
 * towns crowd others out, so a town dropped for being too close to a big
 * city does not take a town further along with it.
 *
 * Major and medium cities are always kept: they are already spaced out by
 * `mergeCities`.
 *
 * @param {Array<Object>} towns - The board's towns, each with size,
 *   population, lon, lat and industries ({industry} each)
 * @param {number} gapKm - How close a small town may be to a town kept
 *   ahead of it
 * @returns {Array<Object>} The towns kept, in the order they were given
 */
export function thinTowns(towns, gapKm) {
  // How many towns make each industry, by its code
  const makers = new Map()
  towns.forEach((town) =>
    town.industries.forEach(({ industry }) => makers.set(industry, (makers.get(industry) ?? 0) + 1))
  )
  /** Where a town comes in the line-up: 0 first, 2 last */
  const group = (town) => {
    if (town.size !== 'small') return 0
    return town.industries.some(({ industry }) => makers.get(industry) === 1) ? 1 : 2
  }
  const lineUp = [...towns].sort((a, b) => group(a) - group(b) || b.population - a.population)

  const kept = new Set()
  lineUp.forEach((town) => {
    const isCrowded = town.size === 'small' && isNearAny(town, kept, gapKm)
    if (!isCrowded) kept.add(town)
  })
  return towns.filter((town) => kept.has(town))
}
