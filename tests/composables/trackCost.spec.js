/**
 * Track Cost Tests
 *
 * A line of track costs the sum of the grid cells it passes through, each
 * charged once. The price depends only on the line's vertices, so it can go
 * down as well as up while a leg is being placed.
 *
 * Water cells are bridged instead: each water cell in a row costs more than
 * the one before, whatever the cell's own cost.
 *
 * A land cell's cost is terrain cost, turned into dollars by the board's
 * price scale: open ground costs `trackPrice.perSpeedUnit` per speed unit of
 * the cell's width, times the tuning knob.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { cellsAlongLine, linePrice, trackPriceScale } from '@/composables/map/trackCost'
import { gameRules } from '@/config/game'
import { bridgeCellCost } from '@/composables/map/water'
import { nlcdCostMap } from '@/config/nlcd'
import { makeTestGrid, CELL, CELL_METERS } from '../utils/testGrid'

/**
 * A single row of square cells running east along latitude 0, where a degree
 * of longitude is as long as a degree of latitude. Cell `i` costs `costs[i]`
 * and has the land cover `covers[i]`, if given.
 * @param {Array<number|null>} costs - One cost per cell, west to east
 * @param {Array<number>} [covers] - One land cover per cell
 * @returns {Object} The grid
 */
function rowOfCells(costs, covers = []) {
  return makeTestGrid({
    rows: 1,
    cols: costs.length,
    south: -CELL / 2,
    cell: (row, col) => ({ cost: costs[col], landCover: covers[col] })
  })
}

/**
 * The center of a cell in `rowOfCells`.
 * @param {number} i - Which cell, counting from the west
 * @returns {{lat: number, lng: number}}
 */
const centerOf = (i) => ({ lat: 0, lng: (i + 0.5) * CELL })

describe('trackCost', () => {
  describe('cellsAlongLine', () => {
    it('should list every cell a leg passes through, not only its ends', () => {
      const grid = rowOfCells([1, 2, 3, 4, 5])

      const cells = cellsAlongLine([centerOf(0), centerOf(4)], grid)

      expect(cells).toEqual([0, 1, 2, 3, 4])
    })

    it('should list a cell once when the line comes back through it', () => {
      const grid = rowOfCells([1, 2, 3])

      const cells = cellsAlongLine([centerOf(0), centerOf(2), centerOf(1)], grid)

      expect(cells).toEqual([0, 1, 2])
    })
  })

  describe('linePrice', () => {
    it('should charge the cell a line starts in as soon as it starts', () => {
      const grid = rowOfCells([700, 2000])

      expect(linePrice([centerOf(0)], grid, 1).total).toBe(700)
    })

    it('should charge each cell the line crosses once, start included', () => {
      const grid = rowOfCells([100, 200, 300])

      expect(linePrice([centerOf(0), centerOf(2)], grid, 1).total).toBe(600)
    })

    it('should not charge again for the cell a leg shares with the leg before it', () => {
      const grid = rowOfCells([100, 200, 300])

      expect(linePrice([centerOf(0), centerOf(1), centerOf(2)], grid, 1).total).toBe(600)
    })

    // The bug: pricing added a cell each time the cursor entered one, so a leg
    // pulled out and brought back kept the cells it had passed over
    it('should cost less again once a leg is brought back closer to its start', () => {
      const grid = rowOfCells([100, 200, 300, 400])

      const pulledOut = linePrice([centerOf(0), centerOf(3)], grid, 1).total
      const broughtBack = linePrice([centerOf(0), centerOf(1)], grid, 1).total

      expect(pulledOut).toBe(1000)
      expect(broughtBack).toBe(300)
    })

    it('should charge nothing for a cell whose cost failed to load', () => {
      const grid = rowOfCells([100, null, 300])

      expect(linePrice([centerOf(0), centerOf(2)], grid, 1).total).toBe(400)
    })

    it('should charge nothing for a line with no vertices', () => {
      expect(linePrice([], rowOfCells([100]), 1).total).toBe(0)
    })
  })

  describe('bridges', () => {
    // The first water cell of a crossing, and the second, on 10 km cells
    const BRIDGE = bridgeCellCost(1, CELL_METERS / 1000)
    const SECOND = bridgeCellCost(2, CELL_METERS / 1000)

    /**
     * A row of cells where 'W' is a water cell (with the high cost the grid
     * gives water) and a number is a land cell costing that much.
     */
    function rowWithWater(cells) {
      return rowOfCells(
        cells.map((cell) => (cell === 'W' ? 10000 : cell)),
        cells.map((cell) => (cell === 'W' ? nlcdCostMap[11] : 150))
      )
    }

    it("should charge a bridge for a water cell instead of the cell's own cost", () => {
      const grid = rowWithWater([100, 'W', 300])

      expect(linePrice([centerOf(0), centerOf(2)], grid, 1).total).toBe(100 + BRIDGE + 300)
    })

    it('should charge more for each water cell further into a crossing', () => {
      const grid = rowWithWater([100, 'W', 'W', 300])

      expect(linePrice([centerOf(0), centerOf(3)], grid, 1).total).toBe(100 + BRIDGE + SECOND + 300)
    })

    it('should start each separate crossing at the first price again', () => {
      const grid = rowWithWater([100, 'W', 200, 'W', 300])

      expect(linePrice([centerOf(0), centerOf(4)], grid, 1).total).toBe(
        100 + BRIDGE + 200 + BRIDGE + 300
      )
    })

    // Following a shore can take a line back over land it has crossed already;
    // the water either side of that land is two crossings, not one long one
    it('should count water either side of land crossed twice as two crossings', () => {
      const grid = rowWithWater(['W', 100, 'W'])

      expect(linePrice([centerOf(1), centerOf(0), centerOf(2)], grid, 1).total).toBe(
        100 + BRIDGE + BRIDGE
      )
    })

    it('should say how much of the price is bridges', () => {
      const grid = rowWithWater([100, 'W', 'W', 300])

      expect(linePrice([centerOf(0), centerOf(3)], grid, 1)).toEqual({
        total: 400 + BRIDGE + SECOND,
        bridges: BRIDGE + SECOND
      })
    })
  })

  describe('price scale', () => {
    // The tuning knob is meant to be edited; pin it so these check the rule
    const tunedMultiplier = gameRules.trackPrice.multiplier
    afterEach(() => {
      gameRules.trackPrice.multiplier = tunedMultiplier
    })

    // The test grid's cells are 10 km tall (see testGrid.js)
    const cellKm = 10

    it('should multiply land cells by the price scale but leave bridges alone', () => {
      const grid = rowOfCells([100, 10000, 300], [150, nlcdCostMap[11], 150])

      expect(linePrice([centerOf(0), centerOf(2)], grid, 3)).toEqual({
        total: 3 * 100 + bridgeCellCost(1, CELL_METERS / 1000) + 3 * 300,
        bridges: bridgeCellCost(1, CELL_METERS / 1000)
      })
    })

    it('should price a cell of open ground one speed unit wide at the rate per speed unit', () => {
      const grid = rowOfCells([gameRules.trackPrice.openGroundCost])
      gameRules.trackPrice.multiplier = 1

      const scale = trackPriceScale(grid, cellKm)

      expect(linePrice([centerOf(0)], grid, scale).total).toBeCloseTo(
        gameRules.trackPrice.perSpeedUnit,
        6
      )
    })

    it('should price a cell by how many speed units wide it is', () => {
      const grid = rowOfCells([gameRules.trackPrice.openGroundCost])

      // A board with a speed unit a quarter of the cell's width
      expect(trackPriceScale(grid, cellKm / 4)).toBeCloseTo(4 * trackPriceScale(grid, cellKm), 9)
    })

    it('should price rougher ground in proportion to its terrain cost', () => {
      const { openGroundCost } = gameRules.trackPrice
      const grid = rowOfCells([openGroundCost, 3 * openGroundCost])
      const scale = trackPriceScale(grid, cellKm)

      expect(linePrice([centerOf(1)], grid, scale).total).toBeCloseTo(
        3 * linePrice([centerOf(0)], grid, scale).total,
        6
      )
    })

    it('should cap a cell at the dearest ground, however steep', () => {
      const { openGroundCost, maxTerrainFactor } = gameRules.trackPrice
      const cap = maxTerrainFactor * openGroundCost
      const grid = rowOfCells([cap, 10 * cap])

      expect(linePrice([centerOf(1)], grid, 1).total).toBe(cap)
      expect(linePrice([centerOf(0)], grid, 1).total).toBe(cap)
    })

    it('should scale every track price by the tuning knob', () => {
      const grid = rowOfCells([gameRules.trackPrice.openGroundCost])
      gameRules.trackPrice.multiplier = 1
      const normal = trackPriceScale(grid, cellKm)
      gameRules.trackPrice.multiplier = 1.5

      expect(trackPriceScale(grid, cellKm)).toBeCloseTo(1.5 * normal, 9)
    })
  })
})
