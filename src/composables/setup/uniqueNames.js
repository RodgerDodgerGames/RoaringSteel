/**
 * Unique Town Names (uniqueNames.js)
 *
 * Makes every town's name on a board its own (#188).
 *
 * A town is named after its main city, and on a board of several states two
 * cities can share a name: a South Atlantic board had a Greenville in South
 * Carolina and another in North Carolina, and a Jacksonville in Florida and
 * another in North Carolina. Demands name their destination by town name
 * alone, so with two Greenvilles a "Greenville" demand would pay in either,
 * the map would mark both, and the player could not tell which was meant.
 *
 * Two steps, at either end of town setup (see stores/towns.js):
 *
 * 1. Before anything else (`dropSameStateNamesakes`): of towns sharing a
 *    name in the same state, only the biggest is kept, as the state would
 *    not tell them apart. It is rare: a state's cities nearly always have
 *    names of their own. Done first, so the towns are sized, spaced out and
 *    given industries without the one dropped.
 * 2. Last of all (`nameNamesakesByState`), once no more towns will be left
 *    off the board: towns still sharing a name, now each in a different
 *    state, are every one given its state's postal abbreviation, as people
 *    write them: "Greenville, SC" and "Greenville, NC". The bigger city is
 *    not left plain, so no name on the board could mean either. Done last,
 *    so a town thinned or out of track's reach does not leave its namesake
 *    carrying a state for nothing.
 *
 * Pure functions over plain data, so they are tested without stores.
 *
 * @module composables/setup/uniqueNames
 */

import usStates from '@/config/usStates'

/**
 * Towns grouped by name.
 * @param {Array<Object>} towns - The towns, each with a name
 * @returns {Map<string, Array<Object>>} The towns of each name, in the
 *   order given
 */
function byName(towns) {
  const groups = new Map()
  towns.forEach((town) => {
    if (!groups.has(town.name)) groups.set(town.name, [])
    groups.get(town.name).push(town)
  })
  return groups
}

/**
 * Leaves out every town that shares its name with a bigger town in the same
 * state (see the module's notes).
 * @param {Array<Object>} towns - The towns, each with name, stateCode (its
 *   main city's state) and population
 * @returns {Array<Object>} The towns kept, in the order given
 */
export function dropSameStateNamesakes(towns) {
  const dropped = new Set()
  byName(towns).forEach((namesakes) => {
    const states = new Set()
    ;[...namesakes]
      .sort((a, b) => b.population - a.population)
      .forEach((town) => {
        if (states.has(town.stateCode)) dropped.add(town)
        else states.add(town.stateCode)
      })
  })
  return towns.filter((town) => !dropped.has(town))
}

/**
 * Gives every town that shares its name with another its state's postal
 * abbreviation, "Greenville, SC" (see the module's notes). The towns are
 * expected to be in different states by now (see `dropSameStateNamesakes`).
 * @param {Array<Object>} towns - The towns, each with name and stateCode.
 *   Not changed.
 * @returns {Array<Object>} The same towns in the same order; a renamed town
 *   is a copy with its new name
 */
export function nameNamesakesByState(towns) {
  const renamed = new Map()
  byName(towns).forEach((namesakes) => {
    if (namesakes.length === 1) return
    namesakes.forEach((town) => {
      // A state not listed keeps its code, rather than lose the name
      const abbr = usStates.find(({ fips }) => fips === town.stateCode)?.abbr ?? town.stateCode
      renamed.set(town, { ...town, name: `${town.name}, ${abbr}` })
    })
  })
  return towns.map((town) => renamed.get(town) ?? town)
}
