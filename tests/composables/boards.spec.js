/**
 * Boards Tests
 *
 * A board is one state or a region of several, kept as one outline. A
 * region's board joins its states into one shape, lists their FIPS codes for
 * setting up their towns, and has its own key for keeping its grid. A
 * state's board keeps its FIPS code as its key, so grids kept before regions
 * existed are still found. The regions file is edited by hand, so it is
 * checked too: every state on the mainland in some region of each grouping,
 * and in two regions only where the grouping means it to be.
 */

import { describe, it, expect } from 'vitest'
import {
  boardGroupings,
  boardKey,
  boardStates,
  boardsFor,
  regionBoard,
  stateBoard,
  STATES_GROUPING
} from '@/composables/setup/boards'
import { REGION_GROUPINGS } from '@/config/regions'
import usStates from '@/config/usStates'

/**
 * A state as us-states.geojson has it: a square one degree across, its
 * corner at (lng, lat).
 */
const square = (fips, name, lng, lat) => ({
  type: 'Feature',
  properties: { STATE: fips, NAME: name },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [lng, lat],
        [lng + 1, lat],
        [lng + 1, lat + 1],
        [lng, lat + 1],
        [lng, lat]
      ]
    ]
  }
})

// Side by side, sharing an edge; and one apart from them
const connecticut = square('09', 'Connecticut', -73, 41)
const rhodeIsland = square('44', 'Rhode Island', -72, 41)
const maine = square('23', 'Maine', -70, 45)
const STATES = [connecticut, rhodeIsland, maine]

describe('regionBoard', () => {
  it("should join a region's neighboring states into one shape", () => {
    const board = regionBoard({ id: 'south', name: 'South', states: ['CT', 'RI'] }, STATES)

    expect(board.geometry.type).toBe('Polygon')
    expect(board.properties).toEqual({ NAME: 'South', STATES: ['09', '44'] })
  })

  it('should keep states that do not touch as separate pieces of one board', () => {
    const board = regionBoard({ id: 'apart', name: 'Apart', states: ['CT', 'ME'] }, STATES)

    expect(board.geometry.type).toBe('MultiPolygon')
    expect(board.geometry.coordinates).toHaveLength(2)
  })

  it('should leave out a state with no outline, and give no board when none has one', () => {
    expect(
      regionBoard({ id: 'x', name: 'X', states: ['CT', 'TX'] }, STATES).properties.STATES
    ).toEqual(['09'])
    expect(regionBoard({ id: 'y', name: 'Y', states: ['TX'] }, STATES)).toBeNull()
  })
})

describe('boardStates and boardKey', () => {
  it("should give a state's board its own state, keyed by its FIPS code", () => {
    const board = stateBoard(connecticut)

    expect(boardStates(board)).toEqual(['09'])
    expect(boardKey(board)).toBe('09')
  })

  it("should give a region's board all its states, keyed by them", () => {
    const board = regionBoard({ id: 'south', name: 'South', states: ['RI', 'CT'] }, STATES)

    expect(boardStates(board)).toEqual(['09', '44'])
    expect(boardKey(board)).toBe('states:09,44')
  })

  it('should key the same states the same, whatever the region is called', () => {
    const one = regionBoard({ id: 'a', name: 'A', states: ['CT', 'RI'] }, STATES)
    const other = regionBoard({ id: 'b', name: 'B', states: ['RI', 'CT'] }, STATES)

    expect(boardKey(one)).toBe(boardKey(other))
  })

  it('should read a board saved before regions existed, which names only its state', () => {
    expect(boardStates(connecticut)).toEqual(['09'])
    expect(boardKey(connecticut)).toBe('09')
  })
})

describe('boardsFor', () => {
  it('should offer every state on its own', () => {
    expect(boardsFor(STATES_GROUPING, STATES).map(boardKey)).toEqual(['09', '44', '23'])
  })

  it('should offer nothing for a grouping that does not exist', () => {
    expect(boardsFor('nonsense', STATES)).toEqual([])
  })

  it('should offer every grouping of regions first, then states', () => {
    expect(boardGroupings().map(({ id }) => id)).toEqual([
      ...REGION_GROUPINGS.map(({ id }) => id),
      STATES_GROUPING
    ])
  })
})

describe('the regions file', () => {
  /** Every state on the mainland, and DC: all but Alaska and Hawaii */
  const MAINLAND = usStates.map(({ abbr }) => abbr).filter((abbr) => !['AK', 'HI'].includes(abbr))

  /**
   * The states a grouping deliberately puts in two of its regions. Objective
   * Lists splits Pennsylvania and Missouri between two sub-regions, and so
   * between two regions; a board takes whole states, so both get the state.
   * Any other state listed twice is a slip.
   */
  const SHARED_STATES = {
    'sub-regions': ['MO', 'PA'],
    regions: ['MO', 'PA']
  }

  it.each(REGION_GROUPINGS.map((grouping) => [grouping.label, grouping]))(
    'should put every mainland state in the %s',
    (label, grouping) => {
      const listed = new Set(grouping.regions.flatMap(({ states }) => states))
      expect([...listed].sort()).toEqual([...MAINLAND].sort())
    }
  )

  it.each(REGION_GROUPINGS.map((grouping) => [grouping.label, grouping]))(
    'should put a state in two of the %s only where meant to',
    (label, grouping) => {
      const listed = grouping.regions.flatMap(({ states }) => states)
      const repeated = new Set(listed.filter((abbr, i) => listed.indexOf(abbr) !== i))
      expect([...repeated].sort()).toEqual(SHARED_STATES[grouping.id] ?? [])
    }
  )

  it('should list each state once within a region', () => {
    REGION_GROUPINGS.forEach(({ regions }) => {
      regions.forEach(({ states }) => expect(new Set(states).size).toBe(states.length))
    })
  })

  it('should make each Objective Lists region of its sub-regions', () => {
    const regions = REGION_GROUPINGS.find(({ id }) => id === 'regions').regions
    const statesOf = (id) => [...regions.find((region) => region.id === id).states].sort()
    expect(regions.map(({ id }) => id)).toEqual(['northeast', 'midwest', 'south', 'west'])
    expect(statesOf('northeast')).toEqual(
      ['CT', 'DC', 'DE', 'MA', 'MD', 'ME', 'NH', 'NJ', 'NY', 'PA', 'RI', 'VT'].sort()
    )
    expect(statesOf('midwest')).toEqual(
      ['IA', 'IL', 'IN', 'KS', 'MI', 'MN', 'MO', 'ND', 'NE', 'OH', 'PA', 'SD', 'WI'].sort()
    )
    expect(statesOf('south')).toEqual(
      [
        'AL',
        'AR',
        'FL',
        'GA',
        'KY',
        'LA',
        'MO',
        'MS',
        'NC',
        'OK',
        'SC',
        'TN',
        'TX',
        'VA',
        'WV'
      ].sort()
    )
    expect(statesOf('west')).toEqual(
      ['AZ', 'CA', 'CO', 'ID', 'MT', 'NM', 'NV', 'OR', 'UT', 'WA', 'WY'].sort()
    )
  })

  it('should give each region in a grouping its own id', () => {
    REGION_GROUPINGS.forEach(({ regions }) => {
      const ids = regions.map(({ id }) => id)
      expect(new Set(ids).size).toBe(ids.length)
    })
  })
})
