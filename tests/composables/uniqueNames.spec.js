/**
 * Unique Town Names Tests
 *
 * No two towns on a board may share a name, since demands name their
 * destination by name alone. Of towns sharing a name in one state, only the
 * biggest is kept; towns sharing a name across states each carry their
 * state.
 */

import { describe, it, expect } from 'vitest'
import { dropSameStateNamesakes, nameNamesakesByState } from '@/composables/setup/uniqueNames'

/**
 * A town, by name, state FIPS code and population.
 * @returns {Object} The town
 */
const town = (name, stateCode, population) => ({
  msa: `${name}-${stateCode}-${population}`,
  name,
  stateCode,
  population
})

/** The towns' names */
const names = (towns) => towns.map(({ name }) => name)

describe('dropSameStateNamesakes', () => {
  it('should keep only the biggest of towns sharing a name in one state', () => {
    const towns = [town('Springfield', '17', 50000), town('Springfield', '17', 200000)]

    const kept = dropSameStateNamesakes(towns)

    expect(kept).toEqual([towns[1]])
  })

  it('should keep towns sharing a name in different states', () => {
    const towns = [
      town('Springfield', '17', 200000),
      town('Springfield', '25', 700000),
      town('Springfield', '17', 50000)
    ]

    expect(dropSameStateNamesakes(towns)).toEqual([towns[0], towns[1]])
  })

  it('should keep every town with a name of its own', () => {
    const towns = [town('Greenville', '45', 962000), town('Asheville', '37', 415000)]

    expect(dropSameStateNamesakes(towns)).toEqual(towns)
  })
})

describe('nameNamesakesByState', () => {
  it('should give every town sharing a name its state', () => {
    const towns = [town('Greenville', '45', 962000), town('Greenville', '37', 177000)]

    expect(names(nameNamesakesByState(towns))).toEqual(['Greenville, SC', 'Greenville, NC'])
  })

  it('should leave a name no other town has alone', () => {
    const towns = [town('Greenville', '45', 962000), town('Asheville', '37', 415000)]

    expect(nameNamesakesByState(towns)).toEqual(towns)
  })

  it('should not change the towns it is given', () => {
    const towns = [town('Greenville', '45', 962000), town('Greenville', '37', 177000)].map((t) =>
      Object.freeze(t)
    )

    nameNamesakesByState(towns)

    expect(towns[0].name).toBe('Greenville')
  })
})
