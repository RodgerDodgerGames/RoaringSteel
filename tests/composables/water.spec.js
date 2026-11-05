/**
 * Water Tests
 *
 * Bridges are set in km: each km of a crossing costs `costPerKm` times which
 * `stepKm` of the crossing it is in, and no crossing may be longer than
 * `maxKm`. Turned into cells for the grid's cell size, so a crossing costs
 * the same whatever the size of the cells it is cut into.
 */

import { describe, it, expect } from 'vitest'
import { bridgeCellCost, maxBridgeCells } from '@/composables/map/water'
import { gameRules } from '@/config/game'
import { makeTestGrid, CELL_METERS } from '../utils/testGrid'
import { metersToLatitudeDegrees } from '@/composables/setup/useMapSupport'

/** What a crossing this many cells long costs, on cells this wide */
const crossingCost = (cells, cellKm) =>
  Array.from({ length: cells }, (_, i) => bridgeCellCost(i + 1, cellKm)).reduce((a, b) => a + b, 0)

describe('bridgeCellCost', () => {
  it('should charge the first step of a crossing at the rate per km', () => {
    const { costPerKm } = gameRules.bridges

    expect(bridgeCellCost(1, 1)).toBe(costPerKm)
  })

  it('should charge each later step more than the one before', () => {
    const { costPerKm, stepKm } = gameRules.bridges

    // The first cell past the first step
    expect(bridgeCellCost(stepKm + 1, 1)).toBe(2 * costPerKm)
  })

  it('should cost a crossing the same on small cells as on large', () => {
    const { maxKm } = gameRules.bridges

    expect(crossingCost(maxKm, 1)).toBe(crossingCost(maxKm / 10, 10))
  })
})

describe('maxBridgeCells', () => {
  /** A grid of cells this many meters wide */
  const gridOf = (meters) =>
    makeTestGrid({ rows: 1, cols: 1, latStep: metersToLatitudeDegrees(meters) })

  it('should allow as many cells as fit in the longest bridge', () => {
    const { maxKm } = gameRules.bridges

    expect(maxBridgeCells(gridOf(CELL_METERS))).toBe(Math.floor(maxKm / 10))
    expect(maxBridgeCells(gridOf(1000))).toBe(maxKm)
  })
})
