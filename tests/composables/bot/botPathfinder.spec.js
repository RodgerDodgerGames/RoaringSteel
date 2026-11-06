/**
 * Bot Pathfinder Tests
 *
 * The computer player's way of laying out track, on a made-up state with a
 * region it must stay inside, water to bridge or go round, and dear ground
 * to avoid (see tests/utils/botBoard.js). Whatever line it finds must be one
 * the build rules allow — the same check a person's line gets.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { lineBlock, townCells, builtLegs, trackIndex } from '@/composables/map/buildRules'
import { regionTest } from '@/composables/map/region'
import { linePrice, cellPath } from '@/composables/map/trackCost'
import { findCell, rowOf, colOf } from '@/composables/map/cellGrid'
import { isWaterCell, riverIndex, riverCrossings } from '@/composables/map/water'
import { gameRules } from '@/config/game'
import { pointKey, townKey } from '@/composables/network'
import { townEntryFee } from '@/composables/townEntry'
import {
  searchBoard,
  costField,
  planLine,
  affordableSection
} from '@/composables/bot/botPathfinder'
import {
  makeGrid,
  makeRegion,
  makeTowns,
  makeRivers,
  centerAt,
  ROWS,
  isLake,
  isChannel,
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

/** What a line's track costs on the rules' board (town entry left out) */
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

    it("should add a town's entry fee unless the player's track reaches it", () => {
      const from = [pointOf(townNamed('Alder'))]
      const target = townNamed('Dogwood')
      const reachedBoard = searchBoard(rules, towns, new Set([townKey(target)]))

      const fresh = costField(board, from).costTo(pointOf(target))
      const reached = costField(reachedBoard, from).costTo(pointOf(target))

      expect(fresh - reached).toBeGreaterThanOrEqual(townEntryFee(target))
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
