/**
 * Build Rules Tests
 *
 * Track stays inside the region being played, except into the grid cell a
 * town sits in, which may reach over the region's edge. A line breaking the
 * rule anywhere along it is refused, not just at its corners.
 *
 * Water may be bridged, but only so far: a crossing longer than the longest
 * bridge allowed is refused.
 *
 * Track may cross track already built, but not run alongside it: a line may
 * come close to built track only for the short stretch a crossing takes,
 * except inside the cells towns sit in.
 */

import { describe, it, expect } from 'vitest'
import {
  townCells,
  builtLegs,
  trackIndex,
  lineBlock,
  blockMessage
} from '@/composables/map/buildRules'
import { regionTest } from '@/composables/map/region'
import { gameRules } from '@/config/game'
import { nlcdCostMap } from '@/config/nlcd'
import { makeTestGrid, CELL } from '../utils/testGrid'

/** A square of the region, `size` cells across, starting `x` cells east */
const square = (x, size) => [
  [
    [x * CELL, 0],
    [(x + size) * CELL, 0],
    [(x + size) * CELL, size * CELL],
    [x * CELL, size * CELL],
    [x * CELL, 0]
  ]
]

/** A region in two pieces: cells 0–1 and cells 4–5 of the row, a gap between */
const islands = {
  type: 'Feature',
  properties: { NAME: 'Islands' },
  geometry: { type: 'MultiPolygon', coordinates: [square(0, 2), square(4, 2)] }
}

/** A row of eight cells along the equator, just north of it */
const grid = makeTestGrid({ rows: 1, cols: 8 })

/** The point in the middle of cell `i`, or `along` cells east of its west edge */
const at = (i, along = 0.5) => ({ lat: CELL / 2, lng: (i + along) * CELL })

/** A point `x` cells east and `y` cells north of where the row starts */
const pt = (x, y) => ({ lat: y * CELL, lng: x * CELL })

const rules = { grid, isInRegion: regionTest(islands), townCells: [] }

describe('townCells', () => {
  it('should give the cell each town sits in', () => {
    const towns = [
      { lat: CELL / 2, lon: 0.4 * CELL },
      { lat: CELL / 2, lon: 3.2 * CELL }
    ]

    expect(townCells(towns, grid)).toEqual([0, 3])
  })
})

describe('lineBlock', () => {
  it('should let a line inside the region be built', () => {
    expect(lineBlock([at(0), at(1)], rules)).toBeNull()
  })

  it('should refuse a line that crosses outside between two corners inside', () => {
    // Both ends are in the region; the middle crosses the gap between pieces
    const block = lineBlock([at(1), at(4)], rules)

    expect(block.reason).toBe('outside')
    expect(rules.isInRegion(block.point)).toBe(false)
  })

  it('should let a line reach a town whose cell is outside the region', () => {
    const townRules = { ...rules, townCells: [2] }

    expect(lineBlock([at(1), at(2, 0.9)], townRules)).toBeNull()
  })

  it('should refuse a line that goes on past the town cell', () => {
    const townRules = { ...rules, townCells: [2] }

    expect(lineBlock([at(1), at(3)], townRules)).not.toBeNull()
  })

  it("should refuse a point beyond the grid's edge, even nearest a town's cell", () => {
    // Past the last cell, the town's cell is the nearest there is, but the
    // point is nowhere near inside it
    const townRules = { ...rules, townCells: [7] }

    expect(lineBlock([at(5), at(12)], townRules)).not.toBeNull()
  })
})

describe('lineBlock over water', () => {
  /** A region the whole row long, so only the water is in the way */
  const longRegion = {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: square(0, 8) }
  }

  /** The row of cells, with the cells listed made water */
  const gridWithWater = (waterCells) =>
    makeTestGrid({
      rows: 1,
      cols: 8,
      cell: (row, col) => ({ landCover: waterCells.includes(col) ? nlcdCostMap[11] : 150 })
    })

  const rulesWith = (waterCells) => ({
    grid: gridWithWater(waterCells),
    isInRegion: regionTest(longRegion),
    townCells: []
  })

  it('should let a line bridge as many water cells in a row as allowed', () => {
    const water = Array.from({ length: gameRules.bridges.maxCells }, (_, i) => i + 1)

    expect(lineBlock([at(0), at(water.length + 1)], rulesWith(water))).toBeNull()
  })

  it('should refuse a crossing longer than the longest bridge', () => {
    const water = Array.from({ length: gameRules.bridges.maxCells + 1 }, (_, i) => i + 1)

    expect(lineBlock([at(0), at(water.length + 1)], rulesWith(water))).toEqual({ reason: 'water' })
  })

  it('should let a line make several short crossings with land between', () => {
    expect(lineBlock([at(0), at(6)], rulesWith([1, 2, 4, 5]))).toBeNull()
  })

  it('should refuse a crossing drawn over several legs, however short each', () => {
    const water = Array.from({ length: gameRules.bridges.maxCells + 1 }, (_, i) => i + 1)

    const legs = [at(0), ...water.map((cell) => at(cell)), at(water.length + 1)]

    expect(lineBlock(legs, rulesWith(water))).toEqual({ reason: 'water' })
  })

  it("should not count a town on the shore toward a crossing's length", () => {
    const water = Array.from({ length: gameRules.bridges.maxCells + 1 }, (_, i) => i + 1)
    const rules = rulesWith(water)
    // The last water cell is a town's: the land the bridge reaches
    const town = water.at(-1)

    expect(lineBlock([at(0), at(water.at(-1))], { ...rules, townCells: [town] })).toBeNull()
  })

  it('should not let a finished line end on water', () => {
    const line = [at(0), at(1)]

    expect(lineBlock(line, rulesWith([1]))).toBeNull()
    expect(lineBlock(line, rulesWith([1]), { isFinished: true })).toEqual({
      reason: 'endsOnWater'
    })
  })

  it('should let a finished line end at a town whose cell is water', () => {
    const rules = rulesWith([1])

    expect(lineBlock([at(0), at(1)], { ...rules, townCells: [1] }, { isFinished: true })).toBeNull()
  })
})

describe('lineBlock beside track already built', () => {
  /** A region far bigger than any line here, so only the track is in the way */
  const everywhere = () => true

  /** Bo's track: one straight line 8 cells (80 km) east along the equator */
  const bosTrack = [{ coordinates: [pt(0, 0), pt(8, 0)] }]

  const rules = (towns = []) => ({
    grid,
    isInRegion: everywhere,
    townCells: towns,
    builtTrack: trackIndex(builtLegs(bosTrack))
  })

  it('should let a line cross it square on', () => {
    expect(lineBlock([pt(4, -3), pt(4, 3)], rules())).toBeNull()
  })

  it('should let a line cross it at an angle', () => {
    expect(lineBlock([pt(1, -3), pt(7, 3)], rules())).toBeNull()
  })

  it('should refuse a crossing so shallow it runs beside the track for long', () => {
    expect(lineBlock([pt(0, -0.5), pt(8, 0.5)], rules())).toEqual({ reason: 'alongside' })
  })

  it('should refuse a line running alongside it, close by', () => {
    expect(lineBlock([pt(1, 0.2), pt(6, 0.2)], rules())).toEqual({ reason: 'alongside' })
  })

  it('should let a line run alongside it a cell away', () => {
    expect(lineBlock([pt(1, 1), pt(6, 1)], rules())).toBeNull()
  })

  it('should refuse a line weaving back and forth across it', () => {
    const zigzag = [0, 1, 2, 3, 4, 5, 6].map((x) => pt(x, x % 2 ? 0.3 : -0.3))

    expect(lineBlock(zigzag, rules())).toEqual({ reason: 'alongside' })
  })

  it('should let a line carry on from its end', () => {
    expect(lineBlock([pt(8, 0), pt(12, 0)], rules())).toBeNull()
  })

  it('should refuse a line that sets off back along it from its end', () => {
    expect(lineBlock([pt(8, 0), pt(4, 0)], rules())).toEqual({ reason: 'alongside' })
  })

  it('should refuse a line that doubles back along itself', () => {
    // Out 4 cells north of Bo's track, then back again 1 km beside itself
    const line = [pt(1, 2), pt(5, 2), pt(1, 2.1)]

    expect(lineBlock(line, rules())).toEqual({ reason: 'alongside' })
  })

  it('should let a line bend sharply', () => {
    const line = [pt(1, 2), pt(5, 2), pt(1, 5)]

    expect(lineBlock(line, rules())).toBeNull()
  })

  it("should not count the stretch inside a town's cell", () => {
    // Out of a town along Bo's track for 24 km: 14 of them past the town's
    // cell (the first cell of the row), which is within the limit
    const line = [pt(0, 0.1), pt(2.4, 0.1)]

    expect(lineBlock(line, rules())).toEqual({ reason: 'alongside' })
    expect(lineBlock(line, rules([0]))).toBeNull()
  })

  it('should notice track built far from where the line starts', () => {
    // Many legs of track elsewhere, and one beside the end of the line
    const elsewhere = Array.from({ length: 50 }, (_, i) => ({
      coordinates: [pt(i * 3, 40), pt(i * 3 + 2, 40)]
    }))
    const farRules = {
      ...rules(),
      builtTrack: trackIndex(builtLegs([...elsewhere, { coordinates: [pt(30, 0), pt(36, 0)] }]))
    }

    expect(lineBlock([pt(20, 0.2), pt(35, 0.2)], farRules)).toEqual({ reason: 'alongside' })
  })
})

describe('builtLegs', () => {
  it('should give every straight leg of every built section', () => {
    const segments = [
      { coordinates: [pt(0, 0), pt(1, 0), pt(2, 0)] },
      { coordinates: [pt(5, 0), pt(6, 0)] }
    ]

    expect(builtLegs(segments)).toEqual([
      [pt(0, 0), pt(1, 0)],
      [pt(1, 0), pt(2, 0)],
      [pt(5, 0), pt(6, 0)]
    ])
  })
})

describe('trackIndex', () => {
  const legs = builtLegs([
    { coordinates: [pt(0, 0), pt(1, 0)] },
    // A long leg, 200 km east
    { coordinates: [pt(10, 5), pt(30, 5)] }
  ])
  const index = trackIndex(legs)

  it('should find a leg near a point', () => {
    expect(index.near(pt(0.5, 0.2), 5)).toContain(legs[0])
  })

  it('should find a long leg partway along it, far from either end', () => {
    expect(index.near(pt(20, 5.1), 5)).toContain(legs[1])
  })

  it('should list a leg once, however many of the squares looked in it crosses', () => {
    expect(index.near(pt(20, 5.1), 30).filter((leg) => leg === legs[1])).toHaveLength(1)
  })

  it('should leave out legs nowhere near', () => {
    expect(index.near(pt(60, 60), 5)).toEqual([])
  })
})

describe('blockMessage', () => {
  it('should say how far a bridge can go', () => {
    expect(blockMessage({ reason: 'water' })).toMatch(/water/)
  })

  it('should name the region a line was kept inside', () => {
    expect(blockMessage({ reason: 'outside' }, 'Maryland')).toBe("Track can't go outside Maryland.")
  })
})
