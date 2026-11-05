/**
 * Slope Tests
 *
 * A cell's slope is the steeper of its roughness inside and its average
 * grade to its neighbors. Both are grades, so the same ground is as steep
 * however finely it is cut into cells.
 */

import { describe, it, expect } from 'vitest'
import { fillSlopes } from '@/composables/map/slope'
import { cellsOf, makeTestGrid, CELL, CELL_METERS } from '../utils/testGrid'
import { metersToLatitudeDegrees } from '@/composables/setup/useMapSupport'

/**
 * A row of cells along the equator, where cells square in degrees are
 * square on the ground, each with a height
 * @param {Array<number|null>} heights - Per cell, west to east; null for a hole
 * @param {number} [cellMeters] - How wide the cells are
 */
function rowOf(heights, cellMeters = CELL_METERS) {
  const step = metersToLatitudeDegrees(cellMeters)
  return makeTestGrid({
    rows: 1,
    cols: heights.length,
    south: -step / 2,
    latStep: step,
    lngStep: step,
    cell: (row, col) => (heights[col] === null ? null : { elevation: heights[col], slope: NaN })
  })
}

/** Every cell's slope after the slope step */
function slopesOf(grid, roughness = new Float32Array(grid.present.length)) {
  fillSlopes(grid, roughness)
  return cellsOf(grid).map((cell) => cell.slope)
}

describe('fillSlopes', () => {
  it('should give level ground no slope', () => {
    expect(slopesOf(rowOf([50, 50, 50]))).toEqual([0, 0, 0])
  })

  it('should add the average grade to the neighbors', () => {
    // The middle cell climbs 100 m to each neighbor, one cell's width away
    const grade = 100 / CELL_METERS

    const [, middle] = slopesOf(rowOf([0, 100, 0]))

    expect(middle).toBeCloseTo(grade, 6)
  })

  it('should find the same slope however finely it is cut', () => {
    // A steady 1% grade: 100 m a cell at 10 km cells, 10 m a cell at 1 km
    const coarse = slopesOf(rowOf([0, 100, 200]))[1]
    const fine = slopesOf(rowOf([0, 10, 20], CELL_METERS / 10))[1]

    expect(fine).toBeCloseTo(coarse, 6)
    expect(coarse).toBeCloseTo(0.01, 6)
  })

  it('should take the roughness inside a cell when it is steeper than the grade', () => {
    const grid = rowOf([50, 50, 50])
    const roughness = Float32Array.from([0, 0.2, 0])

    const [west, middle, east] = slopesOf(grid, roughness)

    expect([west, east]).toEqual([0, 0])
    expect(middle).toBeCloseTo(0.2, 6)
  })

  it('should take the grade when it is steeper than the roughness', () => {
    const grade = 100 / CELL_METERS
    const grid = rowOf([0, 100, 0])
    const roughness = Float32Array.from([0, grade / 2, 0])

    expect(slopesOf(grid, roughness)[1]).toBeCloseTo(grade, 6)
  })

  it('should not count a hole beside a cell', () => {
    // The hole stands for the sea far below: nothing to climb to
    expect(slopesOf(rowOf([null, 50, 50]))).toEqual([0, 0])
  })

  it('should measure diagonal neighbors over the diagonal distance', () => {
    // A 2x2 block: the north-east cell 100 m above the other three
    const grid = makeTestGrid({
      rows: 2,
      cols: 2,
      south: -CELL,
      cell: (row, col) => ({ elevation: row === 1 && col === 1 ? 100 : 0 })
    })
    fillSlopes(grid, new Float32Array(4))

    // South-west only neighbors the high cell on the diagonal, √2 cells off;
    // its other two neighbors are level with it
    const [southWest] = cellsOf(grid).map((cell) => cell.slope)
    const grade = 100 / (Math.SQRT2 * CELL_METERS) / 3
    expect(southWest).toBeCloseTo(grade, 6)
  })
})
