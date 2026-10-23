/**
 * Track Cost Tests
 *
 * A line of track costs the sum of the grid cells it passes through, each
 * charged once. The price depends only on the line's vertices, so it can go
 * down as well as up while a leg is being placed.
 *
 * Water cells are bridged instead: each water cell in a row costs more than
 * the one before, whatever the cell's own cost.
 */

import { describe, it, expect } from 'vitest'
import { findCell, cellsAlongLine, priceLine, linePrice } from '@/composables/map/trackCost'
import { gridConfig } from '@/config/grid'
import { gameRules } from '@/config/game'
import { nlcdCostMap } from '@/config/nlcd'
import { metersToLatitudeDegrees } from '@/composables/setup/useMapSupport'

/** Degrees of latitude one grid cell spans */
const CELL = metersToLatitudeDegrees(gridConfig.cellSize)

/**
 * A single row of square cells running east along latitude 0, where a degree
 * of longitude is as long as a degree of latitude. Cell `i` costs `costs[i]`.
 * @param {Array<number|null>} costs - One cost per cell, west to east
 * @returns {Array<Object>} The grid
 */
function rowOfCells(costs) {
  return costs.map((cost, i) => ({
    id: `0-${i}`,
    centroid: { lat: 0, lng: (i + 0.5) * CELL },
    cost
  }))
}

/**
 * The center of a cell in `rowOfCells`.
 * @param {number} i - Which cell, counting from the west
 * @returns {{lat: number, lng: number}}
 */
const centerOf = (i) => ({ lat: 0, lng: (i + 0.5) * CELL })

describe('trackCost', () => {
  describe('findCell', () => {
    it('should find the cell a point lies in', () => {
      const grid = rowOfCells([1, 2, 3])

      expect(findCell({ lat: 0.1 * CELL, lng: 1.9 * CELL }, grid).id).toBe('0-1')
    })

    it('should find nothing on an empty grid', () => {
      expect(findCell({ lat: 0, lng: 0 }, [])).toBeNull()
    })
  })

  describe('cellsAlongLine', () => {
    it('should list every cell a leg passes through, not only its ends', () => {
      const grid = rowOfCells([1, 2, 3, 4, 5])

      const cells = cellsAlongLine([centerOf(0), centerOf(4)], grid)

      expect(cells.map((cell) => cell.id)).toEqual(['0-0', '0-1', '0-2', '0-3', '0-4'])
    })

    it('should list a cell once when the line comes back through it', () => {
      const grid = rowOfCells([1, 2, 3])

      const cells = cellsAlongLine([centerOf(0), centerOf(2), centerOf(1)], grid)

      expect(cells.map((cell) => cell.id)).toEqual(['0-0', '0-1', '0-2'])
    })
  })

  describe('priceLine', () => {
    it('should charge the cell a line starts in as soon as it starts', () => {
      const grid = rowOfCells([700, 2000])

      expect(priceLine([centerOf(0)], grid)).toBe(700)
    })

    it('should charge each cell the line crosses once, start included', () => {
      const grid = rowOfCells([100, 200, 300])

      expect(priceLine([centerOf(0), centerOf(2)], grid)).toBe(600)
    })

    it('should not charge again for the cell a leg shares with the leg before it', () => {
      const grid = rowOfCells([100, 200, 300])

      expect(priceLine([centerOf(0), centerOf(1), centerOf(2)], grid)).toBe(600)
    })

    // The bug: pricing added a cell each time the cursor entered one, so a leg
    // pulled out and brought back kept the cells it had passed over
    it('should cost less again once a leg is brought back closer to its start', () => {
      const grid = rowOfCells([100, 200, 300, 400])

      const pulledOut = priceLine([centerOf(0), centerOf(3)], grid)
      const broughtBack = priceLine([centerOf(0), centerOf(1)], grid)

      expect(pulledOut).toBe(1000)
      expect(broughtBack).toBe(300)
    })

    it('should charge nothing for a cell whose cost failed to load', () => {
      const grid = rowOfCells([100, null, 300])

      expect(priceLine([centerOf(0), centerOf(2)], grid)).toBe(400)
    })

    it('should charge nothing for a line with no vertices', () => {
      expect(priceLine([], rowOfCells([100]))).toBe(0)
    })
  })

  describe('bridges', () => {
    const BRIDGE = gameRules.bridges.costPerCell

    /**
     * A row of cells where 'W' is a water cell (with the high cost the grid
     * gives water) and a number is a land cell costing that much.
     */
    function rowWithWater(cells) {
      return rowOfCells(cells.map((cell) => (cell === 'W' ? 10000 : cell))).map((cell, i) =>
        cells[i] === 'W' ? { ...cell, landCover: nlcdCostMap[11] } : { ...cell, landCover: 150 }
      )
    }

    it("should charge a bridge for a water cell instead of the cell's own cost", () => {
      const grid = rowWithWater([100, 'W', 300])

      expect(priceLine([centerOf(0), centerOf(2)], grid)).toBe(100 + BRIDGE + 300)
    })

    it('should charge more for each water cell further into a crossing', () => {
      const grid = rowWithWater([100, 'W', 'W', 300])

      expect(priceLine([centerOf(0), centerOf(3)], grid)).toBe(100 + BRIDGE + 2 * BRIDGE + 300)
    })

    it('should start each separate crossing at the first price again', () => {
      const grid = rowWithWater([100, 'W', 200, 'W', 300])

      expect(priceLine([centerOf(0), centerOf(4)], grid)).toBe(100 + BRIDGE + 200 + BRIDGE + 300)
    })

    it('should say how much of the price is bridges', () => {
      const grid = rowWithWater([100, 'W', 'W', 300])

      expect(linePrice([centerOf(0), centerOf(3)], grid)).toEqual({
        total: 400 + 3 * BRIDGE,
        bridges: 3 * BRIDGE
      })
    })
  })
})
