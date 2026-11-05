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
 * A land cell's price is its terrain cost — land cover plus slope, each
 * weighed by its tuning knob — turned into dollars by the board's price
 * scale: ordinary ground costs `trackPrice.perSpeedUnit` per speed unit of
 * the cell's width at knobs of 1.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  cellsAlongLine,
  linePrice,
  trackPriceScale,
  terrainCost
} from '@/composables/map/trackCost'
import { gameRules } from '@/config/game'
import { bridgeCellCost } from '@/composables/map/water'
import { nlcdCostMap } from '@/config/nlcd'
import { makeTestGrid, CELL, CELL_METERS } from '../utils/testGrid'
import { pinKnobs } from '../utils/boardScale'

/**
 * A single row of square cells running east along latitude 0, where a degree
 * of longitude is as long as a degree of latitude. Cell `i` has the land
 * cover `covers[i]` and the slope `slopes[i]`, level if not given.
 * @param {Array<number>} covers - One land cover cost per cell, west to east
 * @param {Array<number>} [slopes] - One slope per cell, as a grade
 * @returns {Object} The grid
 */
function rowOfCells(covers, slopes = []) {
  return makeTestGrid({
    rows: 1,
    cols: covers.length,
    south: -CELL / 2,
    cell: (row, col) => ({ landCover: covers[col], slope: slopes[col] })
  })
}

// The knobs are meant to be edited after playtests. Every test here starts
// them at 1, so a level cell at a price scale of 1 costs its land cover, and
// the tests check the rules rather than today's tuning.
let restoreKnobs
beforeEach(() => {
  restoreKnobs = pinKnobs(1)
})
afterEach(() => restoreKnobs())

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

    it('should charge nothing for a cell whose terrain failed to load', () => {
      const grid = rowOfCells([100, 200, 300], [0, NaN, 0])

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
     * A row of cells where 'W' is a water cell and a number is a land cell
     * costing that much.
     */
    function rowWithWater(cells) {
      return rowOfCells(cells.map((cell) => (cell === 'W' ? nlcdCostMap[11] : cell)))
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
    // The test grid's cells are 10 km tall (see testGrid.js)
    const cellKm = 10

    it('should multiply land cells by the price scale but leave bridges alone', () => {
      const grid = rowOfCells([100, nlcdCostMap[11], 300])

      expect(linePrice([centerOf(0), centerOf(2)], grid, 3)).toEqual({
        total: 3 * 100 + bridgeCellCost(1, CELL_METERS / 1000) + 3 * 300,
        bridges: bridgeCellCost(1, CELL_METERS / 1000)
      })
    })

    it('should price a cell of open ground one speed unit wide at the rate per speed unit', () => {
      const grid = rowOfCells([gameRules.trackPrice.openGroundCost])

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
      const grid = rowOfCells([cap, 10 * cap, 0], [0, 0, 1])

      expect(linePrice([centerOf(0)], grid, 1).total).toBe(cap)
      expect(linePrice([centerOf(1)], grid, 1).total).toBe(cap)
      expect(linePrice([centerOf(2)], grid, 1).total).toBe(cap)
    })
  })

  describe('terrainCost', () => {
    const { slopeCost } = gameRules.trackPrice

    it('should add the land cover to the slope cost of the grade', () => {
      expect(terrainCost(100, 0.05)).toBeCloseTo(100 + slopeCost * 0.05, 9)
    })

    it('should weigh the land cover by the land cover knob alone', () => {
      gameRules.trackPrice.knobs.landCover = 2
      gameRules.trackPrice.knobs.elevation = 3

      expect(terrainCost(300, 0)).toBeCloseTo(600, 9)
    })

    it('should weigh the slope by the elevation knob alone', () => {
      gameRules.trackPrice.knobs.landCover = 3
      gameRules.trackPrice.knobs.elevation = 2

      expect(terrainCost(0, 0.1)).toBeCloseTo(2 * slopeCost * 0.1, 9)
    })

    it('should weigh each part of a cell by its own knob', () => {
      gameRules.trackPrice.knobs.landCover = 0.5
      gameRules.trackPrice.knobs.elevation = 2

      expect(terrainCost(100, 0.1)).toBeCloseTo(0.5 * 100 + 2 * slopeCost * 0.1, 9)
    })

    it('should cost nothing at knobs of 0', () => {
      gameRules.trackPrice.knobs.landCover = 0
      gameRules.trackPrice.knobs.elevation = 0

      expect(terrainCost(800, 0.3)).toBe(0)
    })

    it('should trim ground past the cap before the knobs weigh it', () => {
      const { openGroundCost, maxTerrainFactor } = gameRules.trackPrice
      const cap = maxTerrainFactor * openGroundCost
      // Ground twice the cap, half of it land cover and half slope
      const landCover = cap
      const slope = cap / slopeCost
      gameRules.trackPrice.knobs.landCover = 1
      gameRules.trackPrice.knobs.elevation = 0

      // Trimmed to the cap, both parts alike: the land cover's half is left
      expect(terrainCost(landCover, slope)).toBeCloseTo(cap / 2, 9)
    })

    it('should price capped ground at the cap times the knob when the knobs match', () => {
      const { openGroundCost, maxTerrainFactor } = gameRules.trackPrice
      const cap = maxTerrainFactor * openGroundCost
      gameRules.trackPrice.knobs.landCover = 0.5
      gameRules.trackPrice.knobs.elevation = 0.5

      expect(terrainCost(800, 1)).toBeCloseTo(0.5 * cap, 9)
    })
  })
})
