/**
 * Track Builder Tests
 *
 * The one way track is built, with or without the map: by the player whose
 * turn it is, starting in a major city or at the end of their own track,
 * within the build rules, and paid for out of cash and the turn's allowance.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTrackBuilder, START_RULE } from '@/composables/trackBuilder'
import { usePlayerStore } from '@/stores/players'
import { useGameStore } from '@/stores/game'
import { useGridStore } from '@/stores/grid'
import { useTownsStore } from '@/stores/towns'
import { useTrackStore } from '@/stores/track'
import { gameRules } from '@/config/game'
import { gridConfig } from '@/config/grid'
import { metersToLatitudeDegrees } from '@/composables/setup/useMapSupport'

/** Degrees one grid cell spans along the equator */
const CELL = metersToLatitudeDegrees(gridConfig.cellSize)
/** The center of cell `i` of a row of cells along the equator */
const centerOf = (i) => ({ lat: 0, lng: (i + 0.5) * CELL })
/** A row of six cells along the equator, each costing 1000 */
const grid = [0, 1, 2, 3, 4, 5].map((i) => ({ id: i, centroid: centerOf(i), cost: 1000 }))

const ANN = 1
const BO = 2

describe('useTrackBuilder', () => {
  let builder
  let playerStore
  let trackStore

  beforeEach(() => {
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

  it('should build a section from a major city, charging for each cell', () => {
    const result = builder.buildSection(ANN, [centerOf(0), centerOf(2)])

    expect(result).toMatchObject({ ok: true, cost: 3000 })
    expect(trackStore.segmentsForOwner(ANN)).toHaveLength(1)
    expect(playerStore.players[0].cash).toBe(37000)
    expect(playerStore.trackSpendThisTurn(ANN)).toBe(3000)
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
    useGridStore().setGrid([])

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
