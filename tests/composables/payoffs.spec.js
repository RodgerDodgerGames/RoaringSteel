/**
 * Payoff Tests
 *
 * A demand pays by what the track to bring its commodity in would cost: a
 * straight line from the producing town whose line is cheapest, priced cell
 * by cell over the grid as track is, times gameRules.payoffs.trackCostMultiple,
 * times a long-haul bonus that grows exponentially with the haul's share of
 * the map's span, rounded, and never under the minimum.
 *
 * Water on the line is bridged where a bridge could span it; a stretch too
 * long to bridge adds a share of a bridge for each cell past what a bridge
 * could span, for the detour round it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  mapSpanKm,
  longHaulMultiplier,
  waterStretchPrice,
  haulPricer,
  routeRatios,
  blendedPricer,
  deckPricer,
  cheapestHaul,
  demandPayoff
} from '@/composables/payoffs'
import { gameRules } from '@/config/game'
import { riverIndex } from '@/composables/map/water'
import { regionTest } from '@/composables/map/region'
import { pricingBoard } from '@/composables/map/buildRules'
import { makeTestGrid, CELL, CELL_METERS } from '../utils/testGrid'
import { pinKnobs } from '../utils/boardScale'

// Along one meridian a degree of latitude is about 111.2 km, so towns placed
// on it sit a known distance apart
const KM_PER_DEGREE = 111.19

/** The test grids' cells' width, in km: also the speed unit priced at here */
const CELL_KM = CELL_METERS / 1000

/**
 * A single row of square cells running east along latitude 0, where a degree
 * of longitude is as long as a degree of latitude. Each entry says what one
 * cell is, west to east: a number is level ground of that land cover cost,
 * 'W' is lake or sea, null is a hole (terrain that did not load), and an
 * object is given to the cell as it is.
 * @param {Array<number|string|null|Object>} cells - The cells, west to east
 * @returns {Object} The grid
 */
function rowOf(cells) {
  return makeTestGrid({
    rows: 1,
    cols: cells.length,
    south: -CELL / 2,
    cell: (row, col) => {
      const cell = cells[col]
      if (cell === null) return null
      if (cell === 'W') return { water: true }
      return typeof cell === 'number' ? { landCover: cell } : cell
    }
  })
}

/**
 * A town in the middle of a cell of `rowOf`.
 * @param {string} name - Its name
 * @param {number} i - Which cell it is in, counting from the west
 * @param {Array<string>} [industries] - What it produces
 * @returns {Object} The town
 */
const townAt = (name, i, industries = []) => ({
  name,
  lat: 0,
  lon: (i + 0.5) * CELL,
  industries: industries.map((industryName) => ({ name: industryName }))
})

/**
 * What hauls are priced against (see `haulPrice`): a grid, a price scale of
 * 1 so a level cell costs its land cover (with the knobs pinned at 1), and
 * a speed unit one cell wide, so a water cell's bridge costs exactly the
 * bridge rate per speed unit and a bridge may span `maxSpeedUnits` cells.
 * @param {Object} grid - The grid
 * @param {Object} [extra] - Rivers or town cells to add
 * @returns {Object} The board
 */
const board = (grid, extra = {}) => ({ grid, priceScale: 1, speedUnitKm: CELL_KM, ...extra })

/**
 * What one haul costs on a board, priced afresh (see `haulPricer`).
 * @param {Object} from - The town hauled from
 * @param {Object} to - The town hauled to
 * @param {Object} onBoard - The board (see `board`)
 * @returns {number} Dollars
 */
const haulPrice = (from, to, onBoard) => haulPricer(onBoard)(from, to)

/** One water cell's bridge, on the test boards */
const BRIDGE = gameRules.bridges.perSpeedUnit
/** The most water cells a bridge may span, on the test boards */
const MAX_BRIDGE_CELLS = gameRules.bridges.maxSpeedUnits

describe('payoffs', () => {
  // The bonus, the multiple, the water share and the track knobs are tuning
  // settings, so pin them for these tests: they check the rule's shape, not
  // today's tuning
  const { trackCostMultiple, unbridgeableWater } = gameRules.payoffs
  const longHaul = { ...gameRules.payoffs.longHaul }
  let restoreKnobs
  beforeEach(() => {
    Object.assign(gameRules.payoffs.longHaul, { maxBonus: 1, steepness: 2 })
    Object.assign(gameRules.payoffs, { trackCostMultiple: 2, unbridgeableWater: 0.5 })
    restoreKnobs = pinKnobs(1)
  })
  afterEach(() => {
    Object.assign(gameRules.payoffs.longHaul, longHaul)
    Object.assign(gameRules.payoffs, { trackCostMultiple, unbridgeableWater })
    restoreKnobs()
  })

  describe('mapSpanKm', () => {
    const town = (name, lat) => ({ name, lat, lon: -105, industries: [] })

    it('should measure between the two towns furthest apart', () => {
      // Greeley is 1 degree north of Denver and Pueblo 2 degrees south
      const towns = [town('Denver', 39.7), town('Greeley', 40.7), town('Pueblo', 37.7)]

      expect(mapSpanKm(towns)).toBeCloseTo(3 * KM_PER_DEGREE, 0)
    })

    it('should be 0 with fewer than two towns', () => {
      expect(mapSpanKm([town('Denver', 39.7)])).toBe(0)
      expect(mapSpanKm([])).toBe(0)
    })
  })

  describe('longHaulMultiplier', () => {
    const span = 1000

    it('should add nothing to a haul of no length', () => {
      expect(longHaulMultiplier(0, span)).toBe(1)
    })

    it('should give the full bonus to a haul across the whole map', () => {
      expect(longHaulMultiplier(span, span)).toBeCloseTo(2, 10)
    })

    it('should hold most of the bonus back for the longest hauls', () => {
      // The exponential shape: a half-map haul earns well under half the bonus
      expect(longHaulMultiplier(span / 2, span)).toBeGreaterThan(1)
      expect(longHaulMultiplier(span / 2, span)).toBeLessThan(1.5)
    })

    it('should climb faster the longer the haul', () => {
      // Each further quarter of the map adds more bonus than the one before
      const quarters = [0, 1, 2, 3, 4].map((q) => longHaulMultiplier((q * span) / 4, span))
      const steps = quarters.slice(1).map((value, i) => value - quarters[i])

      steps.slice(1).forEach((step, i) => expect(step).toBeGreaterThan(steps[i]))
    })

    it('should hold more back for the longest hauls when steeper', () => {
      const gentle = longHaulMultiplier(span / 2, span)
      gameRules.payoffs.longHaul.steepness = 4

      expect(longHaulMultiplier(span / 2, span)).toBeLessThan(gentle)
      expect(longHaulMultiplier(span, span)).toBeCloseTo(2, 10)
    })

    it('should grow in a straight line at a steepness of 0', () => {
      gameRules.payoffs.longHaul.steepness = 0

      expect(longHaulMultiplier(span / 4, span)).toBeCloseTo(1.25, 10)
      expect(longHaulMultiplier(span, span)).toBe(2)
    })

    it('should meet the straight line smoothly as steepness shrinks toward 0', () => {
      gameRules.payoffs.longHaul.steepness = 1e-6

      expect(longHaulMultiplier(span / 4, span)).toBeCloseTo(1.25, 5)
    })

    it('should use the straight line for a negative steepness', () => {
      gameRules.payoffs.longHaul.steepness = -2

      expect(longHaulMultiplier(span / 4, span)).toBeCloseTo(1.25, 10)
    })

    it('should not pay past the full bonus for a haul longer than the span', () => {
      expect(longHaulMultiplier(2 * span, span)).toBeCloseTo(2, 10)
    })

    it('should scale with the configured bonus', () => {
      gameRules.payoffs.longHaul.maxBonus = 2

      expect(longHaulMultiplier(span, span)).toBeCloseTo(3, 10)
    })

    it('should add nothing when the bonus is turned off', () => {
      gameRules.payoffs.longHaul.maxBonus = 0

      expect(longHaulMultiplier(span, span)).toBe(1)
    })

    it('should add nothing on a map with no span', () => {
      expect(longHaulMultiplier(0, 0)).toBe(1)
    })
  })

  describe('waterStretchPrice', () => {
    it('should bridge every cell of a stretch a bridge can span', () => {
      expect(waterStretchPrice(3, 2000, 3)).toBe(6000)
    })

    it('should add half a bridge for each cell past what a bridge can span', () => {
      // Three cells bridged, then two more at half a bridge each
      expect(waterStretchPrice(5, 2000, 3)).toBe(3 * 2000 + 2 * 1000)
    })

    it('should add the configured share of a bridge past what a bridge can span', () => {
      gameRules.payoffs.unbridgeableWater = 0.25

      expect(waterStretchPrice(5, 2000, 3)).toBe(3 * 2000 + 2 * 500)
    })

    it('should add nothing for no water', () => {
      expect(waterStretchPrice(0, 2000, 3)).toBe(0)
    })
  })

  describe('haulPrice', () => {
    it('should add up every cell the straight line passes through, both towns included', () => {
      const grid = rowOf([100, 200, 300, 400])

      expect(haulPrice(townAt('A', 0), townAt('B', 3), board(grid))).toBe(1000)
    })

    it('should cost more over rough ground than over ordinary ground the same distance', () => {
      const flat = rowOf([100, 100, 100])
      // The middle cell's ground is as broken as a 10% grade
      const hilly = rowOf([100, { landCover: 100, roughness: 0.1 }, 100])

      expect(haulPrice(townAt('A', 0), townAt('B', 2), board(hilly))).toBeGreaterThan(
        haulPrice(townAt('A', 0), townAt('B', 2), board(flat))
      )
    })

    it('should charge the climb along the line, as track pricing does', () => {
      // 600 m over one 10 km cell is a 6% grade, two ordinary cells past the
      // ruling grade, charged in the cell it climbs into
      const grid = makeTestGrid({
        rows: 1,
        cols: 3,
        south: -CELL / 2,
        cell: (row, col) => ({ landCover: 100, elevation: col === 0 ? 0 : 600 })
      })

      expect(haulPrice(townAt('A', 0), townAt('B', 2), board(grid))).toBe(
        300 + 2 * gameRules.trackPrice.openGroundCost
      )
    })

    it('should bridge a stretch of water short enough to bridge', () => {
      const water = Array(MAX_BRIDGE_CELLS).fill('W')
      const grid = rowOf([100, ...water, 100])

      expect(haulPrice(townAt('A', 0), townAt('B', water.length + 1), board(grid))).toBe(
        200 + MAX_BRIDGE_CELLS * BRIDGE
      )
    })

    it('should add half a bridge for each cell of water past what a bridge can span', () => {
      const water = Array(MAX_BRIDGE_CELLS + 2).fill('W')
      const grid = rowOf([100, ...water, 100])

      expect(haulPrice(townAt('A', 0), townAt('B', water.length + 1), board(grid))).toBe(
        200 + MAX_BRIDGE_CELLS * BRIDGE + 2 * (BRIDGE / 2)
      )
    })

    it('should price each stretch of water on its own', () => {
      // Two short stretches, each bridgeable, together longer than a bridge
      const grid = rowOf([100, 'W', 'W', 100, 'W', 'W', 100])

      expect(haulPrice(townAt('A', 0), townAt('B', 6), board(grid))).toBe(300 + 4 * BRIDGE)
    })

    it("should end a stretch of water at a town's cell, still bridging the cell", () => {
      // Five water cells in a row, a town on the middle one
      const grid = rowOf([100, 'W', 'W', 'W', 'W', 'W', 100])
      const from = townAt('A', 0)
      const to = townAt('B', 6)

      // Without the town: one stretch, two cells past what a bridge spans
      expect(haulPrice(from, to, board(grid))).toBe(200 + 3 * BRIDGE + 2 * (BRIDGE / 2))
      // With it: two stretches of two, each bridged, and the town's cell bridged too
      expect(haulPrice(from, to, board(grid, { townCells: [3] }))).toBe(200 + 5 * BRIDGE)
    })

    it('should charge ordinary ground for a cell whose terrain did not load', () => {
      const ordinary = gameRules.trackPrice.openGroundCost
      const withHole = rowOf([100, null, 100])
      const withNoRoughness = rowOf([100, { landCover: 300, roughness: NaN }, 100])

      expect(haulPrice(townAt('A', 0), townAt('B', 2), board(withHole))).toBe(200 + ordinary)
      expect(haulPrice(townAt('A', 0), townAt('B', 2), board(withNoRoughness))).toBe(200 + ordinary)
    })

    it('should add a river bridge for each river the line crosses', () => {
      const grid = rowOf([100, 100, 100])
      // A river running north to south through the middle cell
      const rivers = riverIndex(grid, [
        [
          [1.5 * CELL, -CELL],
          [1.5 * CELL, CELL]
        ]
      ])

      expect(haulPrice(townAt('A', 0), townAt('B', 2), board(grid, { rivers }))).toBe(
        300 + gameRules.bridges.riverCrossing
      )
    })
  })

  describe('routeRatios', () => {
    /** A town in the middle of a cell of a grid whose corner is at 0, 0 */
    const townIn = (name, row, col) => ({
      name,
      lat: (row + 0.5) * CELL,
      lon: (col + 0.5) * CELL,
      industries: []
    })
    /** A board to search routes on: no region, so everywhere is inside */
    const searchable = (grid) => ({ ...board(grid), townCells: [], isInRegion: regionTest(null) })
    const west = townIn('West', 2, 0)
    const east = townIn('East', 2, 6)

    it('should find a route round a ridge cheaper than the straight line over it', () => {
      // A ridge 1,500 m high down the middle column, with a pass at its
      // south end: the straight line between the towns climbs over it
      const grid = makeTestGrid({
        rows: 5,
        cols: 7,
        cell: (row, col) => ({ landCover: 100, elevation: col === 3 && row > 0 ? 1500 : 0 })
      })

      const ratio = routeRatios(searchable(grid), [west, east])(west, east)

      expect(ratio).toBeGreaterThan(0)
      expect(ratio).toBeLessThan(0.5)
    })

    it('should find no saving on level open ground', () => {
      const grid = makeTestGrid({ rows: 5, cols: 7, cell: () => ({ landCover: 100 }) })

      expect(routeRatios(searchable(grid), [west, east])(west, east)).toBe(1)
    })

    it('should never make a route dearer than the straight line', () => {
      // The region has a hole in its middle the straight line runs across,
      // so the route has to go round it, the long way
      const C = CELL
      const ringAround = {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [7 * C, 0],
              [7 * C, 5 * C],
              [0, 5 * C],
              [0, 0]
            ],
            [
              [1 * C, 1 * C],
              [6 * C, 1 * C],
              [6 * C, 4 * C],
              [1 * C, 4 * C],
              [1 * C, 1 * C]
            ]
          ]
        }
      }
      const grid = makeTestGrid({ rows: 5, cols: 7, cell: () => ({ landCover: 100 }) })
      const ringBoard = { ...board(grid), townCells: [], isInRegion: regionTest(ringAround) }

      expect(routeRatios(ringBoard, [west, east])(west, east)).toBe(1)
    })

    it('should find no saving where no route can be built', () => {
      // A lake too wide to bridge right across the board
      const grid = makeTestGrid({
        rows: 5,
        cols: 7,
        cell: (row, col) => (col >= 1 && col <= 5 ? { water: true } : { landCover: 100 })
      })

      expect(routeRatios(searchable(grid), [west, east])(west, east)).toBe(1)
    })
  })

  describe('blendedPricer', () => {
    const straightOf = () => 1000
    const ratioOf = () => 0.25

    it('should price the straight line at a weight of 0, without looking for a route', () => {
      let looked = false
      const priceOf = blendedPricer(straightOf, () => (looked = true), 0)

      expect(priceOf({}, {})).toBe(1000)
      expect(looked).toBe(false)
    })

    it('should price the route at a weight of 1', () => {
      expect(blendedPricer(straightOf, ratioOf, 1)({}, {})).toBe(250)
    })

    it('should go the same share of the way toward the route in between', () => {
      // Half way, on a scale of ratios: a quarter becomes a half
      expect(blendedPricer(straightOf, ratioOf, 0.5)({}, {})).toBe(500)
    })
  })

  describe('deckPricer', () => {
    const townIn = (name, row, col) => ({
      name,
      lat: (row + 0.5) * CELL,
      lon: (col + 0.5) * CELL,
      industries: []
    })
    const west = townIn('West', 2, 0)
    const east = townIn('East', 2, 6)
    const towns = [west, east]
    // A ridge with a pass at its south end, as for `routeRatios`
    const grid = makeTestGrid({
      rows: 5,
      cols: 7,
      cell: (row, col) => ({ landCover: 100, elevation: col === 3 && row > 0 ? 1500 : 0 })
    })
    const setup = { grid, speedUnitKm: CELL_KM, waterData: null, towns, region: null }
    // Priced in each test, once the knobs are pinned
    const straightPrice = () => haulPricer(pricingBoard(grid, CELL_KM, null, towns))(west, east)
    const { route } = gameRules.payoffs
    const tunedRoute = { ...route }
    afterEach(() => Object.assign(route, tunedRoute))

    it('should price the straight line at a route weight of 0', () => {
      route.weight = 0

      expect(deckPricer(setup)(west, east)).toBe(straightPrice())
    })

    it('should bring the price toward the route round the ridge at a weight above 0', () => {
      route.weight = 0.5
      const halfWay = deckPricer(setup)(west, east)
      route.weight = 1
      const allTheWay = deckPricer(setup)(west, east)

      expect(halfWay).toBeLessThan(straightPrice())
      expect(allTheWay).toBeLessThan(halfWay)
    })
  })

  describe('cheapestHaul', () => {
    // A mountain just west of the destination, and plains to its east
    const grid = rowOf([100, 100, 100, 5000, 100, 100, 100, 100, 100])
    const destination = townAt('Destination', 4)
    const nearOverMountain = townAt('Near', 2, ['Coal'])
    const farOverPlains = townAt('Far', 8, ['Coal'])
    const towns = [destination, nearOverMountain, farOverPlains]

    it('should take the producer cheapest to build from, not the nearest', () => {
      const haul = cheapestHaul(destination, 'Coal', towns, haulPricer(board(grid)))

      // Cells 4 to 8, all plains
      expect(haul.price).toBe(500)
      expect(haul.km).toBeCloseTo(4 * CELL_KM, 0)
    })

    it('should take the nearest producer when the ground is the same', () => {
      const plains = rowOf(Array(9).fill(100))

      expect(cheapestHaul(destination, 'Coal', towns, haulPricer(board(plains))).price).toBe(300)
    })

    it('should not count the destination itself as a producer', () => {
      const coalTown = townAt('Coal Town', 4, ['Coal'])

      expect(
        cheapestHaul(coalTown, 'Coal', [coalTown, farOverPlains], haulPricer(board(grid))).price
      ).toBe(500)
    })

    it('should give null when no other town produces the commodity', () => {
      expect(cheapestHaul(destination, 'Wine', towns, haulPricer(board(grid)))).toBeNull()
    })
  })

  describe('demandPayoff', () => {
    // Ground at 1,000 a cell, so prices come out in whole thousands
    const flat = rowOf(Array(6).fill(1000))
    const destination = townAt('Destination', 0)
    const producer = townAt('Producer', 4, ['Coal'])
    const towns = [destination, producer]
    // The one haul is the whole map, so it gets the full bonus: twice over
    const spanKm = mapSpanKm(towns)
    const payoffOn = (grid) =>
      demandPayoff(destination, 'Coal', towns, { spanKm, priceOf: haulPricer(board(grid)) })

    it("should pay the haul's track price times the multiple, with no bonus", () => {
      gameRules.payoffs.longHaul.maxBonus = 0

      // Five cells at 1,000, paid twice over
      expect(payoffOn(flat)).toBe(10000)
    })

    it('should pay the full bonus for a haul across the whole map', () => {
      // 5,000 of track, times the multiple of 2, times the bonus of 2
      expect(payoffOn(flat)).toBe(20000)
    })

    it('should pay more for a haul over rough ground than over ordinary ground', () => {
      // One cell twice as dear (under the terrain cap): 6,000 of track, paid
      // four times over
      expect(payoffOn(rowOf([1000, 1000, 2000, 1000, 1000, 1000]))).toBe(24000)
    })

    it('should pay for the bridges a haul over water needs', () => {
      // Three cells of land and two of water: 3,000 of track and two bridges
      const bay = rowOf([1000, 'W', 'W', 1000, 1000, 1000])

      expect(payoffOn(bay)).toBe(4 * (3000 + 2 * BRIDGE))
    })

    it('should never pay less than the minimum, however cheap the haul', () => {
      expect(payoffOn(rowOf([1, 1, 1, 1, 1, 1]))).toBe(gameRules.payoffs.minimum)
    })

    it('should pay the minimum when nothing else produces the commodity', () => {
      expect(
        demandPayoff(destination, 'Wine', towns, { spanKm, priceOf: haulPricer(board(flat)) })
      ).toBe(gameRules.payoffs.minimum)
    })
  })
})
