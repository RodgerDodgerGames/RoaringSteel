/**
 * Bridges Tests
 *
 * Where finished track is drawn as a bridge: over every stretch of lake or
 * sea it crosses, from bank to bank, and over each river crossing for a set
 * number of cells centered on the crossing. A bridge drawn in the wrong
 * place, or too short to see, would tell the player they had paid for
 * bridges they had not, or hide the ones they had.
 */

import { describe, it, expect } from 'vitest'
import { bridgeSpans } from '@/composables/map/bridges'
import { riverIndex } from '@/composables/map/water'
import { bridgeStyleConfig } from '@/config/map'
import { makeTestGrid, CELL } from '../utils/testGrid'

/** A point a number of cells north and east of the test grids' corner (0, 0) */
const at = (rows, cols) => ({ lat: rows * CELL, lng: cols * CELL })

/**
 * A grid three rows high and ten columns wide, with water in the given columns.
 * @param {Array<number>} wetCols - The columns that are lake or sea
 * @returns {Object} The grid
 */
const gridWithWater = (wetCols = []) =>
  makeTestGrid({
    rows: 3,
    cols: 10,
    cell: (row, col) => (wetCols.includes(col) ? { water: true } : { landCover: 100 })
  })

/**
 * Rivers running due north across the grid at the given columns.
 * @param {Object} grid - The grid
 * @param {Array<number>} cols - Where each river runs, in columns
 * @returns {Object} The rivers, indexed for the grid
 */
const riversAt = (grid, cols) =>
  riverIndex(
    grid,
    cols.map((col) => [
      [col * CELL, 0],
      [col * CELL, 3 * CELL]
    ])
  )

/** A line along the middle row, from the middle of column 0 to that of column 9 */
const acrossTheGrid = [at(1.5, 0.5), at(1.5, 9.5)]

/**
 * A bridge's ends, in columns, rounded to a ten-thousandth of a cell: the
 * cells are measured north–south and the line runs east–west, which differ
 * by a few millionths this close to the equator
 * @param {Array<{lat: number, lng: number}>} span - The bridge's points
 * @returns {Array<number>} [first column, last column]
 */
const colsOf = (span) => [span[0].lng / CELL, span.at(-1).lng / CELL].map((c) => +c.toFixed(4))

describe('bridgeSpans', () => {
  it('should find no bridges on a line over dry land', () => {
    expect(bridgeSpans(acrossTheGrid, gridWithWater())).toEqual([])
  })

  it('should bridge a lake from bank to bank', () => {
    const spans = bridgeSpans(acrossTheGrid, gridWithWater([3, 4, 5]))
    expect(spans.map(colsOf)).toEqual([[3, 6]])
  })

  it('should bridge two lakes separately', () => {
    const spans = bridgeSpans(acrossTheGrid, gridWithWater([2, 6, 7]))
    expect(spans.map(colsOf)).toEqual([
      [2, 3],
      [6, 8]
    ])
  })

  it("should keep a bend in the line that falls on a lake's bridge", () => {
    const grid = gridWithWater([3, 4, 5])
    const bend = at(1.2, 4.5)
    const [span] = bridgeSpans([at(1.5, 0.5), bend, at(1.5, 9.5)], grid)
    expect(span).toHaveLength(3)
    expect(span[1]).toEqual(bend)
  })

  it('should draw a river bridge the set number of cells long, centered on the crossing', () => {
    const grid = gridWithWater()
    const half = bridgeStyleConfig.riverBridgeCells / 2
    const spans = bridgeSpans(acrossTheGrid, grid, riversAt(grid, [5]))
    expect(spans.map(colsOf)).toEqual([[5 - half, 5 + half]])
  })

  it('should stop a river bridge at the end of the line', () => {
    const grid = gridWithWater()
    // The line ends half a cell past the river, short of a whole bridge's half
    const spans = bridgeSpans([at(1.5, 4), at(1.5, 6.5)], grid, riversAt(grid, [6]))
    expect(spans.map(colsOf)).toEqual([[6 - bridgeStyleConfig.riverBridgeCells / 2, 6.5]])
  })

  it('should join a river bridge that runs into a lake bridge', () => {
    // A river just short of the lake: its bridge reaches the lake's bank
    const grid = gridWithWater([4, 5])
    const spans = bridgeSpans(acrossTheGrid, grid, riversAt(grid, [3.5]))
    expect(spans).toHaveLength(1)
    expect(colsOf(spans[0])[1]).toBe(6)
  })
})
