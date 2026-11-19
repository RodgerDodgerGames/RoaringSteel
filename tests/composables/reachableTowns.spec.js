/**
 * Reachable Towns Tests
 *
 * Towns track cannot join to the biggest city, such as those on islands too
 * far out to bridge, are left off the board, and only those (see
 * composables/reachableTowns.js), on a board of a mainland and
 * three islands (see tests/utils/islandBoard.js).
 */

import { describe, it, expect } from 'vitest'
import { reachableTowns } from '@/composables/reachableTowns'
import { townCells } from '@/composables/map/buildRules'
import { regionTest } from '@/composables/map/region'
import {
  makeIslandGrid,
  makeIslandTowns,
  islandTown,
  ISLAND_SPEED_UNIT_KM
} from '../utils/islandBoard'

/**
 * The build rules for the island board, with no region (so the whole grid
 * is inside it) and no rivers.
 * @param {Array<Object>} towns - The towns on the board
 * @returns {Object} The rules, as `boardRules` in trackBuilder.js holds them
 */
function rulesFor(towns) {
  const grid = makeIslandGrid()
  return {
    grid,
    priceScale: 1,
    speedUnitKm: ISLAND_SPEED_UNIT_KM,
    rivers: null,
    townCells: townCells(towns, grid),
    isInRegion: regionTest(null)
  }
}

const names = (towns) => towns.map(({ name }) => name)

describe('reachableTowns', () => {
  it('keeps every town when track can join them all, as the same list', () => {
    const { West, Middle, East } = makeIslandTowns()
    const towns = [West, Middle, East]
    expect(reachableTowns(rulesFor(towns), towns)).toBe(towns)
  })

  it('keeps a town across water narrow enough to bridge', () => {
    const { West, East, Near } = makeIslandTowns()
    const towns = [West, East, Near]
    expect(names(reachableTowns(rulesFor(towns), towns))).toEqual(['West', 'East', 'Near'])
  })

  it('drops the towns across water too wide to bridge, together, though track could join them to each other', () => {
    const all = makeIslandTowns()
    const towns = Object.values(all)
    expect(names(reachableTowns(rulesFor(towns), towns))).toEqual([
      'West',
      'Middle',
      'East',
      'Near'
    ])
  })

  it('keeps the towns joined to the biggest city, wherever it comes in the list', () => {
    const { Middle, East, Near, Far, Farther } = makeIslandTowns()
    const big = islandTown('Big', 0, 5_000_000)
    const towns = [Far, Farther, Middle, East, Near, big]
    expect(names(reachableTowns(rulesFor(towns), towns))).toEqual(['Middle', 'East', 'Near', 'Big'])
  })

  it('keeps an island and drops the mainland when the biggest city is on the island', () => {
    // Not a board the game makes, but the rule is to stay with the biggest city
    const { West, Middle, Far, Farther } = makeIslandTowns()
    const big = islandTown('Big', 16, 5_000_000)
    const towns = [West, Middle, Far, big, Farther]
    expect(names(reachableTowns(rulesFor(towns), towns))).toEqual(['Far', 'Big', 'Farther'])
  })

  it('keeps a lone town', () => {
    const { Far } = makeIslandTowns()
    expect(reachableTowns(rulesFor([Far]), [Far])).toEqual([Far])
  })
})
