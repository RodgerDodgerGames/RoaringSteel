/**
 * Track Builder Tests
 *
 * The one way track is built, with or without the map: by the player whose
 * turn it is, starting in a major city or at the end of their own track,
 * within the build rules, and paid for out of cash and the turn's allowance.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useTrackBuilder, START_RULE } from '@/composables/trackBuilder'
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
const grid = makeTestGrid({ rows: 1, cols: 6, south: -CELL / 2, cell: () => ({ cost: 1000 }) })

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

  it('should not start a section in a town that is not a major city', () => {
    expect(builder.buildSection(ANN, [centerOf(5), centerOf(3)])).toEqual({
      ok: false,
      error: START_RULE
    })
    expect(trackStore.segments).toEqual([])
  })

  it("should not start a section at the end of another player's track", () => {
    trackStore.addSegment({ ownerId: BO, coordinates: [centerOf(0), centerOf(2)] })

    expect(builder.buildSection(ANN, [centerOf(2), centerOf(4)]).error).toBe(START_RULE)
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
      cell: () => ({ cost: 10 })
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
    it("should be the major cities and the points of the player's own track", () => {
      trackStore.addSegment({ ownerId: ANN, coordinates: [centerOf(2), centerOf(3)] })
      trackStore.addSegment({ ownerId: BO, coordinates: [centerOf(4), centerOf(5)] })

      expect(builder.startPoints(ANN)).toEqual([centerOf(0), centerOf(2), centerOf(3)])
    })
  })
})
