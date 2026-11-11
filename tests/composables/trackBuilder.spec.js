/**
 * Track Builder Tests
 *
 * The one way track is built, with or without the map: by the player whose
 * turn it is, starting in a town (only a major city, if the game says so) or
 * at the end of their own track, within the build rules, and paid for out of
 * cash and the turn's allowance.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useTrackBuilder } from '@/composables/trackBuilder'
import { startRuleMessage } from '@/composables/startRule'
import { usePlayerStore } from '@/stores/players'
import { useGameStore } from '@/stores/game'
import { useGridStore } from '@/stores/grid'
import { useTownsStore } from '@/stores/towns'
import { useTrackStore } from '@/stores/track'
import { gameRules } from '@/config/game'
import { makeTestGrid, CELL } from '../utils/testGrid'
import { pinPlainScale } from '../utils/boardScale'

/** The center of cell `i` of a row of cells along the equator */
const centerOf = (i) => ({ lat: 0, lng: (i + 0.5) * CELL })
/** A row of six cells along the equator, each costing 1000 */
const grid = makeTestGrid({ rows: 1, cols: 6, south: -CELL / 2, cell: () => ({ landCover: 1000 }) })

const ANN = 1
const BO = 2

describe('useTrackBuilder', () => {
  let builder
  let playerStore
  let trackStore
  let restorePrices

  beforeEach(() => {
    // These tests are about which cells are charged; a cell costs its terrain
    restorePrices = pinPlainScale()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    playerStore = usePlayerStore()
    trackStore = useTrackStore()
    playerStore.addPlayer({ name: 'Ann', color: 'red', cash: 40000 })
    playerStore.addPlayer({ name: 'Bo', color: 'blue', cash: 40000 })
    playerStore.startGame()
    useGridStore().setGrid(grid)
    // A major city at the west end of the row, a small town at the east end
    useTownsStore().setTowns([
      { name: 'Big', msa: 'B', lat: 0, lon: centerOf(0).lng, size: 'large', industries: [] },
      { name: 'Small', msa: 'S', lat: 0, lon: centerOf(5).lng, size: 'small', industries: [] }
    ])
    builder = useTrackBuilder()
  })
  afterEach(() => restorePrices())

  it('should build a section from a major city, charging for each cell', () => {
    const result = builder.buildSection(ANN, [centerOf(0), centerOf(2)])

    expect(result).toMatchObject({ ok: true, cost: 3000 })
    expect(trackStore.segmentsForOwner(ANN)).toHaveLength(1)
    expect(playerStore.players[0].cash).toBe(37000)
    expect(playerStore.trackSpendThisTurn(ANN)).toBe(3000)
  })

  it('should charge the entry fee for a town the section reaches', () => {
    // Ending on the small town at the east end: six cells and its entry fee
    const result = builder.buildSection(ANN, [centerOf(0), centerOf(5)])

    expect(result).toMatchObject({ ok: true, cost: 6000 + gameRules.townEntry.small })
  })

  it('should price a section with its entry fees, as building will charge it', () => {
    expect(builder.priceSection(ANN, [centerOf(0), centerOf(5)])).toEqual({
      total: 6000 + gameRules.townEntry.small,
      bridges: 0,
      entry: gameRules.townEntry.small
    })
  })

  it('should hold back an entry fee from a refund while other track still reaches the town', () => {
    // The first section pays to enter Small; the second reaches it for free
    const first = builder.buildSection(ANN, [centerOf(0), centerOf(5)]).segment
    builder.buildSection(ANN, [centerOf(0), { lat: CELL, lng: 3 * CELL }, centerOf(5)])

    expect(builder.refundFor(first)).toBe(first.cost - gameRules.townEntry.small)
  })

  it('should refund the whole price, entry fee too, when nothing else reaches the town', () => {
    const only = builder.buildSection(ANN, [centerOf(0), centerOf(5)]).segment

    expect(builder.refundFor(only)).toBe(only.cost)
  })

  it("should build on from the end of the player's own track", () => {
    builder.buildSection(ANN, [centerOf(0), centerOf(2)])

    expect(builder.buildSection(ANN, [centerOf(2), centerOf(4)]).ok).toBe(true)
  })

  it("should branch off at a bend in the player's own track", () => {
    builder.buildSection(ANN, [centerOf(0), centerOf(2), { lat: 2 * CELL, lng: 3 * CELL }])

    // Away south from the bend, so the branch is not beside the line
    expect(builder.buildSection(ANN, [centerOf(2), { lat: -2 * CELL, lng: 3 * CELL }]).ok).toBe(
      true
    )
  })

  it('should start a section in a town that is not a major city, when the game allows it', () => {
    expect(builder.buildSection(ANN, [centerOf(5), centerOf(3)]).ok).toBe(true)
  })

  it('should not start a section in a town that is not a major city, when the game says so', () => {
    useGameStore().setGameSettings({ requireMajorCityStart: true })

    expect(builder.buildSection(ANN, [centerOf(5), centerOf(3)])).toEqual({
      ok: false,
      error: startRuleMessage(true)
    })
    expect(trackStore.segments).toEqual([])
  })

  it('should still start a section in a major city when the game says so', () => {
    useGameStore().setGameSettings({ requireMajorCityStart: true })

    expect(builder.buildSection(ANN, [centerOf(0), centerOf(2)]).ok).toBe(true)
  })

  it('should not start a section away from any town or track of their own', () => {
    expect(builder.buildSection(ANN, [centerOf(2), centerOf(4)])).toEqual({
      ok: false,
      error: startRuleMessage(false)
    })
  })

  it("should not start a section at the end of another player's track", () => {
    trackStore.addSegment({ ownerId: BO, coordinates: [centerOf(0), centerOf(2)] })

    expect(builder.buildSection(ANN, [centerOf(2), centerOf(4)]).error).toBe(
      startRuleMessage(false)
    )
  })

  it("should not build on another player's turn", () => {
    expect(builder.buildSection(BO, [centerOf(0), centerOf(2)]).ok).toBe(false)
  })

  it('should not build once the game is over', () => {
    useGameStore().declareWinner(BO)

    expect(builder.buildSection(ANN, [centerOf(0), centerOf(2)])).toEqual({
      ok: false,
      error: 'The game is over.'
    })
  })

  it('should not build before the grid is there to price it', () => {
    useGridStore().reset()

    expect(builder.buildSection(ANN, [centerOf(0), centerOf(2)]).ok).toBe(false)
  })

  it('should not build more than is left to spend this turn', () => {
    playerStore.spendOnTrack(ANN, gameRules.trackBudgetPerTurn - 2000)

    const result = builder.buildSection(ANN, [centerOf(0), centerOf(2)])

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/costs \$3,000/)
    expect(trackStore.segments).toEqual([])
  })

  it('should not build a section that breaks a build rule', () => {
    // Back along a line already built, rather than across it
    builder.buildSection(ANN, [centerOf(0), centerOf(4)])

    const result = builder.buildSection(ANN, [centerOf(4), centerOf(1)])

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/alongside/)
  })

  it('should check and price a long line on a big grid quickly', () => {
    // A state-sized grid: 60 rows of 60 cells, centered on whole multiples
    // of a cell. Checking a line looks up the cell under every point along
    // it, which once went through the store's reactive wrappers and took most
    // of a second here.
    const bigGrid = makeTestGrid({
      rows: 60,
      cols: 60,
      south: -CELL / 2,
      west: -CELL / 2,
      cell: () => ({ landCover: 10 })
    })
    useGridStore().setGrid(bigGrid)
    useTownsStore().setTowns([
      { name: 'Big', msa: 'B', lat: 0, lon: 0, size: 'large', industries: [] }
    ])
    // A zigzag 40 cells long, to the north
    const line = Array.from({ length: 41 }, (_, i) => ({ lat: i * CELL, lng: (i % 2) * CELL }))

    const started = performance.now()
    const result = builder.buildSection(ANN, line)

    expect(result.ok).toBe(true)
    expect(performance.now() - started).toBeLessThan(250)
  })

  it('should not count a section that could not be recorded as building started', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(trackStore, 'addSegment').mockReturnValue(null)

    const result = builder.buildSection(ANN, [centerOf(0), centerOf(2)])

    expect(result.ok).toBe(false)
    expect(playerStore.players[0].cash).toBe(40000)
    expect(playerStore.hasSpentThisTurn(ANN)).toBe(false)
  })

  describe('startPoints', () => {
    it("should be every town and the points of the player's own track", () => {
      trackStore.addSegment({ ownerId: ANN, coordinates: [centerOf(2), centerOf(3)] })
      trackStore.addSegment({ ownerId: BO, coordinates: [centerOf(1), centerOf(4)] })

      expect(builder.startPoints(ANN)).toEqual([centerOf(0), centerOf(5), centerOf(2), centerOf(3)])
    })

    it("should be the major cities and the points of the player's own track when the game says so", () => {
      useGameStore().setGameSettings({ requireMajorCityStart: true })
      trackStore.addSegment({ ownerId: ANN, coordinates: [centerOf(2), centerOf(3)] })
      trackStore.addSegment({ ownerId: BO, coordinates: [centerOf(1), centerOf(4)] })

      expect(builder.startPoints(ANN)).toEqual([centerOf(0), centerOf(2), centerOf(3)])
    })
  })

  describe('fitLine', () => {
    /** A line out along the row from the major city, one vertex per cell: $5000 */
    const line = [centerOf(0), centerOf(1), centerOf(2), centerOf(3), centerOf(4)]

    it('should leave a line the player can pay for whole', () => {
      expect(builder.fitLine(ANN, line)).toEqual({
        points: line,
        isCut: false,
        limit: null,
        available: 20000,
        toLand: false
      })
    })

    it('should cut a line back to the last vertex the cash covers, and blame the cash', () => {
      // Two cells cost 2000, three cost 3000
      playerStore.updatePlayer(ANN, { cash: 2500 })

      expect(builder.fitLine(ANN, line)).toEqual({
        points: [centerOf(0), centerOf(1)],
        isCut: true,
        limit: 'cash',
        available: 2500,
        toLand: false
      })
    })

    it('should blame the allowance when that runs out before the cash', () => {
      playerStore.spendOnTrack(ANN, gameRules.trackBudgetPerTurn - 2500)

      expect(builder.fitLine(ANN, line)).toMatchObject({
        points: [centerOf(0), centerOf(1)],
        limit: 'allowance'
      })
    })

    it('should give nothing to build when not even the first leg is affordable', () => {
      playerStore.updatePlayer(ANN, { cash: 1500 })

      expect(builder.fitLine(ANN, line)).toMatchObject({ points: null, limit: 'cash' })
    })

    /** Land, land, water, land: a line may not end out on the water */
    const setWaterGrid = () =>
      useGridStore().setGrid(
        makeTestGrid({
          rows: 1,
          cols: 4,
          south: -CELL / 2,
          cell: (row, col) => (col === 2 ? { water: true } : { landCover: 1000 })
        })
      )

    it('should cut a line that ends on the water back to land, though it is affordable', () => {
      setWaterGrid()

      expect(builder.fitLine(ANN, [centerOf(0), centerOf(1), centerOf(2)])).toMatchObject({
        points: [centerOf(0), centerOf(1)],
        isCut: true,
        limit: null,
        toLand: true
      })
    })

    it('should cut back past an affordable vertex on water to the last one on land', () => {
      setWaterGrid()
      const overWater = [centerOf(0), centerOf(1), centerOf(2), centerOf(3)]
      const bridge = gameRules.bridges.perSpeedUnit
      // Enough to reach the water, not to cross it
      playerStore.updatePlayer(ANN, { cash: 2500 + bridge })

      expect(builder.fitLine(ANN, overWater)).toMatchObject({
        points: [centerOf(0), centerOf(1)],
        toLand: true
      })
    })
  })
})
