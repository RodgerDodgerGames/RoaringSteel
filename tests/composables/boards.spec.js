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
  boardGrouping,
  boardGroupings,
  boardKey,
  boardLabel,
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

/**
 * A region's board as the Area Select screen makes it, without outlines:
 * its name and its states' FIPS codes are all `boardGrouping` reads.
 */
const regionBoardOf = (region) => ({
  type: 'Feature',
  properties: {
    NAME: region.name,
    STATES: region.states.map((abbr) => usStates.find((state) => state.abbr === abbr).fips)
  }
})

describe('boardGrouping', () => {
  it("should find a state's own board under States", () => {
    expect(boardGrouping(stateBoard(connecticut))).toBe(STATES_GROUPING)
  })

  it('should tell regions of the same name apart by their states', () => {
    // Objective Lists' Midwest has Pennsylvania; the Census Bureau's does not
    const censusMidwest = ['17', '18', '26', '39', '55', '19', '20', '27', '29', '31', '38', '46']
    const objectiveMidwest = [...censusMidwest, '42']

    expect(boardGrouping({ properties: { NAME: 'Midwest', STATES: censusMidwest } })).toBe(
      'census-regions'
    )
    expect(boardGrouping({ properties: { NAME: 'Midwest', STATES: objectiveMidwest } })).toBe(
      'regions'
    )
  })

  it('should find a region by its states in any order', () => {
    // New England, a Census division, listed out of the regions file's order
    const states = ['50', '09', '44', '33', '25', '23']

    expect(boardGrouping({ properties: { NAME: 'New England', STATES: states } })).toBe(
      'census-divisions'
    )
  })

  it('should find every region in the grouping that offers its states', () => {
    // Regions share names between groupings, so each must be found by its
    // states: the grouping found offers a region with the same states, and
    // is this region's own grouping or one listed before it
    REGION_GROUPINGS.forEach((grouping, index) => {
      grouping.regions.forEach((region) => {
        const board = regionBoardOf(region)
        const foundIndex = REGION_GROUPINGS.findIndex(({ id }) => id === boardGrouping(board))

        expect(foundIndex, region.name).toBeGreaterThanOrEqual(0)
        expect(foundIndex, region.name).toBeLessThanOrEqual(index)
        expect(
          REGION_GROUPINGS[foundIndex].regions.some(
            (other) => boardKey(regionBoardOf(other)) === boardKey(board)
          ),
          region.name
        ).toBe(true)
      })
    })
  })

  it('should find no grouping for no board, or for states no region is made of', () => {
    expect(boardGrouping(null)).toBeNull()
    // Connecticut and Maine alone are not a region in any grouping
    expect(boardGrouping({ properties: { NAME: 'Odd', STATES: ['09', '23'] } })).toBeNull()
  })
})

describe('boardLabel', () => {
  it("should name a state's board alone", () => {
    expect(boardLabel(stateBoard(connecticut))).toBe('Board: Connecticut')
  })

  it("should name a region's board with how many states it covers", () => {
    const board = regionBoard({ id: 'south', name: 'South', states: ['RI', 'CT'] }, STATES)

    expect(boardLabel(board)).toBe('Board: South (2 states)')
  })

  it('should give no line when no board is chosen, for each screen to word', () => {
    expect(boardLabel(null)).toBeNull()
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
