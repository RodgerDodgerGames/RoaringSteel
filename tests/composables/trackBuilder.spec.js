/**
 * Track Builder Tests
 *
 * The one way track is built, with or without the map: by the player whose
 * turn it is, starting in a town (only a major city, if the game says so) or
 * at the end of their own track, within the build rules, and paid for out of
 * cash and the turn's allowance. With the game setting on, a town full to
 * the player can be neither started in nor built into.
 *
 * Track built this turn can be torn up again, one leg at a time from the
 * far end of a line, for what each leg added to the line's price.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useTrackBuilder } from '@/composables/trackBuilder'
import { startRuleMessage } from '@/composables/startRule'
import { townFullMessage } from '@/composables/townLimits'
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

  it('should charge only the track for a section that reaches a town', () => {
    // Ending on the small town at the east end: six cells, and nothing more
    // for the town (there is no entry fee)
    const result = builder.buildSection(ANN, [centerOf(0), centerOf(5)])

    expect(result).toMatchObject({ ok: true, cost: 6000 })
  })

  it('should price a section as building will charge it', () => {
    expect(builder.priceSection([centerOf(0), centerOf(5)])).toEqual({ total: 6000, bridges: 0 })
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

  it("should branch off part way along a leg of the player's own track", () => {
    // One straight leg, and a branch from the middle of it, away south
    builder.buildSection(ANN, [centerOf(0), centerOf(4)])
    const middle = centerOf(2)

    expect(builder.buildSection(ANN, [middle, { lat: -2 * CELL, lng: middle.lng }]).ok).toBe(true)
  })

  describe('keeping away from track already built', () => {
    /**
     * Out of the major city and along the row seven tenths of a cell north
     * of its middle, to the far end: further than a line has to keep from
     * the player's own track, nearer than a speed unit (a cell on this board)
     */
    const alongside = [
      centerOf(0),
      { lat: 0.7 * CELL, lng: 1.5 * CELL },
      { lat: 0.7 * CELL, lng: 4.5 * CELL }
    ]

    it("should let a line run near the player's own track", () => {
      trackStore.addSegment({ ownerId: ANN, coordinates: [centerOf(0), centerOf(4)] })

      expect(builder.buildSection(ANN, alongside).ok).toBe(true)
    })

    it("should not let a line run that near another player's track", () => {
      trackStore.addSegment({ ownerId: BO, coordinates: [centerOf(0), centerOf(4)] })

      expect(builder.buildSection(ANN, alongside).error).toMatch(
        /keep clear of other players' track/
      )
    })
  })

  it("should not start a section part way along another player's leg", () => {
    trackStore.addSegment({ ownerId: BO, coordinates: [centerOf(1), centerOf(4)] })
    const middle = centerOf(2)

    expect(builder.buildSection(ANN, [middle, { lat: -2 * CELL, lng: middle.lng }]).error).toBe(
      startRuleMessage(false)
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
    expect(result.error).toMatch(/costs \$3 million/)
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

  describe('town limits', () => {
    // Two players, so the small town at the east end takes one. Ann starts
    // there, heading west part of the way.
    const small = () => useTownsStore().towns[1]
    const fullMessage = () => townFullMessage({ town: small(), limit: 1, playerCount: 2 })
    /** From the major city, out north and back down into the small town's cell */
    const roundToSmall = (end = centerOf(5)) => [
      centerOf(0),
      { lat: 2 * CELL, lng: centerOf(0).lng },
      { lat: 2 * CELL, lng: centerOf(5).lng },
      end
    ]

    beforeEach(() => {
      builder.buildSection(ANN, [centerOf(5), centerOf(3)])
      playerStore.setActivePlayer(BO)
    })

    it('should not let another player build into a full town, and say why', () => {
      expect(builder.buildSection(BO, roundToSmall())).toEqual({ ok: false, error: fullMessage() })
      expect(trackStore.segmentsForOwner(BO)).toEqual([])
    })

    it("should not let another player through a full town's cell without joining it", () => {
      const besideTown = { lat: 0, lng: centerOf(5).lng + 0.3 * CELL }

      expect(builder.buildSection(BO, roundToSmall(besideTown)).error).toBe(fullMessage())
    })

    it('should not let another player start in a full town, and say why', () => {
      const south = { lat: -2 * CELL, lng: centerOf(5).lng }

      expect(builder.canStartAt(BO, centerOf(5))).toBe(false)
      expect(builder.fullTownAt(BO, centerOf(5))).toBe(fullMessage())
      expect(builder.buildSection(BO, [centerOf(5), south]).error).toBe(fullMessage())
      expect(builder.startPoints(BO)).not.toContainEqual({ lat: 0, lng: centerOf(5).lng })
      expect(builder.openTowns(BO).map(({ name }) => name)).toEqual(['Big'])
    })

    it('should let the player already in a full town keep building there', () => {
      playerStore.setActivePlayer(ANN)

      expect(builder.fullTownAt(ANN, centerOf(5))).toBeNull()
      expect(
        builder.buildSection(ANN, [centerOf(5), { lat: -2 * CELL, lng: centerOf(5).lng }]).ok
      ).toBe(true)
    })

    it('should open the town again once its player tears up their track there', () => {
      trackStore.removeSegment(trackStore.segmentsForOwner(ANN)[0].id)

      expect(builder.buildSection(BO, roundToSmall()).ok).toBe(true)
    })

    it('should give the start rule, not the limit, for a full town the rule rules out anyway', () => {
      useGameStore().setGameSettings({ requireMajorCityStart: true, limitTownBuilders: true })
      const south = { lat: -2 * CELL, lng: centerOf(5).lng }

      expect(builder.fullTownAt(BO, centerOf(5))).toBeNull()
      expect(builder.buildSection(BO, [centerOf(5), south]).error).toBe(startRuleMessage(true))
    })

    it('should let anyone build into any town when the game does not limit them', () => {
      useGameStore().setGameSettings({ limitTownBuilders: false })

      expect(builder.fullTownAt(BO, centerOf(5))).toBeNull()
      expect(builder.buildSection(BO, roundToSmall()).ok).toBe(true)
    })
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
        backFrom: null
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
        backFrom: null
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
        backFrom: 'water'
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
        backFrom: 'water'
      })
    })

    it("should cut a line that stops beside another player's track back to clear of it", () => {
      // Bo's line north to south across the row, through cell 2 near its
      // east side; a speed unit is a cell on this board
      const boX = 2.8 * CELL
      trackStore.addSegment({
        ownerId: BO,
        coordinates: [
          { lat: -3 * CELL, lng: boX },
          { lat: 3 * CELL, lng: boX }
        ]
      })
      // Square across Bo's line, to the middle of the next cell: seven tenths
      // of a speed unit past it, so still beside it. The vertex before is a
      // speed unit and a half short of it, in the clear.
      const clear = { lat: 0, lng: 1.2 * CELL }
      const line = [centerOf(0), clear, centerOf(3)]

      expect(builder.fitLine(ANN, line)).toMatchObject({
        points: [centerOf(0), clear],
        isCut: true,
        limit: null,
        backFrom: 'rivalTrack'
      })
    })
  })

  describe('removeTrackEnd', () => {
    /**
     * The center of a cell on a board three rows tall, the middle row being
     * the one the towns are in, so `at(1, i)` is `centerOf(i)`
     */
    const at = (row, col) => ({ lat: (row - 1) * CELL, lng: (col + 0.5) * CELL })

    /**
     * Three rows of six cells, each costing 1000, with any cells listed as
     * water made lake instead
     * @param {Array<string>} [water] - `"row,col"` of each water cell
     */
    const setBoard = (water = []) =>
      useGridStore().setGrid(
        makeTestGrid({
          rows: 3,
          cols: 6,
          south: -1.5 * CELL,
          cell: (row, col) =>
            water.includes(`${row},${col}`) ? { water: true } : { landCover: 1000 }
        })
      )

    /**
     * Builds a line for Ann, failing the test if it is not built, so no test
     * passes only because the track it is about was never there
     * @param {Array<Object>} points - The line's points
     * @returns {Object} What `buildSection` returned
     */
    const build = (points) => {
      const result = builder.buildSection(ANN, points)
      expect(result.ok).toBe(true)
      return result
    }

    /** Ann's only line, as the store holds it now */
    const annsLine = () => trackStore.segmentsForOwner(ANN)[0]

    beforeEach(() => {
      setBoard()
      useGameStore().setGameSettings({ requireMajorCityStart: true })
    })

    it('should tear up only the last leg, refunding what it added to the line', () => {
      const { segment } = build([centerOf(0), centerOf(1), centerOf(2), centerOf(3)])

      const result = builder.removeTrackEnd(ANN, segment.id)

      // The leg priced on its own would be two cells; it only added one,
      // the cell at the bend having been paid for with the leg before it
      expect(builder.priceSection([centerOf(2), centerOf(3)]).total).toBe(2000)
      expect(result).toEqual({ ok: true, refund: 1000 })
      expect(annsLine().coordinates).toEqual([centerOf(0), centerOf(1), centerOf(2)])
      expect(annsLine().cost).toBe(3000)
      expect(playerStore.players[0].cash).toBe(37000)
      expect(playerStore.trackSpendThisTurn(ANN)).toBe(3000)
    })

    it('should walk a line back leg by leg, refunding exactly what it cost', () => {
      const { segment } = build([centerOf(0), centerOf(1), centerOf(2), centerOf(3)])

      builder.removeTrackEnd(ANN, segment.id)
      builder.removeTrackEnd(ANN, segment.id)
      const last = builder.removeTrackEnd(ANN, segment.id)

      expect(last).toEqual({ ok: true, refund: 2000 })
      expect(trackStore.segments).toHaveLength(0)
      expect(playerStore.players[0].cash).toBe(40000)
      expect(playerStore.trackSpendThisTurn(ANN)).toBe(0)
    })

    it('should take a bridge off whole, back to the last point on land', () => {
      setBoard(['1,2'])
      const line = [centerOf(0), centerOf(1), centerOf(2), centerOf(3)]
      const { segment, cost } = build(line)
      const keptCost = builder.priceSection([centerOf(0), centerOf(1)]).total

      const result = builder.removeTrackEnd(ANN, segment.id)

      expect(result).toEqual({ ok: true, refund: cost - keptCost })
      expect(annsLine().coordinates).toEqual([centerOf(0), centerOf(1)])
      expect(annsLine().cost).toBe(keptCost)
    })

    it('should take a line off whole when its bridge leaves from its start', () => {
      setBoard(['1,1'])
      const { segment, cost } = build([centerOf(0), centerOf(1), centerOf(2)])

      expect(builder.removeTrackEnd(ANN, segment.id)).toEqual({ ok: true, refund: cost })
      expect(trackStore.segments).toHaveLength(0)
    })

    it('should refuse while a branch built this turn grows out of the end', () => {
      const { segment } = build([centerOf(0), centerOf(1), centerOf(2), centerOf(3)])
      build([centerOf(3), at(2, 3)])
      const cash = playerStore.players[0].cash

      expect(builder.removeTrackEnd(ANN, segment.id)).toEqual({
        ok: false,
        error: 'Remove your branch track first'
      })
      expect(annsLine().coordinates).toHaveLength(4)
      expect(playerStore.players[0].cash).toBe(cash)
    })

    it('should refuse while a branch starts part way along the end leg', () => {
      const { segment } = build([centerOf(0), centerOf(1), centerOf(2), centerOf(3)])
      const partWay = { lat: 0, lng: 3.2 * CELL }
      expect(build([partWay, { lat: CELL, lng: 3.2 * CELL }]).ok).toBe(true)

      expect(builder.removeTrackEnd(ANN, segment.id).ok).toBe(false)
    })

    it('should let the end come off once the branch is gone', () => {
      const { segment } = build([centerOf(0), centerOf(1), centerOf(2), centerOf(3)])
      const branch = build([centerOf(3), at(2, 3)]).segment

      builder.removeTrackEnd(ANN, branch.id)

      expect(builder.removeTrackEnd(ANN, segment.id).ok).toBe(true)
    })

    it('should let the end come off when a branch leaves from the point it is cut back to', () => {
      const { segment } = build([centerOf(0), centerOf(1), centerOf(2), centerOf(3)])
      build([centerOf(2), at(2, 2)])

      expect(builder.removeTrackEnd(ANN, segment.id).ok).toBe(true)
    })

    it('should let the end come off when a branch still starts on track from an earlier turn', () => {
      build([centerOf(0), centerOf(1), centerOf(2)])
      useGameStore().advanceTurn()
      const { segment } = build([centerOf(2), at(2, 2)])
      build([centerOf(2), at(0, 2)])

      expect(builder.removeTrackEnd(ANN, segment.id).ok).toBe(true)
    })

    it('should let the end come off when a branch leaves from a town track may start in', () => {
      useGameStore().setGameSettings({ requireMajorCityStart: false })
      const { segment } = build([centerOf(0), centerOf(3), centerOf(5)])
      build([centerOf(5), at(2, 5)])

      expect(builder.removeTrackEnd(ANN, segment.id).ok).toBe(true)
    })

    it('should refuse when a branch leaves from a town track may only be built into', () => {
      // Small is not a major city, so the branch only starts there on the line
      const { segment } = build([centerOf(0), centerOf(3), centerOf(5)])
      build([centerOf(5), at(2, 5)])

      expect(builder.removeTrackEnd(ANN, segment.id).ok).toBe(false)
    })

    it('should refuse track built on an earlier turn', () => {
      const { segment } = build([centerOf(0), centerOf(1), centerOf(2)])
      useGameStore().advanceTurn()

      expect(builder.removeTrackEnd(ANN, segment.id)).toEqual({
        ok: false,
        error: 'Only track you built this turn can be removed.'
      })
      expect(annsLine().coordinates).toHaveLength(3)
    })

    it("should refuse another player's track", () => {
      const { segment } = build([centerOf(0), centerOf(1), centerOf(2)])
      playerStore.setActivePlayer(BO)

      expect(builder.removeTrackEnd(BO, segment.id).ok).toBe(false)
      expect(annsLine().coordinates).toHaveLength(3)
    })

    it('should refuse a player whose turn it is not', () => {
      const { segment } = build([centerOf(0), centerOf(1), centerOf(2)])
      playerStore.setActivePlayer(BO)

      expect(builder.removeTrackEnd(ANN, segment.id)).toEqual({
        ok: false,
        error: "It isn't your turn."
      })
    })
  })
})
