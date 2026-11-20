/**
 * Track Cost Tests
 *
 * A line of track costs the sum of the grid cells it passes through, each
 * charged once. The price depends only on the line's vertices, so it can go
 * down as well as up while a leg is being placed.
 *
 * Lake and sea cells are bridged instead, each at the bridge's price per
 * speed unit of its width, whatever the cell's own cost; and each crossing
 * of a river adds a river bridge.
 *
 * A land cell's price is its terrain cost — land cover, roughness, and the
 * line's climb into it from the cell before, each weighed by its tuning
 * knob — turned into dollars by the board's price
 * scale: ordinary ground costs `trackPrice.perSpeedUnit` per speed unit of
 * the cell's width at knobs of 1.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  cellsAlongLine,
  cellPath,
  linePrice,
  trackPriceScale,
  terrainCost,
  climbPoints
} from '@/composables/map/trackCost'
import { gameRules } from '@/config/game'
import { riverIndex } from '@/composables/map/water'
import { cellCenter } from '@/composables/map/cellGrid'
import { makeTestGrid, CELL, CELL_METERS } from '../utils/testGrid'
import { pinKnobs } from '../utils/boardScale'

/**
 * A single row of square cells running east along latitude 0, where a degree
 * of longitude is as long as a degree of latitude. Cell `i` has the land
 * cover `covers[i]` and the roughness `roughs[i]`, level if not given.
 * @param {Array<number>} covers - One land cover cost per cell, west to east
 * @param {Array<number>} [roughs] - One roughness per cell, as a grade
 * @returns {Object} The grid
 */
function rowOfCells(covers, roughs = []) {
  return makeTestGrid({
    rows: 1,
    cols: covers.length,
    south: -CELL / 2,
    cell: (row, col) => ({ landCover: covers[col], roughness: roughs[col] })
  })
}

/** The test grids' cells' width, in km: also the speed unit priced at here */
const CELL_KM = CELL_METERS / 1000

/**
 * What a line is priced against (see `linePrice`): a grid, its price scale,
 * and a speed unit one cell wide, so a water cell's bridge costs exactly the
 * bridge rate per speed unit.
 * @param {Object} grid - The grid
 * @param {number} [priceScale] - Dollars per point of terrain cost
 * @param {Object} [rivers] - Rivers on the grid (see `riverIndex`)
 * @returns {Object} The board
 */
const board = (grid, priceScale = 1, rivers = null) => ({
  grid,
  priceScale,
  speedUnitKm: CELL_KM,
  rivers
})

// The knobs are meant to be edited after playtests. Every test here starts
// them at 1, so a level cell at a price scale of 1 costs its land cover, and
// the tests check the rules rather than today's tuning.
//
// The cap is tuning too: it may be set so high that it never binds (999, "no
// cap", since 2026-11-19). The tests of the cap set one that binds, with
// `pinCap`, and every test puts the configured cap back when it ends.
let restoreKnobs
let savedCap
beforeEach(() => {
  restoreKnobs = pinKnobs(1)
  savedCap = gameRules.trackPrice.maxTerrainFactor
})
afterEach(() => {
  restoreKnobs()
  gameRules.trackPrice.maxTerrainFactor = savedCap
})

/**
 * Sets the cap to Empire Builder's own: its alpine mileposts, its dearest
 * ground, cost 5 times its clear ones. The cap tests need one low enough to
 * reach with the ground they build, whatever the cap is tuned to today.
 * (The hooks above put the configured cap back after each test.)
 * @returns {number} The cap, as a factor of ordinary ground
 */
function pinCap() {
  gameRules.trackPrice.maxTerrainFactor = 5
  return gameRules.trackPrice.maxTerrainFactor
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

  describe('cellPath', () => {
    /**
     * A point on a grid whose corner is at 0, 0, in units of cells: `at(1.5,
     * 0.5)` is the middle of the second cell of the bottom row.
     */
    const at = (x, y) => ({ lat: y * CELL, lng: x * CELL })
    // Cells in a grid four columns wide, by row (from the south) and column
    const square = makeTestGrid({ rows: 4, cols: 4 })
    const cell = (row, col) => row * 4 + col

    // The bug: pricing looked at points a quarter of a cell apart, and the
    // sliver of the cell west of (1, 1) this leg crosses lies between two
    it('should include a cell the line clips only a sliver of', () => {
      const path = cellPath([at(0.5, 0.5), at(1.5, 1.6)], square)

      expect(path).toEqual([cell(0, 0), cell(1, 0), cell(1, 1)])
    })

    it('should charge for a cell the line clips only a sliver of', () => {
      const grid = makeTestGrid({
        rows: 2,
        cols: 2,
        cell: (row, col) => ({ landCover: 1 + row * 2 + col })
      })

      // 1 for (0, 0), 3 for the sliver of (1, 0), 4 for (1, 1)
      expect(linePrice([at(0.5, 0.5), at(1.5, 1.6)], board(grid, 1)).total).toBe(8)
    })

    it('should go straight from cell to cell through a corner it passes exactly through', () => {
      expect(cellPath([at(0.5, 0.5), at(2.5, 2.5)], square)).toEqual([
        cell(0, 0),
        cell(1, 1),
        cell(2, 2)
      ])
    })

    // Computer players build from one cell's center to the next, and their
    // diagonal steps go through corners: rounding must not tip them into the
    // cells either side
    it("should go through the corner between diagonal neighbors' centers on a real grid", () => {
      const grid = makeTestGrid({
        rows: 5,
        cols: 5,
        south: 39.123,
        west: -105.471,
        lngStep: CELL * 1.29
      })
      const centers = [0, 6, 12, 18, 24].map((index) => cellCenter(grid, index))

      expect(cellPath(centers, grid)).toEqual([0, 6, 12, 18, 24])
    })

    it('should follow a leg running west and south', () => {
      // Across the columns at x = 3, 2 and 1, and the row at y = 3 between
      // the second and third
      expect(cellPath([at(3.5, 3.5), at(0.5, 2.7)], square)).toEqual([
        cell(3, 3),
        cell(3, 2),
        cell(3, 1),
        cell(2, 1),
        cell(2, 0)
      ])
    })

    it('should list the cells of each leg in turn', () => {
      expect(cellPath([at(0.5, 0.5), at(2.5, 0.5), at(2.5, 2.5)], square)).toEqual([
        cell(0, 0),
        cell(0, 1),
        cell(0, 2),
        cell(1, 2),
        cell(2, 2)
      ])
    })

    it('should list no cell for a hole the line crosses', () => {
      const holed = makeTestGrid({ rows: 1, cols: 3, cell: (row, col) => (col === 1 ? null : {}) })

      expect(cellPath([at(0.5, 0.5), at(2.5, 0.5)], holed)).toEqual([0, 2])
    })

    it('should end a line in the nearest cell when its last vertex is in a hole', () => {
      const holed = makeTestGrid({ rows: 1, cols: 3, cell: (row, col) => (col === 1 ? null : {}) })

      // The end is in the hole, nearer the cell east of it than the one the
      // line starts in
      expect(cellPath([at(0.5, 0.5), at(1.9, 0.5)], holed)).toEqual([0, 2])
    })
  })

  describe('linePrice', () => {
    it('should charge the cell a line starts in as soon as it starts', () => {
      const grid = rowOfCells([700, 2000])

      expect(linePrice([centerOf(0)], board(grid, 1)).total).toBe(700)
    })

    it('should charge each cell the line crosses once, start included', () => {
      const grid = rowOfCells([100, 200, 300])

      expect(linePrice([centerOf(0), centerOf(2)], board(grid, 1)).total).toBe(600)
    })

    it('should not charge again for the cell a leg shares with the leg before it', () => {
      const grid = rowOfCells([100, 200, 300])

      expect(linePrice([centerOf(0), centerOf(1), centerOf(2)], board(grid, 1)).total).toBe(600)
    })

    // The bug: pricing added a cell each time the cursor entered one, so a leg
    // pulled out and brought back kept the cells it had passed over
    it('should cost less again once a leg is brought back closer to its start', () => {
      const grid = rowOfCells([100, 200, 300, 400])

      const pulledOut = linePrice([centerOf(0), centerOf(3)], board(grid, 1)).total
      const broughtBack = linePrice([centerOf(0), centerOf(1)], board(grid, 1)).total

      expect(pulledOut).toBe(1000)
      expect(broughtBack).toBe(300)
    })

    it('should charge nothing for a cell whose terrain failed to load', () => {
      const grid = rowOfCells([100, 200, 300], [0, NaN, 0])

      expect(linePrice([centerOf(0), centerOf(2)], board(grid, 1)).total).toBe(400)
    })

    it('should charge nothing for a line with no vertices', () => {
      expect(linePrice([], board(rowOfCells([100]), 1)).total).toBe(0)
    })
  })

  describe('bridges', () => {
    // A water cell's bridge on these grids: one speed unit's worth
    const BRIDGE = gameRules.bridges.perSpeedUnit
    const RIVER = gameRules.bridges.riverCrossing

    /**
     * A row of cells where 'W' is a lake cell and a number is a land cell
     * costing that much.
     */
    function rowWithWater(cells) {
      return makeTestGrid({
        rows: 1,
        cols: cells.length,
        south: -CELL / 2,
        cell: (row, col) => (cells[col] === 'W' ? { water: true } : { landCover: cells[col] })
      })
    }

    it("should charge a bridge for a lake cell instead of the cell's own cost", () => {
      const grid = rowWithWater([100, 'W', 300])

      expect(linePrice([centerOf(0), centerOf(2)], board(grid)).total).toBe(100 + BRIDGE + 300)
    })

    it('should charge every cell of a crossing the same, so it costs by how far it spans', () => {
      const grid = rowWithWater([100, 'W', 'W', 'W', 300])

      expect(linePrice([centerOf(0), centerOf(4)], board(grid)).total).toBe(400 + 3 * BRIDGE)
    })

    it('should charge a lake cell crossed twice once', () => {
      const grid = rowWithWater([100, 'W', 300])

      expect(linePrice([centerOf(0), centerOf(2), centerOf(0)], board(grid)).total).toBe(
        100 + BRIDGE + 300
      )
    })

    it('should charge a river bridge each time the line crosses a river', () => {
      const grid = rowWithWater([100, 200, 300])
      // A river running north to south through the middle cell
      const rivers = riverIndex(grid, [
        [
          [1.5 * CELL, -CELL],
          [1.5 * CELL, CELL]
        ]
      ])

      expect(linePrice([centerOf(0), centerOf(2)], board(grid, 1, rivers)).total).toBe(600 + RIVER)
      // Across and back again further north: two bridges
      const back = { lat: 0.3 * CELL, lng: 0.5 * CELL }
      expect(linePrice([centerOf(0), centerOf(2), back], board(grid, 1, rivers)).total).toBe(
        600 + 2 * RIVER
      )
    })

    it('should say how much of the price is bridges, rivers included', () => {
      const grid = rowWithWater([100, 'W', 300, 400])
      const rivers = riverIndex(grid, [
        [
          [2.5 * CELL, -CELL],
          [2.5 * CELL, CELL]
        ]
      ])

      expect(linePrice([centerOf(0), centerOf(3)], board(grid, 1, rivers))).toEqual({
        total: 800 + BRIDGE + RIVER,
        bridges: BRIDGE + RIVER
      })
    })
  })

  describe('price scale', () => {
    // The test grid's cells are 10 km tall (see testGrid.js)
    const cellKm = 10

    it('should multiply land cells by the price scale but leave bridges alone', () => {
      const grid = makeTestGrid({
        rows: 1,
        cols: 3,
        south: -CELL / 2,
        cell: (row, col) => (col === 1 ? { water: true } : { landCover: 100 * (col + 1) })
      })
      const { perSpeedUnit } = gameRules.bridges

      expect(linePrice([centerOf(0), centerOf(2)], board(grid, 3))).toEqual({
        total: 3 * 100 + perSpeedUnit + 3 * 300,
        bridges: perSpeedUnit
      })
    })

    it('should price a cell of open ground one speed unit wide at the rate per speed unit', () => {
      const grid = rowOfCells([gameRules.trackPrice.openGroundCost])

      const scale = trackPriceScale(grid, cellKm)

      expect(linePrice([centerOf(0)], board(grid, scale)).total).toBeCloseTo(
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

      expect(linePrice([centerOf(1)], board(grid, scale)).total).toBeCloseTo(
        3 * linePrice([centerOf(0)], board(grid, scale)).total,
        6
      )
    })

    it('should cap a cell at the dearest ground, however steep', () => {
      const cap = pinCap() * gameRules.trackPrice.openGroundCost
      const grid = rowOfCells([cap, 10 * cap, 0], [0, 0, 1])

      expect(linePrice([centerOf(0)], board(grid, 1)).total).toBe(cap)
      expect(linePrice([centerOf(1)], board(grid, 1)).total).toBe(cap)
      expect(linePrice([centerOf(2)], board(grid, 1)).total).toBe(cap)
    })
  })

  describe('climb', () => {
    /** One water cell's bridge: the speed unit here is one cell wide */
    const BRIDGE = gameRules.bridges.perSpeedUnit

    /**
     * How high to climb over one cell to make a grade some multiple of the
     * ruling grade. Worked out from the rule rather than written in meters,
     * so these tests check the climb rule, not whatever the ruling grade is
     * tuned to today.
     * @param {number} times - The grade, in ruling grades
     * @returns {number} Meters
     */
    const rulingClimb = (times) => times * gameRules.trackPrice.climb.rulingGrade * CELL_METERS

    /**
     * A row of cells of land cover 100, at the heights given, west to east,
     * one cell apart.
     * @param {Array<number|string>} heights - Each cell's height in meters,
     *   or 'W' for lake or sea
     * @returns {Object} The grid
     */
    const rowAtHeights = (heights) =>
      makeTestGrid({
        rows: 1,
        cols: heights.length,
        south: -CELL / 2,
        cell: (row, col) =>
          heights[col] === 'W'
            ? { water: true, elevation: -50 }
            : { landCover: 100, elevation: heights[col] }
      })

    it('should charge a climb past the ruling grade in the cell it climbs into', () => {
      // Three times the ruling grade: twice past it, so two extra cells of
      // ordinary ground
      const top = rulingClimb(3)
      const grid = rowAtHeights([0, top, top])
      const extra = 2 * gameRules.trackPrice.openGroundCost

      expect(linePrice([centerOf(0), centerOf(2)], board(grid)).total).toBe(300 + extra)
    })

    it('should charge a climb down as it charges one up', () => {
      const grid = rowAtHeights([0, 600, 600])

      expect(linePrice([centerOf(2), centerOf(0)], board(grid)).total).toBe(
        linePrice([centerOf(0), centerOf(2)], board(grid)).total
      )
    })

    it('should charge nothing for a climb no steeper than the ruling grade', () => {
      const grid = rowAtHeights([0, rulingClimb(1), rulingClimb(2)])

      expect(linePrice([centerOf(0), centerOf(2)], board(grid)).total).toBe(300)
    })

    it('should charge no climb for the cell a line starts in', () => {
      const grid = rowAtHeights([0, 600])

      expect(linePrice([centerOf(1)], board(grid)).total).toBe(100)
    })

    it('should charge no climb across a hole in the grid', () => {
      // The middle cell's terrain failed to load: what lies between is unknown
      const grid = makeTestGrid({
        rows: 1,
        cols: 3,
        south: -CELL / 2,
        cell: (row, col) => (col === 1 ? null : { landCover: 100, elevation: col * 600 })
      })

      expect(linePrice([centerOf(0), centerOf(2)], board(grid)).total).toBe(200)
    })

    it('should charge no climb onto or off a bridge', () => {
      // The water's height is its floor, far below the land either side
      const grid = rowAtHeights([600, 'W', 0])

      expect(linePrice([centerOf(0), centerOf(2)], board(grid)).total).toBe(200 + BRIDGE)
    })

    it('should weigh the climb by the climb knob', () => {
      // Three times the ruling grade: two extra cells, at half weight
      const grid = rowAtHeights([0, rulingClimb(3)])
      Object.assign(gameRules.trackPrice.knobs, { landCover: 1, roughness: 0, climb: 0.5 })

      expect(linePrice([centerOf(0), centerOf(1)], board(grid)).total).toBe(
        200 + 0.5 * 2 * gameRules.trackPrice.openGroundCost
      )
    })
  })

  describe('climbPoints', () => {
    const { openGroundCost } = gameRules.trackPrice
    const ruling = gameRules.trackPrice.climb.rulingGrade

    it('should add nothing up to the ruling grade', () => {
      expect(climbPoints(0)).toBe(0)
      expect(climbPoints(ruling)).toBe(0)
    })

    it('should add an ordinary cell for each further ruling grade of climb', () => {
      // Twice the ruling grade takes twice the track to climb: one extra cell
      expect(climbPoints(2 * ruling)).toBeCloseTo(openGroundCost, 9)
      expect(climbPoints(3 * ruling)).toBeCloseTo(2 * openGroundCost, 9)
    })

    it('should follow the configured ruling grade', () => {
      const { climb } = gameRules.trackPrice
      const saved = climb.rulingGrade
      climb.rulingGrade = 0.01
      try {
        expect(climbPoints(0.03)).toBeCloseTo(2 * openGroundCost, 9)
      } finally {
        climb.rulingGrade = saved
      }
    })
  })

  describe('terrainCost', () => {
    const { roughnessCost } = gameRules.trackPrice

    it('should add the land cover, the roughness and the climb', () => {
      const ruling = gameRules.trackPrice.climb.rulingGrade

      expect(terrainCost(100, 0.05, 2 * ruling)).toBeCloseTo(
        100 + roughnessCost * 0.05 + climbPoints(2 * ruling),
        9
      )
    })

    it('should weigh each part by its own knob', () => {
      const ruling = gameRules.trackPrice.climb.rulingGrade
      Object.assign(gameRules.trackPrice.knobs, { landCover: 2, roughness: 0.5, climb: 0.25 })

      expect(terrainCost(100, 0.1, 2 * ruling)).toBeCloseTo(
        2 * 100 + 0.5 * roughnessCost * 0.1 + 0.25 * climbPoints(2 * ruling),
        9
      )
    })

    it('should weigh the land cover by the land cover knob alone', () => {
      Object.assign(gameRules.trackPrice.knobs, { landCover: 2, roughness: 3, climb: 3 })

      expect(terrainCost(300, 0)).toBeCloseTo(600, 9)
    })

    it('should weigh the roughness by the roughness knob alone', () => {
      Object.assign(gameRules.trackPrice.knobs, { landCover: 3, roughness: 2, climb: 3 })

      expect(terrainCost(0, 0.1)).toBeCloseTo(2 * roughnessCost * 0.1, 9)
    })

    it('should cost nothing at knobs of 0', () => {
      Object.assign(gameRules.trackPrice.knobs, { landCover: 0, roughness: 0, climb: 0 })

      expect(terrainCost(800, 0.3, 0.1)).toBe(0)
    })

    it('should cap a cell at the dearest ground, priced at the land cover knob', () => {
      const maxTerrainFactor = pinCap()
      const { openGroundCost } = gameRules.trackPrice
      Object.assign(gameRules.trackPrice.knobs, { landCover: 0.5, roughness: 0.15, climb: 0.5 })

      expect(terrainCost(450, 2, 0.2)).toBeCloseTo(maxTerrainFactor * 0.5 * openGroundCost, 9)
    })

    it('should never price worse ground below better, whatever the knobs', () => {
      // Regression: the cap once trimmed every part alike before the knobs
      // weighed them, so at unequal knobs adding roughness to a capped cell
      // shrank its dearer parts and lowered its price
      Object.assign(gameRules.trackPrice.knobs, { landCover: 0.5, roughness: 0.15, climb: 0.5 })
      const ruling = gameRules.trackPrice.climb.rulingGrade
      const costs = [0, 0.2, 0.5, 1, 2].map((roughness) => terrainCost(450, roughness, 5 * ruling))

      costs.slice(1).forEach((cost, i) => expect(cost).toBeGreaterThanOrEqual(costs[i]))
    })

    it('should price capped ground at the cap times the knob when the knobs match', () => {
      const cap = pinCap() * gameRules.trackPrice.openGroundCost
      Object.assign(gameRules.trackPrice.knobs, { landCover: 0.5, roughness: 0.5, climb: 0.5 })

      expect(terrainCost(800, 1, 0.5)).toBeCloseTo(0.5 * cap, 9)
    })
  })
})
