/**
 * Water Tests
 *
 * Lakes and sea are grid cells of water, bridged per speed unit crossed, up
 * to a longest bridge also set in speed units. Rivers are lines: track pays
 * a river bridge each time it crosses one, and nothing for running beside
 * it.
 */

import { describe, it, expect } from 'vitest'
import {
  bridgeCellPrice,
  maxBridgeCells,
  waterCells,
  riverIndex,
  riverCrossings
} from '@/composables/map/water'
import { gameRules } from '@/config/game'
import { makeTestGrid, CELL, CELL_METERS } from '../utils/testGrid'

/** A point a number of cells north and east of the test grids' corner (0, 0) */
const at = (rows, cols) => ({ lat: rows * CELL, lng: cols * CELL })

/** The [lng, lat] of such a point, as GeoJSON has it */
const coord = (rows, cols) => [cols * CELL, rows * CELL]

/** A grid of plain land, this many cells each way */
const landGrid = (rows, cols) => makeTestGrid({ rows, cols, cell: () => ({ landCover: 100 }) })

describe('bridgeCellPrice', () => {
  it('should charge a cell its width in speed units at the rate per speed unit', () => {
    const { perSpeedUnit } = gameRules.bridges
    const grid = landGrid(1, 1)
    const cellKm = CELL_METERS / 1000

    // A cell one speed unit wide, and one half a speed unit wide
    expect(bridgeCellPrice(grid, cellKm)).toBe(perSpeedUnit)
    expect(bridgeCellPrice(grid, 2 * cellKm)).toBe(perSpeedUnit / 2)
  })
})

describe('maxBridgeCells', () => {
  it('should allow as many cells as fit in the longest bridge, in speed units', () => {
    const { maxSpeedUnits } = gameRules.bridges
    const grid = landGrid(1, 1)
    const cellKm = CELL_METERS / 1000

    // Cells a speed unit wide: as many cells as speed units
    expect(maxBridgeCells(grid, cellKm)).toBe(maxSpeedUnits)
    // Cells a quarter of a speed unit wide: four times as many
    expect(maxBridgeCells(grid, 4 * cellKm)).toBe(4 * maxSpeedUnits)
  })
})

describe('waterCells', () => {
  const shape = { rows: 6, cols: 6, south: 0, west: 0, latStep: CELL, lngStep: CELL }
  /** The "row-col" of every water cell */
  const wet = (water) =>
    [...water.keys()].filter((i) => water[i]).map((i) => `${Math.floor(i / 6)}-${i % 6}`)
  /** A ring round a box, from one corner (rows, cols) to the other */
  const box = (south, west, north, east) => [
    coord(south, west),
    coord(south, east),
    coord(north, east),
    coord(north, west),
    coord(south, west)
  ]

  it('should mark the cells whose centers are inside a lake', () => {
    // The centers of rows and columns 2 and 3 are inside; those of 1 and 4
    // (at 1.5 and 4.5) just are not
    expect(wet(waterCells(shape, [[box(1.6, 1.6, 4.4, 4.4)]]))).toEqual([
      '2-2',
      '2-3',
      '3-2',
      '3-3'
    ])
  })

  it('should leave an island in a lake as land', () => {
    const water = waterCells(shape, [[box(0.2, 0.2, 5.8, 5.8), box(2.2, 2.2, 3.8, 3.8)]])

    expect(wet(water)).toHaveLength(36 - 4)
    expect(wet(water)).not.toContain('2-2')
    expect(wet(water)).not.toContain('3-3')
  })

  it('should mark only the part of a lake on the grid', () => {
    // A lake reaching far past the grid's west and south edges
    expect(wet(waterCells(shape, [[box(-10, -10, 1, 1)]]))).toEqual(['0-0'])
  })
})

describe('riverCrossings', () => {
  const grid = landGrid(6, 6)
  /** A river running north to south down the middle of column 3 */
  const straightRiver = riverIndex(grid, [[coord(0, 3.5), coord(6, 3.5)]])

  it('should find each place a line crosses a river', () => {
    // Across once, then back again
    const line = [at(1.5, 1.5), at(1.5, 5.5), at(4.5, 1.5)]

    expect(riverCrossings(line, grid, straightRiver)).toHaveLength(2)
  })

  it('should find no crossing for a line that runs beside a river', () => {
    // Down column 3 too, through the same cells as the river
    const line = [at(0.5, 3.2), at(5.5, 3.2)]

    expect(riverCrossings(line, grid, straightRiver)).toEqual([])
  })

  it('should count a crossing once where the line bends on the river', () => {
    // The line's bend is on the river: both legs meet it there
    const line = [at(1.5, 1.5), at(2.5, 3.5), at(3.5, 5.5)]

    expect(riverCrossings(line, grid, straightRiver)).toHaveLength(1)
  })

  it('should count a crossing once where the river bends on the line', () => {
    const bent = riverIndex(grid, [[coord(0, 3.5), coord(2.5, 3.5), coord(6, 4.5)]])
    const line = [at(2.5, 0.5), at(2.5, 5.5)]

    expect(riverCrossings(line, grid, bent)).toHaveLength(1)
  })

  it('should charge a crossing where two sections meet on a river to the first only', () => {
    // The first section ends on the river; the second starts from there
    const first = [at(2.5, 1.5), at(2.5, 3.5)]
    const second = [at(2.5, 3.5), at(2.5, 5.5)]

    expect(riverCrossings(first, grid, straightRiver)).toHaveLength(1)
    expect(riverCrossings(second, grid, straightRiver)).toEqual([])
  })

  it('should not count a river crossed in a lake, which is bridged as a lake', () => {
    // Row 2, column 3 is lake; the river runs through it
    const wetGrid = makeTestGrid({
      rows: 6,
      cols: 6,
      cell: (row, col) => (row === 2 && col === 3 ? { water: true } : { landCover: 100 })
    })
    const rivers = riverIndex(wetGrid, [[coord(0, 3.5), coord(6, 3.5)]])

    expect(riverCrossings([at(2.5, 1.5), at(2.5, 5.5)], wetGrid, rivers)).toEqual([])
    expect(riverCrossings([at(4.5, 1.5), at(4.5, 5.5)], wetGrid, rivers)).toHaveLength(1)
  })

  it('should find no crossings on a board without rivers', () => {
    expect(riverCrossings([at(1.5, 1.5), at(1.5, 5.5)], grid, null)).toEqual([])
  })
})
