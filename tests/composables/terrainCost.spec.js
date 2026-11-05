/**
 * Terrain Cost Tests
 *
 * A cell's terrain cost is its land cover cost plus `gridConfig.slopeCost`
 * for each unit of its slope: the steeper of its roughness inside and its
 * average grade to its neighbors. Both are grades, so the same ground costs
 * the same however finely it is cut into cells.
 */

import { describe, it, expect } from 'vitest'
import { fillTerrainCosts } from '@/composables/map/terrainCost'
import { gridConfig } from '@/config/grid'
import { cellsOf, makeTestGrid, CELL, CELL_METERS } from '../utils/testGrid'
import { metersToLatitudeDegrees } from '@/composables/setup/useMapSupport'

/**
 * A row of cells along the equator, where cells square in degrees are
 * square on the ground, each with a height and the same land cover
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
    cell: (row, col) =>
      heights[col] === null ? null : { elevation: heights[col], landCover: 100, cost: 0 }
  })
}

/** Every cell's cost after the terrain step */
function costsOf(grid, roughness = new Float32Array(grid.present.length)) {
  fillTerrainCosts(grid, roughness)
  return cellsOf(grid).map((cell) => cell.cost)
}

describe('fillTerrainCosts', () => {
  it('should cost level ground at its land cover', () => {
    expect(costsOf(rowOf([50, 50, 50]))).toEqual([100, 100, 100])
  })

  it('should add the average grade to the neighbors', () => {
    // The middle cell climbs 100 m to each neighbor, one cell's width away
    const grade = 100 / CELL_METERS

    const [, middle] = costsOf(rowOf([0, 100, 0]))

    expect(middle).toBe(Math.round(100 + gridConfig.slopeCost * grade))
  })

  it('should cost the same slope the same however finely it is cut', () => {
    // A steady 1% grade: 100 m a cell at 10 km cells, 10 m a cell at 1 km
    const coarse = costsOf(rowOf([0, 100, 200]))[1]
    const fine = costsOf(rowOf([0, 10, 20], CELL_METERS / 10))[1]

    expect(fine).toBe(coarse)
  })

  it('should take the roughness inside a cell when it is steeper than the grade', () => {
    const grid = rowOf([50, 50, 50])
    const roughness = Float32Array.from([0, 0.2, 0])

    expect(costsOf(grid, roughness)).toEqual([100, 100 + gridConfig.slopeCost * 0.2, 100])
  })

  it('should take the grade when it is steeper than the roughness', () => {
    const grade = 100 / CELL_METERS
    const grid = rowOf([0, 100, 0])
    const roughness = Float32Array.from([0, grade / 2, 0])

    expect(costsOf(grid, roughness)[1]).toBe(Math.round(100 + gridConfig.slopeCost * grade))
  })

  it('should not count a hole beside a cell', () => {
    // The hole stands for the sea far below: nothing to climb to
    expect(costsOf(rowOf([null, 50, 50]))).toEqual([100, 100])
  })

  it('should measure diagonal neighbors over the diagonal distance', () => {
    // A 2x2 block: the north-east cell 100 m above the other three
    const grid = makeTestGrid({
      rows: 2,
      cols: 2,
      south: -CELL,
      cell: (row, col) => ({ elevation: row === 1 && col === 1 ? 100 : 0, landCover: 100 })
    })
    fillTerrainCosts(grid, new Float32Array(4))

    // South-west only neighbors the high cell on the diagonal, √2 cells off;
    // its other two neighbors are level with it
    const [southWest] = cellsOf(grid).map((cell) => cell.cost)
    const grade = 100 / (Math.SQRT2 * CELL_METERS) / 3
    expect(southWest).toBe(Math.round(100 + gridConfig.slopeCost * grade))
  })
})
