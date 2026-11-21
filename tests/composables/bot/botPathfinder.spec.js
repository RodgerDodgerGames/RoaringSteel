/**
 * Bot Pathfinder Tests
 *
 * The computer player's way of laying out track, on a made-up state with a
 * region it must stay inside, water to bridge or go round, and dear ground
 * to avoid (see tests/utils/botBoard.js). Whatever line it finds must be one
 * the build rules allow — the same check a person's line gets.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  lineBlock,
  townCells,
  builtLegs,
  trackIndex,
  closedCells
} from '@/composables/map/buildRules'
import { regionTest } from '@/composables/map/region'
import { maxBridgeCells } from '@/composables/map/water'
import { linePrice, cellPath } from '@/composables/map/trackCost'
import { findCell, rowOf, colOf } from '@/composables/map/cellGrid'
import { isWaterCell, riverIndex, riverCrossings } from '@/composables/map/water'
import { gameRules } from '@/config/game'
import { pointKey } from '@/composables/network'
import {
  searchBoard,
  costField,
  planLine,
  affordableSection,
  reachableFrom
} from '@/composables/bot/botPathfinder'
import {
  makeGrid,
  makeRegion,
  makeTowns,
  makeRivers,
  centerAt,
  cornerAt,
  ROWS,
  COLS,
  isLake,
  isChannel,
  seededRandom,
  isRidge
} from '../../utils/botBoard'
import { pinKnobs } from '../../utils/boardScale'
import { makeTestGrid, CELL, CELL_METERS } from '../../utils/testGrid'

/** The speed unit these boards are played at: one cell */
const SPEED_UNIT_KM = CELL_METERS / 1000

const towns = makeTowns()
const townNamed = (name) => towns.find((town) => town.name === name)
const pointOf = (town) => ({ lat: town.lat, lng: town.lon })

/**
 * The build rules for the test board, with some track already built, and
 * its river unless told otherwise
 */
function rulesWith(segments = [], { withRiver = true } = {}) {
  const grid = makeGrid()
  return {
    grid,
    // Land priced at its terrain cost (with the knobs at 1, see below):
    // these tests are about the search
    priceScale: 1,
    speedUnitKm: SPEED_UNIT_KM,
    rivers: withRiver ? riverIndex(grid, makeRivers()) : null,
    isInRegion: regionTest(makeRegion()),
    townCells: townCells(towns, grid),
    builtTrack: trackIndex(builtLegs(segments))
  }
}

/** What a line's track costs on the rules' board */
const priceOn = (rules) => (points) => linePrice(points, rules).total

/** The row and column of a cell */
const placeOf = (cell, grid) => ({ row: rowOf(grid, cell), col: colOf(grid, cell) })

describe('botPathfinder', () => {
  let rules
  let board
  let restoreKnobs

  beforeEach(() => {
    // The knobs at 1, so a cell costs its terrain cost at a price scale of 1
    restoreKnobs = pinKnobs(1)
    rules = rulesWith()
    board = searchBoard(rules, towns)
  })
  afterEach(() => restoreKnobs())

  describe('planLine', () => {
    it('should find a line the build rules allow, ending on the town', () => {
      const line = planLine(board, [pointOf(townNamed('Alder'))], pointOf(townNamed('Birch')))

      expect(line).not.toBeNull()
      expect(lineBlock(line, rules, { isFinished: true })).toBeNull()
      expect(line[0]).toEqual(pointOf(townNamed('Alder')))
      expect(line.at(-1)).toEqual(pointOf(townNamed('Birch')))
    })

    it('should find no line into a town full to the player', () => {
      const closed = [{ town: townNamed('Gum'), limit: 1, playerCount: 2 }]
      const shutRules = { ...rules, closedCells: closedCells(closed, rules.grid) }
      const shutBoard = searchBoard(shutRules, towns)
      const alder = pointOf(townNamed('Alder'))

      expect(planLine(shutBoard, [alder], pointOf(townNamed('Gum')))).toBeNull()
      // Other towns are still reached, by lines that keep out of Gum's cell
      const line = planLine(shutBoard, [alder], pointOf(townNamed('Cedar')))
      expect(line).not.toBeNull()
      expect(lineBlock(line, shutRules, { isFinished: true })).toBeNull()
    })

    it('should go round water too wide to bridge', () => {
      // Ivy sits west of the lake and Elm east of it
      const line = planLine(board, [pointOf(townNamed('Ivy'))], pointOf(townNamed('Elm')))

      expect(lineBlock(line, rules, { isFinished: true })).toBeNull()
      const crossed = cellPath(line, rules.grid).map((cell) => placeOf(cell, rules.grid))
      expect(crossed.some(({ row, col }) => isLake(row, col))).toBe(false)
    })

    it('should bridge water narrow enough to bridge', () => {
      // The channel runs the whole height of the board: there is no way round
      const line = planLine(board, [pointOf(townNamed('Fir'))], pointOf(townNamed('Dogwood')))

      expect(lineBlock(line, rules, { isFinished: true })).toBeNull()
      const crossed = cellPath(line, rules.grid)
      expect(crossed.some((cell) => isWaterCell(rules.grid, cell))).toBe(true)
      const places = crossed.map((cell) => placeOf(cell, rules.grid))
      expect(places.some(({ row, col }) => isChannel(row, col))).toBe(true)
    })

    it('should bridge water beyond the region when that is the only way across', () => {
      // Two pieces of region, columns 0–2 and 4–6, with water between them
      // in column 3, outside both
      const grid = makeTestGrid({
        rows: 3,
        cols: 7,
        cell: (row, col) => (col === 3 ? { water: true } : { landCover: 100 })
      })
      const piece = (west) => [
        [
          [west * CELL, 0],
          [(west + 3) * CELL, 0],
          [(west + 3) * CELL, 3 * CELL],
          [west * CELL, 3 * CELL],
          [west * CELL, 0]
        ]
      ]
      const twoPieces = {
        type: 'Feature',
        geometry: { type: 'MultiPolygon', coordinates: [piece(0), piece(4)] }
      }
      const splitRules = {
        grid,
        priceScale: 1,
        speedUnitKm: SPEED_UNIT_KM,
        rivers: null,
        isInRegion: regionTest(twoPieces),
        townCells: []
      }
      const at = (row, col) => ({ lat: (row + 0.5) * CELL, lng: (col + 0.5) * CELL })

      const line = planLine(searchBoard(splitRules, []), [at(1, 1)], at(1, 5))

      expect(line).not.toBeNull()
      expect(lineBlock(line, splitRules, { isFinished: true })).toBeNull()
    })

    it('should go through the pass rather than over the ridge', () => {
      const line = planLine(board, [pointOf(townNamed('Juniper'))], pointOf(townNamed('Gum')))

      const places = cellPath(line, rules.grid).map((cell) => placeOf(cell, rules.grid))
      expect(places.some(({ row, col }) => isRidge(row, col))).toBe(false)
      expect(places.some(({ row, col }) => row === 3 && col === 12)).toBe(true)
    })

    it('should go round a steep climb rather than straight over it', () => {
      // Level ground, but a hill 1,000 m high in the middle of the middle
      // row: a 10% climb in and out of it, far past the ruling grade
      const grid = makeTestGrid({
        rows: 3,
        cols: 5,
        cell: (row, col) => ({ landCover: 100, elevation: row === 1 && col === 2 ? 1000 : 0 })
      })
      const hillRules = {
        grid,
        priceScale: 1,
        speedUnitKm: SPEED_UNIT_KM,
        rivers: null,
        isInRegion: regionTest(null),
        townCells: []
      }
      const at = (row, col) => ({ lat: (row + 0.5) * CELL, lng: (col + 0.5) * CELL })

      const line = planLine(searchBoard(hillRules, []), [at(1, 0)], at(1, 4))

      const places = cellPath(line, grid).map((cell) => placeOf(cell, grid))
      expect(places.some(({ row, col }) => row === 1 && col === 2)).toBe(false)
    })

    it('should stay inside the region', () => {
      const line = planLine(board, [pointOf(townNamed('Fir'))], pointOf(townNamed('Cedar')))

      expect(lineBlock(line, rules, { isFinished: true })).toBeNull()
    })

    it('should find no line to a town outside the region', () => {
      expect(planLine(board, [pointOf(townNamed('Cedar'))], pointOf(townNamed('Kauri')))).toBeNull()
    })

    it("should cross another player's track rather than run beside it", () => {
      // A wall of track down column 10, all the way up the board
      const wall = [{ coordinates: [centerAt(0, 10), centerAt(ROWS - 1, 10)] }]
      rules = rulesWith(wall)
      board = searchBoard(rules, towns)

      const line = planLine(board, [pointOf(townNamed('Ivy'))], pointOf(townNamed('Gum')))

      expect(line).not.toBeNull()
      expect(lineBlock(line, rules, { isFinished: true })).toBeNull()
    })

    it('should go through the towns it passes, so they join the network', () => {
      // A corridor one cell high, with a town part way along it, off the
      // middle of its cell as towns are
      const grid = makeGrid((row) => row === 0)
      const middle = { name: 'Mid', lat: centerAt(0, 3).lat + 0.01, lon: centerAt(0, 3).lng - 0.02 }
      const corridorTowns = [{ ...middle, industries: [] }]
      const corridor = {
        grid,
        priceScale: 1,
        speedUnitKm: SPEED_UNIT_KM,
        isInRegion: regionTest(makeRegion()),
        townCells: townCells(corridorTowns, grid)
      }

      const line = planLine(searchBoard(corridor, corridorTowns), [centerAt(0, 0)], centerAt(0, 6))

      expect(line.map(pointKey)).toContain(pointKey({ lat: middle.lat, lng: middle.lon }))
    })

    it('should start from whichever start point is cheapest', () => {
      const sources = [pointOf(townNamed('Alder')), pointOf(townNamed('Dogwood'))]

      const line = planLine(board, sources, pointOf(townNamed('Fir')))

      expect(line[0]).toEqual(pointOf(townNamed('Dogwood')))
    })

    describe('a border that runs between cell centers', () => {
      /**
       * The test board's region with a slit of land outside it cut down from
       * the north edge to row 6: a fifth of a cell wide, along the side
       * between columns 9 and 10. Every cell's center is still inside, but a
       * line from a center in column 9 to the one beside it in column 10
       * runs across the slit — where a real state's border wanders between
       * the centers of the cells along it.
       */
      function slitRules() {
        const ring = [
          cornerAt(0, 0),
          cornerAt(0, COLS),
          cornerAt(ROWS, COLS),
          cornerAt(ROWS, 10.1),
          cornerAt(6, 10.1),
          cornerAt(6, 9.9),
          cornerAt(ROWS, 9.9),
          cornerAt(ROWS, 0),
          cornerAt(0, 0)
        ].map(({ lat, lng }) => [lng, lat])
        const region = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] } }
        // No towns, so no town's cell lets a line through the slit
        return { ...rulesWith(), isInRegion: regionTest(region), townCells: [] }
      }
      // Either side of the slit, on row 16, ten rows above its foot
      const west = centerAt(16, 7)
      const east = centerAt(16, 11)

      it('should not plan a line across land outside the region between two centers', () => {
        const slit = slitRules()

        const line = costField(searchBoard(slit, []), [west], { targets: [east] }).lineTo(east)

        expect(lineBlock(line, slit, { isFinished: true })).toBeNull()
      })

      it('should find the way round, below the foot of the slit', () => {
        const slit = slitRules()

        const line = planLine(searchBoard(slit, []), [west], east)

        expect(line).not.toBeNull()
        expect(lineBlock(line, slit, { isFinished: true })).toBeNull()
        const rows = cellPath(line, slit.grid).map((cell) => rowOf(slit.grid, cell))
        expect(Math.min(...rows)).toBeLessThan(6)
      })

      it('should keep to the border on every line it plans, from anywhere to any cell', () => {
        // From points anywhere in a cell, as track's points are, to the
        // center of a cell, which is where the line ends in a cell with no
        // town (a computer player's target is always a town, which its line
        // ends on)
        const slit = slitRules()
        const slitBoard = searchBoard(slit, [])
        const random = seededRandom(7)
        const anywhere = () => centerAt(random() * (ROWS - 1), random() * (COLS - 1))
        const anyCell = () => centerAt(Math.floor(random() * ROWS), Math.floor(random() * COLS))
        for (let i = 0; i < 60; i++) {
          const from = anywhere()
          const to = anyCell()

          const line = costField(slitBoard, [from], { targets: [to] }).lineTo(to)

          // Every cell can be reached, round the slit's foot
          expect(line).not.toBeNull()
          expect(lineBlock(line, slit)?.reason).not.toBe('outside')
        }
      })
    })
  })

  describe('costField', () => {
    it('should add a river bridge for the river a line has to cross', () => {
      // Elm is west of the river and Fir east of it: every way between them
      // crosses it, and the cheapest crosses it once
      const from = [pointOf(townNamed('Elm'))]
      const to = pointOf(townNamed('Fir'))
      const dryBoard = searchBoard(rulesWith([], { withRiver: false }), towns)

      const wet = costField(board, from).costTo(to)
      const dry = costField(dryBoard, from).costTo(to)

      expect(wet - dry).toBeCloseTo(gameRules.bridges.riverCrossing, 6)
      const line = planLine(board, from, to)
      expect(riverCrossings(line, rules.grid, rules.rivers)).toHaveLength(1)
    })

    it('should cost nothing it cannot reach as Infinity', () => {
      const field = costField(board, [pointOf(townNamed('Alder'))])

      expect(field.costTo(pointOf(townNamed('Kauri')))).toBe(Infinity)
      expect(field.lineTo(pointOf(townNamed('Kauri')))).toBeNull()
    })

    it('should stop once its targets are reached, costing them as the whole search does', () => {
      const sources = [pointOf(townNamed('Alder'))]
      const everywhere = costField(board, sources)
      const targets = ['Juniper', 'Elm', 'Dogwood'].map((name) => pointOf(townNamed(name)))

      const targeted = costField(board, sources, { targets })

      targets.forEach((point) => {
        expect(targeted.costTo(point)).toBe(everywhere.costTo(point))
        expect(priceOn(rules)(targeted.lineTo(point))).toBe(
          priceOn(rules)(everywhere.lineTo(point))
        )
      })
    })

    it('should head for a single target and find a line as cheap as the whole search does', () => {
      const sources = [pointOf(townNamed('Ivy'))]
      const everywhere = costField(board, sources)

      // Round the lake, over the ridge's pass, and over the river
      ;['Gum', 'Cedar', 'Dogwood', 'Hazel'].forEach((name) => {
        const target = pointOf(townNamed(name))
        const headed = costField(board, sources, { targets: [target] })
        expect(headed.costTo(target)).toBe(everywhere.costTo(target))
      })
    })

    it('should not answer for a point it was not asked about once it has stopped', () => {
      const field = costField(board, [pointOf(townNamed('Alder'))], {
        targets: [pointOf(townNamed('Juniper'))]
      })

      expect(() => field.costTo(pointOf(townNamed('Dogwood')))).toThrow()
    })

    it('should cost a far town more than a near one', () => {
      const field = costField(board, [pointOf(townNamed('Alder'))])

      expect(field.costTo(pointOf(townNamed('Juniper')))).toBeLessThan(
        field.costTo(pointOf(townNamed('Dogwood')))
      )
    })
  })

  describe('affordableSection', () => {
    it('should build as far as the money goes, as a section the rules allow', () => {
      const line = planLine(board, [pointOf(townNamed('Alder'))], pointOf(townNamed('Dogwood')))

      const section = affordableSection(line, 5000, rules, priceOn(rules))

      expect(section.length).toBeLessThan(line.length)
      expect(section).toEqual(line.slice(0, section.length))
      expect(priceOn(rules)(section)).toBeLessThanOrEqual(5000)
      expect(lineBlock(section, rules, { isFinished: true })).toBeNull()
    })

    it('should build the whole line when it can be paid for', () => {
      const line = planLine(board, [pointOf(townNamed('Alder'))], pointOf(townNamed('Juniper')))

      expect(affordableSection(line, 1e9, rules, priceOn(rules))).toEqual(line)
    })

    it('should not stop part way over water', () => {
      const line = planLine(board, [pointOf(townNamed('Fir'))], pointOf(townNamed('Dogwood')))
      // Every budget that runs out somewhere along the line
      for (let budget = 1000; budget < priceOn(rules)(line); budget += 500) {
        const section = affordableSection(line, budget, rules, priceOn(rules))
        if (!section) continue
        expect(isWaterCell(rules.grid, findCell(section.at(-1), rules.grid))).toBe(false)
      }
    })

    it('should build nothing when not even the first step can be paid for', () => {
      const line = planLine(board, [pointOf(townNamed('Alder'))], pointOf(townNamed('Birch')))

      expect(affordableSection(line, 10, rules, priceOn(rules))).toBeNull()
    })
  })
})

describe('reachableFrom', () => {
  /**
   * A row of land, water and land: three cells of land each side of a
   * stretch of water some cells wide, three rows deep.
   */
  function strait(waterCells) {
    const cols = 6 + waterCells
    return makeTestGrid({
      rows: 3,
      cols,
      cell: (row, col) => (col >= 3 && col < 3 + waterCells ? { water: true } : { landCover: 100 })
    })
  }

  /** The board's search parts, at a speed unit given in cells */
  function boardOf(grid, speedUnitCells, region = null) {
    return searchBoard(
      {
        grid,
        priceScale: 1,
        speedUnitKm: speedUnitCells * SPEED_UNIT_KM,
        rivers: null,
        townCells: [],
        isInRegion: regionTest(region)
      },
      []
    )
  }

  /** The center of a cell in the middle row */
  const middleOf = (col) => ({ lat: 1.5 * CELL, lng: (col + 0.5) * CELL })

  /**
   * The most water cells in a row the priced search plans a bridge over
   * (`MAX_SEARCH_BRIDGE_CELLS` in botPathfinder.js). If that limit grows, the
   * first test below fails at its `costTo`, and this needs raising with it.
   */
  const SEARCH_BRIDGE_CELLS = 6

  it('crosses water as wide as the rules allow a bridge, past the longest the priced search plans', () => {
    // A speed unit wide enough that a bridge spans more than the priced
    // search plans, whatever a bridge may span today, and water one cell
    // wider than the search goes
    const { maxSpeedUnits } = gameRules.bridges
    const speedUnitCells = Math.ceil((SEARCH_BRIDGE_CELLS + 1) / maxSpeedUnits)
    const waterCells = SEARCH_BRIDGE_CELLS + 1
    const grid = strait(waterCells)
    const board = boardOf(grid, speedUnitCells)
    const farShore = middleOf(6 + waterCells - 1)

    expect(maxBridgeCells(grid, speedUnitCells * SPEED_UNIT_KM)).toBe(
      maxSpeedUnits * speedUnitCells
    )
    expect(maxSpeedUnits * speedUnitCells).toBeGreaterThanOrEqual(waterCells)
    expect(reachableFrom(board, [middleOf(0)])(farShore)).toBe(true)
    expect(costField(board, [middleOf(0)]).costTo(farShore)).toBe(Infinity)
  })

  it('does not cross water wider than a bridge may span', () => {
    // A speed unit one cell wide, so a bridge spans `maxSpeedUnits` cells,
    // over one cell more than that
    const waterCells = gameRules.bridges.maxSpeedUnits + 1
    const reaches = reachableFrom(boardOf(strait(waterCells), 1), [middleOf(0)])
    expect(reaches(middleOf(2))).toBe(true)
    expect(reaches(middleOf(6 + waterCells - 1))).toBe(false)
  })

  it('stays inside the region', () => {
    // Two pieces of region, with land between them outside it
    const grid = makeTestGrid({ rows: 3, cols: 10, cell: () => ({ landCover: 100 }) })
    const box = (west, east) => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [west * CELL, 0],
            [east * CELL, 0],
            [east * CELL, 3 * CELL],
            [west * CELL, 3 * CELL],
            [west * CELL, 0]
          ]
        ]
      }
    })
    const region = { type: 'FeatureCollection', features: [box(0, 4), box(6, 10)] }
    const reaches = reachableFrom(boardOf(grid, 1, region), [middleOf(0)])
    expect(reaches(middleOf(3))).toBe(true)
    expect(reaches(middleOf(8))).toBe(false)
  })
})
