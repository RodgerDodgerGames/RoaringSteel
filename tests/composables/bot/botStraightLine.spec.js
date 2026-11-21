/**
 * Bot Straight Line Tests
 *
 * The Fast Bot's way of laying out track: straight to the town, on the same
 * made-up state the Standard bot's search is tested on (see
 * tests/utils/botBoard.js). A straight line it offers must keep to the build
 * rules; where none does, it must fall back to the search, and say why.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { lineBlock, townCells, builtLegs, trackIndex } from '@/composables/map/buildRules'
import { regionTest } from '@/composables/map/region'
import { riverIndex } from '@/composables/map/water'
import { linePrice, kmBetween, cellPath } from '@/composables/map/trackCost'
import { cellKm, rowOf, colOf } from '@/composables/map/cellGrid'
import { townsByCell, searchBoard } from '@/composables/bot/botPathfinder'
import { straightLine, nearestPoint, straightRouter } from '@/composables/bot/botStraightLine'
import {
  makeGrid,
  makeRegion,
  makeTowns,
  makeRivers,
  centerAt,
  isLake,
  seededRandom,
  ROWS,
  COLS
} from '../../utils/botBoard'
import { pinKnobs } from '../../utils/boardScale'
import { CELL_METERS } from '../../utils/testGrid'

const towns = makeTowns()
const townNamed = (name) => towns.find((town) => town.name === name)
const pointOf = (town) => ({ lat: town.lat, lng: town.lon })

/** The build rules for the test board, with some track already built */
function rulesWith(segments = []) {
  const grid = makeGrid()
  return {
    grid,
    priceScale: 1,
    // One cell: the lake, four cells across, is too wide to bridge
    speedUnitKm: CELL_METERS / 1000,
    rivers: riverIndex(grid, makeRivers()),
    isInRegion: regionTest(makeRegion()),
    townCells: townCells(towns, grid),
    builtTrack: trackIndex(builtLegs(segments))
  }
}

/**
 * How far a point is off the straight line between two others, in km: the
 * line is drawn on lat/lng, so the point is measured against the place on
 * the line at the same share of the way along.
 */
function kmOffLine(point, from, to) {
  const along =
    Math.abs(to.lng - from.lng) > Math.abs(to.lat - from.lat)
      ? (point.lng - from.lng) / (to.lng - from.lng)
      : (point.lat - from.lat) / (to.lat - from.lat)
  const onLine = {
    lat: from.lat + (to.lat - from.lat) * along,
    lng: from.lng + (to.lng - from.lng) * along
  }
  return kmBetween(point, onLine)
}

describe('botStraightLine', () => {
  let rules
  let restoreKnobs

  beforeEach(() => {
    // The knobs at 1, so a cell costs its terrain cost at a price scale of 1
    restoreKnobs = pinKnobs(1)
    rules = rulesWith()
  })
  afterEach(() => restoreKnobs())

  describe('straightLine', () => {
    it('should run straight from one point to the other, a point at most a cell apart', () => {
      const from = centerAt(2, 1)
      const to = centerAt(17, 24)

      const line = straightLine(from, to, rules.grid)

      expect(line[0]).toEqual(from)
      expect(line.at(-1)).toEqual(to)
      line.forEach((point) => expect(kmOffLine(point, from, to)).toBeLessThan(0.001))
      line.slice(1).forEach((point, i) => {
        expect(kmBetween(line[i], point)).toBeLessThanOrEqual(cellKm(rules.grid) + 1e-9)
      })
    })

    it('should go through a town whose cell it passes through, once', () => {
      // Along row 9, through Elm's cell at column 10
      const elm = pointOf(townNamed('Elm'))

      const line = straightLine(
        centerAt(9, 8),
        centerAt(9, 13),
        rules.grid,
        townsByCell(towns, rules.grid)
      )

      expect(line.filter((point) => point.lat === elm.lat && point.lng === elm.lng)).toHaveLength(1)
    })

    it('should go through every town whose cell it crosses, however little, in order', () => {
      const townIn = townsByCell(towns, rules.grid)
      const random = seededRandom(3)
      const anywhere = () => centerAt(random() * (ROWS - 1), random() * (COLS - 1))
      for (let i = 0; i < 60; i++) {
        const from = anywhere()
        const to = anywhere()

        const line = straightLine(from, to, rules.grid, townIn)

        const ends = [cellPath([from], rules.grid)[0], cellPath([to], rules.grid)[0]]
        cellPath([from, to], rules.grid)
          .filter((cell) => townIn.has(cell) && !ends.includes(cell))
          .map((cell) => townIn.get(cell))
          // A town square to the line beyond one of its ends is left out
          .filter((town) => {
            const along =
              ((town.lat - from.lat) * (to.lat - from.lat) +
                (town.lng - from.lng) * (to.lng - from.lng)) /
              ((to.lat - from.lat) ** 2 + (to.lng - from.lng) ** 2)
            return along > 0 && along < 1
          })
          .forEach((town) => expect(line).toContainEqual(town))
        // Never doubling back: each point is further from the start
        line.slice(1).forEach((point, j) => {
          expect(kmBetween(from, point)).toBeGreaterThan(kmBetween(from, line[j]))
        })
      }
    })

    it('should leave the towns it starts and ends in where they are', () => {
      const alder = pointOf(townNamed('Alder'))
      const juniper = pointOf(townNamed('Juniper'))

      const line = straightLine(alder, juniper, rules.grid, townsByCell(towns, rules.grid))

      expect(line[0]).toEqual(alder)
      expect(line.at(-1)).toEqual(juniper)
      expect(
        line.filter((point) => point.lat === alder.lat && point.lng === alder.lng)
      ).toHaveLength(1)
    })

    it('should give no line from a point to itself', () => {
      expect(straightLine(centerAt(3, 3), centerAt(3, 3), rules.grid)).toBeNull()
    })
  })

  describe('nearestPoint', () => {
    it('should pick the point nearest the target', () => {
      const near = centerAt(5, 14)

      expect(nearestPoint([centerAt(1, 1), near, centerAt(18, 2)], centerAt(6, 15))).toEqual(near)
    })

    it('should give none from no points', () => {
      expect(nearestPoint([], centerAt(6, 15))).toBeNull()
    })
  })

  describe('straightRouter', () => {
    const price = (points) => linePrice(points, rules).total
    /** A router from some starting places, with the search's board on hand */
    const routerFrom = (sources, options = {}) =>
      straightRouter({
        rules,
        sources,
        townIn: townsByCell(towns, rules.grid),
        price,
        board: () => searchBoard(rules, towns),
        ...options
      })

    it('should build straight where it can, at the price of that very line', () => {
      const board = vi.fn()
      const router = routerFrom([pointOf(townNamed('Alder'))], { board })
      const juniper = pointOf(townNamed('Juniper'))

      const { line, route, blocked } = router.lineTo(juniper)

      expect(route).toBe('straight')
      expect(blocked).toBeNull()
      expect(lineBlock(line, rules, { isFinished: true })).toBeNull()
      expect(router.costTo(juniper)).toBe(price(line))
      // No straight line broke a rule, so the search was never needed
      expect(board).not.toHaveBeenCalled()
    })

    it('should start from the starting place nearest the town', () => {
      const near = centerAt(5, 13)
      const gum = pointOf(townNamed('Gum'))

      const { line } = routerFrom([centerAt(1, 1), near]).lineTo(gum)

      expect(line[0]).toEqual(near)
      expect(line.at(-1)).toEqual(gum)
    })

    it('should fall back to the search where the straight line breaks a rule', () => {
      // Ivy sits west of the lake and Elm east of it, in line with it
      const router = routerFrom([pointOf(townNamed('Ivy'))])
      const elm = pointOf(townNamed('Elm'))

      const { line, route, blocked } = router.lineTo(elm)

      expect(route).toBe('search')
      expect(blocked).toBe('water')
      expect(lineBlock(line, rules, { isFinished: true })).toBeNull()
      // The search went round the lake
      const crossed = cellPath(line, rules.grid)
      expect(crossed.some((cell) => isLake(rowOf(rules.grid, cell), colOf(rules.grid, cell)))).toBe(
        false
      )
    })

    it('should weigh a town by its straight line, even one that breaks a rule', () => {
      const ivy = pointOf(townNamed('Ivy'))
      const elm = pointOf(townNamed('Elm'))

      const straight = straightLine(ivy, elm, rules.grid, townsByCell(towns, rules.grid))

      expect(routerFrom([ivy]).costTo(elm)).toBe(price(straight))
    })

    it('should cost nothing to reach where it builds from, and be out of reach with nowhere', () => {
      const alder = pointOf(townNamed('Alder'))

      expect(routerFrom([alder]).costTo(alder)).toBe(0)
      expect(routerFrom([]).costTo(alder)).toBe(Infinity)
      expect(routerFrom([]).lineTo(alder)).toEqual({ line: null, route: null, blocked: null })
    })

    it('should find no line to a town no track can reach', () => {
      // Kauri is out in the notch, beyond the region's land
      const router = routerFrom([pointOf(townNamed('Cedar'))])

      expect(router.lineTo(pointOf(townNamed('Kauri')))).toEqual({
        line: null,
        route: null,
        blocked: 'outside'
      })
    })

    it('should work each point out once, however often it is asked about', () => {
      const counted = vi.fn(price)
      const router = routerFrom([pointOf(townNamed('Alder'))], { price: counted })
      const juniper = pointOf(townNamed('Juniper'))

      router.costTo(juniper)
      router.costTo(juniper)

      expect(counted).toHaveBeenCalledTimes(1)
      expect(router.lineTo(juniper)).toBe(router.lineTo(juniper))
    })
  })
})
