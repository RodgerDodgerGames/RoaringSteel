/**
 * Build Rules Tests
 *
 * Track stays inside the region being played, except into the grid cell a
 * town sits in, which may reach over the region's edge. A line breaking the
 * rule anywhere along it is refused, not just at its corners.
 *
 * Water may be bridged, but only so far: a crossing longer than the longest
 * bridge allowed is refused.
 */

import { describe, it, expect } from 'vitest'
import { townCells, lineBlock, blockMessage } from '@/composables/map/buildRules'
import { regionTest } from '@/composables/map/region'
import { gridConfig } from '@/config/grid'
import { gameRules } from '@/config/game'
import { nlcdCostMap } from '@/config/nlcd'
import { metersToLatitudeDegrees } from '@/composables/setup/useMapSupport'

/** Degrees one grid cell spans along the equator, where these tests are set */
const CELL = metersToLatitudeDegrees(gridConfig.cellSize)

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
const grid = Array.from({ length: 8 }, (_, i) => ({
  id: `0-${i}`,
  centroid: { lat: CELL / 2, lng: (i + 0.5) * CELL }
}))

/** The point in the middle of cell `i`, or `along` cells east of its west edge */
const at = (i, along = 0.5) => ({ lat: CELL / 2, lng: (i + along) * CELL })

const rules = { grid, isInRegion: regionTest(islands), townCells: [] }

describe('townCells', () => {
  it('should give the cell each town sits in', () => {
    const towns = [
      { lat: CELL / 2, lon: 0.4 * CELL },
      { lat: CELL / 2, lon: 3.2 * CELL }
    ]

    expect(townCells(towns, grid).map(({ id }) => id)).toEqual(['0-0', '0-3'])
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
    const townRules = { ...rules, townCells: [grid[2]] }

    expect(lineBlock([at(1), at(2, 0.9)], townRules)).toBeNull()
  })

  it('should refuse a line that goes on past the town cell', () => {
    const townRules = { ...rules, townCells: [grid[2]] }

    expect(lineBlock([at(1), at(3)], townRules)).not.toBeNull()
  })

  it("should refuse a point beyond the grid's edge, even nearest a town's cell", () => {
    // Past the last cell, the town's cell is the nearest there is, but the
    // point is nowhere near inside it
    const townRules = { ...rules, townCells: [grid[7]] }

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
    grid.map((cell, i) => ({
      ...cell,
      landCover: waterCells.includes(i) ? nlcdCostMap[11] : 150
    }))

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

  it('should not let a finished line end on water', () => {
    const line = [at(0), at(1)]

    expect(lineBlock(line, rulesWith([1]))).toBeNull()
    expect(lineBlock(line, rulesWith([1]), { isFinished: true })).toEqual({
      reason: 'endsOnWater'
    })
  })

  it('should let a finished line end at a town whose cell is water', () => {
    const rules = rulesWith([1])

    expect(
      lineBlock([at(0), at(1)], { ...rules, townCells: [rules.grid[1]] }, { isFinished: true })
    ).toBeNull()
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
