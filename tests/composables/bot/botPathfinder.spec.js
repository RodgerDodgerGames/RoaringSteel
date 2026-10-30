/**
 * Bot Pathfinder Tests
 *
 * The computer player's way of laying out track, on a made-up state with a
 * region it must stay inside, water to bridge or go round, and dear ground
 * to avoid (see tests/utils/botBoard.js). Whatever line it finds must be one
 * the build rules allow — the same check a person's line gets.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { lineBlock, townCells, builtLegs, trackIndex } from '@/composables/map/buildRules'
import { regionTest } from '@/composables/map/region'
import { priceLine, cellPath } from '@/composables/map/trackCost'
import { findCell, rowOf, colOf } from '@/composables/map/cellGrid'
import { isWaterCell } from '@/composables/map/water'
import { pointKey } from '@/composables/network'
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
  centerAt,
  ROWS,
  isLake,
  isRiver,
  isRidge
} from '../../utils/botBoard'

const towns = makeTowns()
const townNamed = (name) => towns.find((town) => town.name === name)
const pointOf = (town) => ({ lat: town.lat, lng: town.lon })

/** The build rules for the test board, with some track already built */
function rulesWith(segments = []) {
  const grid = makeGrid()
  return {
    grid,
    isInRegion: regionTest(makeRegion()),
    townCells: townCells(towns, grid),
    builtTrack: trackIndex(builtLegs(segments))
  }
}

/** The row and column of a cell */
const placeOf = (cell, grid) => ({ row: rowOf(grid, cell), col: colOf(grid, cell) })

describe('botPathfinder', () => {
  let rules
  let board

  beforeEach(() => {
    rules = rulesWith()
    board = searchBoard(rules, towns)
  })

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
      // The river runs the whole height of the board: there is no way round
      const line = planLine(board, [pointOf(townNamed('Fir'))], pointOf(townNamed('Dogwood')))

      expect(lineBlock(line, rules, { isFinished: true })).toBeNull()
      const crossed = cellPath(line, rules.grid)
      expect(crossed.some((cell) => isWaterCell(rules.grid, cell))).toBe(true)
      const places = crossed.map((cell) => placeOf(cell, rules.grid))
      expect(places.some(({ row, col }) => isRiver(row, col))).toBe(true)
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
        expect(priceLine(targeted.lineTo(point), rules.grid)).toBe(
          priceLine(everywhere.lineTo(point), rules.grid)
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

      const section = affordableSection(line, 5000, rules)

      expect(section.length).toBeLessThan(line.length)
      expect(section).toEqual(line.slice(0, section.length))
      expect(priceLine(section, rules.grid)).toBeLessThanOrEqual(5000)
      expect(lineBlock(section, rules, { isFinished: true })).toBeNull()
    })

    it('should build the whole line when it can be paid for', () => {
      const line = planLine(board, [pointOf(townNamed('Alder'))], pointOf(townNamed('Juniper')))

      expect(affordableSection(line, 1e9, rules)).toEqual(line)
    })

    it('should not stop part way over water', () => {
      const line = planLine(board, [pointOf(townNamed('Fir'))], pointOf(townNamed('Dogwood')))
      // Every budget that runs out somewhere along the line
      for (let budget = 1000; budget < priceLine(line, rules.grid); budget += 500) {
        const section = affordableSection(line, budget, rules)
        if (!section) continue
        expect(isWaterCell(rules.grid, findCell(section.at(-1), rules.grid))).toBe(false)
      }
    })

    it('should build nothing when not even the first step can be paid for', () => {
      const line = planLine(board, [pointOf(townNamed('Alder'))], pointOf(townNamed('Birch')))

      expect(affordableSection(line, 10, rules)).toBeNull()
    })
  })
})
