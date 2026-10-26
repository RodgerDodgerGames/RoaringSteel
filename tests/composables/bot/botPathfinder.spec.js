/**
 * Bot Pathfinder Tests
 *
 * The computer player's way of laying out track, on a made-up state with a
 * region it must stay inside, water to bridge or go round, and dear ground
 * to avoid (see tests/utils/botBoard.js). Whatever line it finds must be one
 * the build rules allow — the same check a person's line gets.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { lineBlock, townCells, builtLegs } from '@/composables/map/buildRules'
import { regionTest } from '@/composables/map/region'
import { priceLine, cellPath, findCell } from '@/composables/map/trackCost'
import { isWaterCell } from '@/composables/map/water'
import { pointKey } from '@/composables/network'
import {
  gridLattice,
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
    builtLegs: builtLegs(segments)
  }
}

/** The row and column of the cell a point is in */
function placeOf(point, grid) {
  const [row, col] = findCell(point, grid).id.split('-').map(Number)
  return { row, col }
}

describe('botPathfinder', () => {
  let rules
  let board

  beforeEach(() => {
    rules = rulesWith()
    board = searchBoard(rules, towns)
  })

  describe('gridLattice', () => {
    it('should find cells and their neighbors from the centers alone', () => {
      // Ids that say nothing about where a cell is, as some saves have
      const grid = makeGrid().map((cell, i) => ({ ...cell, id: i * 7 }))
      const lattice = gridLattice(grid)

      const middle = lattice.cellNear(centerAt(5, 5))
      expect(grid[middle].centroid).toEqual(centerAt(5, 5))
      const around = lattice
        .neighbors(middle)
        .map(({ index }) => grid[index].centroid)
        .sort((a, b) => a.lat - b.lat || a.lng - b.lng)
      const expected = [
        [4, 4],
        [4, 5],
        [4, 6],
        [5, 4],
        [5, 6],
        [6, 4],
        [6, 5],
        [6, 6]
      ].map(([row, col]) => centerAt(row, col))
      expect(around).toEqual(expected)
    })

    it('should agree with pricing on which cell a point is in', () => {
      const grid = makeGrid()
      const lattice = gridLattice(grid)
      towns.forEach((town) => {
        expect(grid[lattice.cellNear(pointOf(town))]).toBe(findCell(pointOf(town), grid))
      })
    })
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
      const crossed = cellPath(line, rules.grid).map((cell) => placeOf(cell.centroid, rules.grid))
      expect(crossed.some(({ row, col }) => isLake(row, col))).toBe(false)
    })

    it('should bridge water narrow enough to bridge', () => {
      // The river runs the whole height of the board: there is no way round
      const line = planLine(board, [pointOf(townNamed('Fir'))], pointOf(townNamed('Dogwood')))

      expect(lineBlock(line, rules, { isFinished: true })).toBeNull()
      const crossed = cellPath(line, rules.grid)
      expect(crossed.some((cell) => isWaterCell(cell))).toBe(true)
      const places = crossed.map((cell) => placeOf(cell.centroid, rules.grid))
      expect(places.some(({ row, col }) => isRiver(row, col))).toBe(true)
    })

    it('should go through the pass rather than over the ridge', () => {
      const line = planLine(board, [pointOf(townNamed('Juniper'))], pointOf(townNamed('Gum')))

      const places = cellPath(line, rules.grid).map((cell) => placeOf(cell.centroid, rules.grid))
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
      const grid = makeGrid().filter((cell) => cell.id.startsWith('0-'))
      const middle = { name: 'Mid', lat: centerAt(0, 3).lat + 0.01, lon: centerAt(0, 3).lng - 0.02 }
      const corridorTowns = [{ ...middle, industries: [] }]
      const corridor = {
        grid,
        isInRegion: regionTest(makeRegion()),
        townCells: townCells(corridorTowns, grid),
        builtLegs: []
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
        expect(isWaterCell(findCell(section.at(-1), rules.grid))).toBe(false)
      }
    })

    it('should build nothing when not even the first step can be paid for', () => {
      const line = planLine(board, [pointOf(townNamed('Alder'))], pointOf(townNamed('Birch')))

      expect(affordableSection(line, 10, rules)).toBeNull()
    })
  })
})
