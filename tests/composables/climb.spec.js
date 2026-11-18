/**
 * Climb Tests
 *
 * The climb a line makes from one cell to the next is the difference in the
 * cells' average heights over the distance between their centers, uphill or
 * downhill alike. There is none to or from water, a cell of unknown height,
 * or no cell at all.
 */

import { describe, it, expect } from 'vitest'
import { stepGrade } from '@/composables/map/climb'
import { makeTestGrid, CELL, CELL_METERS } from '../utils/testGrid'

/**
 * A 2 x 2 grid on the equator, where a degree of longitude is as long as a
 * degree of latitude, with the heights given (row by row from the south),
 * 'W' for water, or null for a hole.
 * @param {Array<number|string|null>} heights - Four cells' heights
 * @returns {Object} The grid
 */
const square = (heights) =>
  makeTestGrid({
    rows: 2,
    cols: 2,
    south: -CELL,
    cell: (row, col) => {
      const height = heights[row * 2 + col]
      if (height === null) return null
      return height === 'W' ? { water: true, elevation: -100 } : { elevation: height }
    }
  })

describe('climb', () => {
  describe('stepGrade', () => {
    it("should be the rise between two cells' heights over the distance between them", () => {
      const grid = square([0, 300, 0, 0])

      // 300 m over one cell's width
      expect(stepGrade(grid, 0, 1)).toBeCloseTo(300 / CELL_METERS, 3)
    })

    it('should count a climb down as a climb up', () => {
      const grid = square([0, 300, 0, 0])

      expect(stepGrade(grid, 1, 0)).toBeCloseTo(stepGrade(grid, 0, 1), 9)
    })

    it('should measure a diagonal step over the diagonal distance', () => {
      const grid = square([0, 0, 0, 300])

      expect(stepGrade(grid, 0, 3)).toBeCloseTo(300 / (Math.SQRT2 * CELL_METERS), 3)
    })

    it('should find no climb to or from water', () => {
      // The water's height is its floor, far below the shore
      const grid = square([0, 'W', 0, 0])

      expect(stepGrade(grid, 0, 1)).toBe(0)
      expect(stepGrade(grid, 1, 0)).toBe(0)
    })

    it('should find no climb from no cell, or within one cell', () => {
      const grid = square([0, 300, 0, 0])

      expect(stepGrade(grid, -1, 1)).toBe(0)
      expect(stepGrade(grid, 1, 1)).toBe(0)
    })

    it('should find no climb between cells that are not neighbors', () => {
      const grid = makeTestGrid({
        rows: 1,
        cols: 3,
        cell: (row, col) => ({ elevation: col * 300 })
      })

      expect(stepGrade(grid, 0, 2)).toBe(0)
    })

    it('should measure a step and the step back alike, away from the equator', () => {
      // Rows further north are narrower east to west
      const grid = makeTestGrid({
        rows: 2,
        cols: 2,
        south: 45,
        cell: (row, col) => ({ elevation: row * 300 + col * 100 })
      })

      expect(stepGrade(grid, 0, 3)).toBe(stepGrade(grid, 3, 0))
    })

    it('should find no climb to a cell of unknown height', () => {
      const grid = square([0, 300, 0, 0])
      grid.elevation[1] = NaN

      expect(stepGrade(grid, 0, 1)).toBe(0)
    })
  })
})
