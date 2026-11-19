/**
 * Coarse Grid Tests
 *
 * A coarse grid merges each block of factor × factor cells into one: water
 * where at least half the block's cells are water, otherwise land with the
 * average land cover, roughness and height of the block's land cells, and a
 * hole where the block has no cell on the board.
 */

import { describe, it, expect } from 'vitest'
import { coarsenGrid, coarseFactor } from '@/composables/map/coarseGrid'
import { cellKm } from '@/composables/map/cellGrid'
import { makeTestGrid } from '../utils/testGrid'

describe('coarseGrid', () => {
  describe('coarseFactor', () => {
    it('should merge enough cells to come within the number wanted', () => {
      const grid = makeTestGrid({ rows: 100, cols: 100 })

      // 10,000 cells into no more than 1,000: blocks of 4 × 4 leave 625
      expect(coarseFactor(grid, 1000)).toBe(4)
    })

    it('should keep a grid already small enough as it is', () => {
      expect(coarseFactor(makeTestGrid({ rows: 10, cols: 10 }), 1000)).toBe(1)
    })
  })

  describe('coarsenGrid', () => {
    it('should keep the same grid at a factor of 1', () => {
      const grid = makeTestGrid({ rows: 2, cols: 2 })

      expect(coarsenGrid(grid, 1)).toBe(grid)
    })

    it('should make cells the factor times as wide, from the same corner', () => {
      const grid = makeTestGrid({ rows: 4, cols: 6, south: 10, west: 20 })
      const coarse = coarsenGrid(grid, 2)

      expect(coarse).toMatchObject({ rows: 2, cols: 3, south: 10, west: 20 })
      expect(cellKm(coarse)).toBeCloseTo(2 * cellKm(grid), 9)
    })

    it("should average the land cells' terrain in each block", () => {
      const grid = makeTestGrid({
        rows: 2,
        cols: 2,
        cell: (row, col) => ({
          landCover: 100 * (row * 2 + col + 1),
          roughness: 0.01 * (row * 2 + col),
          elevation: 10 * (row * 2 + col)
        })
      })
      const coarse = coarsenGrid(grid, 2)

      expect(coarse.count).toBe(1)
      expect(coarse.landCover[0]).toBe(250)
      expect(coarse.roughness[0]).toBeCloseTo(0.015, 6)
      expect(coarse.elevation[0]).toBeCloseTo(15, 6)
      expect(coarse.water[0]).toBe(0)
    })

    it('should make a block water when at least half of it is water, and leave the water out of a land block', () => {
      const halfWater = makeTestGrid({
        rows: 2,
        cols: 2,
        cell: (row) => (row === 0 ? { water: true, elevation: -40 } : { landCover: 100 })
      })
      const mostlyLand = makeTestGrid({
        rows: 2,
        cols: 2,
        cell: (row, col) =>
          row === 0 && col === 0
            ? { water: true, elevation: -40 }
            : { landCover: 300, elevation: 60 }
      })

      expect(coarsenGrid(halfWater, 2).water[0]).toBe(1)
      const land = coarsenGrid(mostlyLand, 2)
      expect(land.water[0]).toBe(0)
      // The sea floor's depth is not averaged into the land's height
      expect(land.elevation[0]).toBeCloseTo(60, 6)
      expect(land.landCover[0]).toBe(300)
    })

    it('should leave a hole where a block has no cell on the board, and merge part blocks at the edge', () => {
      // 3 columns into blocks of 2: the second block is one column wide
      const grid = makeTestGrid({
        rows: 2,
        cols: 3,
        cell: (row, col) => (col < 2 ? null : { landCover: 100 })
      })
      const coarse = coarsenGrid(grid, 2)

      expect(coarse.present[0]).toBe(0)
      expect(coarse.present[1]).toBe(1)
      expect(coarse.landCover[1]).toBe(100)
    })
  })
})
