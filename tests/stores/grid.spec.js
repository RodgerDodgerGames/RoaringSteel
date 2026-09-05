/**
 * Grid Store Tests
 *
 * Tests for the grid store including:
 * - Initial state
 * - Loading state transitions
 * - Progress reporting
 * - Error handling and surfacing
 * - Cache usage
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Create hoisted mocks that can be configured per test
const mockFetchElevationsInBatches = vi.hoisted(() => vi.fn())
const mockFetchLandCoverInBatches = vi.hoisted(() => vi.fn())
const mockUseLocalStorage = vi.hoisted(() => vi.fn())

// Mock dependencies before any imports
vi.mock('@vueuse/core', () => ({
  useLocalStorage: mockUseLocalStorage
}))

vi.mock('@/composables/setup/useElevationAPI', () => ({
  useElevationAPI: () => ({
    fetchElevationsInBatches: mockFetchElevationsInBatches
  })
}))

vi.mock('@/composables/setup/useLandCoverAPI', () => ({
  useLandCoverAPI: () => ({
    fetchLandCoverInBatches: mockFetchLandCoverInBatches
  })
}))

vi.mock('@/composables/setup/useMapSupport', () => ({
  metersToLatitudeDegrees: () => 0.1,
  metersToLongitudeDegrees: () => 0.1
}))

// Import store after mocks are set up
import { useGridStore } from '@/stores/grid'
import { gridApiConfig } from '@/config/grid'

/**
 * Bounds are named by the cell count they produce with the mocked 0.1-degree
 * cell size, because that is the only property the tests care about and it is
 * not obvious from the numbers. `[-95, 44, -94.9, 44.1]` looks like a 1x1 grid
 * but floating point makes it 1 row x 0 cols, which silently generates nothing.
 */
const BOUNDS_2_CELLS = [-95, 44, -94.8, 44.1] // 1 row x 2 cols
const BOUNDS_4_CELLS = [-95, 44, -94.8, 44.2] // 2 rows x 2 cols
const BOUNDS_NO_CELLS = [-95, 44, -94.9, 44.1] // 1 row x 0 cols

describe('Grid Store', () => {
  let gridStore

  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock implementations
    mockUseLocalStorage.mockImplementation((key, defaultValue) => ({ value: defaultValue }))
    mockFetchElevationsInBatches.mockResolvedValue([])
    mockFetchLandCoverInBatches.mockResolvedValue([])
    gridStore = useGridStore()
    gridStore.reset()
  })

  describe('Initial State', () => {
    it('should start with an empty grid', () => {
      expect(gridStore.grid).toEqual([])
    })

    it('should start with isGridGenerated as false', () => {
      expect(gridStore.isGridGenerated).toBe(false)
    })

    it('should start with isLoadingElevation as false', () => {
      expect(gridStore.isLoadingElevation).toBe(false)
    })

    it('should start with isLoadingLandCover as false', () => {
      expect(gridStore.isLoadingLandCover).toBe(false)
    })

    it('should start with no error', () => {
      expect(gridStore.error).toBeNull()
    })

    it('should start at zero percent', () => {
      expect(gridStore.progressPercent).toBe(0)
    })
  })

  describe('generateGrid with cached data', () => {
    it('should use cached grid data when available', async () => {
      const cachedData = [{ id: '0-0', elevation: 100, landCover: 5, cost: 10 }]
      mockUseLocalStorage.mockReturnValue({ value: cachedData })

      const result = await gridStore.generateGrid('27', [-95, 44, -94, 45], 10000)

      expect(result).toBe(true)
      expect(gridStore.grid).toEqual(cachedData)
      expect(gridStore.isGridGenerated).toBe(true)
    })

    it('should not fetch data when cache exists', async () => {
      mockUseLocalStorage.mockReturnValue({
        value: [{ id: '0-0', elevation: 100, landCover: 5, cost: 10 }]
      })

      await gridStore.generateGrid('27', [-95, 44, -94, 45], 10000)

      expect(mockFetchElevationsInBatches).not.toHaveBeenCalled()
      expect(mockFetchLandCoverInBatches).not.toHaveBeenCalled()
    })
  })

  describe('generateGrid loading states', () => {
    it('should set isLoadingElevation to true during fetch', async () => {
      const loadingStates = []

      mockFetchElevationsInBatches.mockImplementation(async () => {
        loadingStates.push({ elevation: gridStore.isLoadingElevation })
        return [{ elevation: 100 }, { elevation: 200 }]
      })
      mockFetchLandCoverInBatches.mockResolvedValue([5, 5])

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000)

      expect(loadingStates[0].elevation).toBe(true)
      expect(gridStore.isLoadingElevation).toBe(false)
    })

    it('should set isLoadingLandCover to true during fetch', async () => {
      let wasLoadingLandCover = false

      // Provide enough elevations for grid cells
      mockFetchElevationsInBatches.mockResolvedValue([
        { elevation: 100 },
        { elevation: 200 },
        { elevation: 300 },
        { elevation: 400 }
      ])
      mockFetchLandCoverInBatches.mockImplementation(async () => {
        if (gridStore.isLoadingLandCover) {
          wasLoadingLandCover = true
        }
        return [5, 5, 5, 5]
      })

      await gridStore.generateGrid('27', BOUNDS_4_CELLS, 10000)

      expect(wasLoadingLandCover).toBe(true)
      expect(gridStore.isLoadingLandCover).toBe(false)
    })

    it('should reset loading states after completion', async () => {
      mockFetchElevationsInBatches.mockResolvedValue([{ elevation: 100 }, { elevation: 200 }])
      mockFetchLandCoverInBatches.mockResolvedValue([5, 5])

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000)

      expect(gridStore.isLoadingElevation).toBe(false)
      expect(gridStore.isLoadingLandCover).toBe(false)
    })
  })

  describe('generateGrid error handling', () => {
    it('should handle elevation fetch errors gracefully', async () => {
      mockFetchElevationsInBatches.mockRejectedValue(new Error('Elevation API error'))

      // Should not throw
      const result = await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000)

      expect(result).toBe(false)
      expect(gridStore.isLoadingElevation).toBe(false)
      expect(gridStore.isGridGenerated).toBe(false)
    })

    it('should surface an error message when elevation fails', async () => {
      mockFetchElevationsInBatches.mockRejectedValue(new Error('Elevation API error'))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000)

      expect(gridStore.error).toMatch(/elevation/i)
    })

    it('should clear the phase on failure so the progress UI can move on', async () => {
      mockFetchElevationsInBatches.mockRejectedValue(new Error('Elevation API error'))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000)

      expect(gridStore.currentPhase).toBe('')
    })

    it('should not proceed to land cover when elevation fails', async () => {
      mockFetchElevationsInBatches.mockRejectedValue(new Error('Elevation API error'))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000)

      expect(mockFetchLandCoverInBatches).not.toHaveBeenCalled()
    })

    it('should handle land cover fetch errors gracefully', async () => {
      mockFetchElevationsInBatches.mockResolvedValue([{ elevation: 100 }, { elevation: 200 }])
      mockFetchLandCoverInBatches.mockRejectedValue(new Error('Land cover API error'))

      // Should not throw
      const result = await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000)

      expect(result).toBe(false)
      expect(gridStore.isLoadingLandCover).toBe(false)
      expect(gridStore.isGridGenerated).toBe(false)
      expect(gridStore.error).toMatch(/land cover/i)
    })

    it('should report a failure when no elevation data comes back at all', async () => {
      // Every lookup failed, so there is nothing to ask land cover about
      mockFetchElevationsInBatches.mockResolvedValue([null, null])

      const result = await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000)

      expect(result).toBe(false)
      expect(gridStore.error).toMatch(/elevation/i)
      expect(mockFetchLandCoverInBatches).not.toHaveBeenCalled()
    })

    it('should report a failure when most elevation lookups fail', async () => {
      // Open-Elevation fails a whole batch into nulls rather than throwing, so
      // a throttled run used to reach the end and cache a grid full of holes.
      mockFetchElevationsInBatches.mockResolvedValue([{ elevation: 100 }, null, null, null])
      mockFetchLandCoverInBatches.mockResolvedValue([5])

      const result = await gridStore.generateGrid('27', BOUNDS_4_CELLS, 10000)

      expect(result).toBe(false)
      expect(gridStore.isGridGenerated).toBe(false)
      expect(gridStore.error).toMatch(/elevation data was missing for 3 of 4/i)
      expect(mockFetchLandCoverInBatches).not.toHaveBeenCalled()
    })

    it('should not cache a grid from a mostly-failed elevation pass', async () => {
      const cacheEntry = { value: [] }
      mockUseLocalStorage.mockReturnValue(cacheEntry)
      mockFetchElevationsInBatches.mockResolvedValue([{ elevation: 100 }, null, null, null])

      await gridStore.generateGrid('27', BOUNDS_4_CELLS, 10000)

      // A cached fragment would be reused on every future game in this state
      expect(cacheEntry.value).toEqual([])
    })

    it('should not count a sea-level reading as an elevation failure', async () => {
      // Zero is a real reading. It is dropped from the playable grid, but
      // counting it as a failed lookup would fail setup for a flat region.
      mockFetchElevationsInBatches.mockResolvedValue([
        { elevation: 0 },
        { elevation: 0 },
        { elevation: 0 },
        { elevation: 400 }
      ])
      mockFetchLandCoverInBatches.mockResolvedValue([5])

      const result = await gridStore.generateGrid('27', BOUNDS_4_CELLS, 10000)

      expect(result).toBe(true)
      expect(gridStore.error).toBeNull()
    })

    it('should report a failure when most land cover lookups fail', async () => {
      // A throttled NLCD returns nulls rather than throwing, so this used to
      // read as success and get cached permanently as a fragmented grid.
      mockFetchElevationsInBatches.mockResolvedValue([
        { elevation: 100 },
        { elevation: 200 },
        { elevation: 300 },
        { elevation: 400 }
      ])
      mockFetchLandCoverInBatches.mockResolvedValue([5, null, null, null])

      const result = await gridStore.generateGrid('27', BOUNDS_4_CELLS, 10000)

      expect(result).toBe(false)
      expect(gridStore.isGridGenerated).toBe(false)
      expect(gridStore.error).toMatch(/land cover data was missing/i)
    })

    it('should not cache a grid from a mostly-failed land cover pass', async () => {
      const cacheEntry = { value: [] }
      mockUseLocalStorage.mockReturnValue(cacheEntry)
      mockFetchElevationsInBatches.mockResolvedValue([
        { elevation: 100 },
        { elevation: 200 },
        { elevation: 300 },
        { elevation: 400 }
      ])
      mockFetchLandCoverInBatches.mockResolvedValue([5, null, null, null])

      await gridStore.generateGrid('27', BOUNDS_4_CELLS, 10000)

      // A cached fragment would be reused on every future game in this state
      expect(cacheEntry.value).toEqual([])
    })

    it('should report a failure when every land cover lookup fails', async () => {
      mockFetchElevationsInBatches.mockResolvedValue([{ elevation: 100 }, { elevation: 200 }])
      mockFetchLandCoverInBatches.mockResolvedValue([null, null])

      const result = await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000)

      expect(result).toBe(false)
      expect(gridStore.isGridGenerated).toBe(false)
      expect(gridStore.error).toMatch(/land cover data was missing for 2 of 2/i)
    })

    it('should report a failure when the region is too small to hold a cell', async () => {
      const result = await gridStore.generateGrid('27', BOUNDS_NO_CELLS, 10000)

      expect(result).toBe(false)
      expect(gridStore.error).toMatch(/too small/i)
      expect(mockFetchElevationsInBatches).not.toHaveBeenCalled()
    })

    it('should clear a previous error when generation is retried', async () => {
      mockFetchElevationsInBatches.mockRejectedValueOnce(new Error('Elevation API error'))
      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000)
      expect(gridStore.error).not.toBeNull()

      mockFetchElevationsInBatches.mockResolvedValue([{ elevation: 100 }, { elevation: 200 }])
      mockFetchLandCoverInBatches.mockResolvedValue([5, 5])

      const result = await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000)

      expect(result).toBe(true)
      expect(gridStore.error).toBeNull()
    })
  })

  describe('generateGrid data processing', () => {
    it('should skip cells with zero elevation when fetching land cover', async () => {
      mockFetchElevationsInBatches.mockResolvedValue([{ elevation: 0 }, { elevation: 100 }])
      mockFetchLandCoverInBatches.mockResolvedValue([5])

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000)

      // Should only call fetchLandCoverInBatches with 1 location (the valid one)
      expect(mockFetchLandCoverInBatches).toHaveBeenCalledTimes(1)
      const calledLocations = mockFetchLandCoverInBatches.mock.calls[0][0]
      expect(calledLocations).toHaveLength(1)
    })

    it('should skip cells with missing elevation results', async () => {
      // Provide only 1 elevation result for 2 cells - second cell has no result
      mockFetchElevationsInBatches.mockResolvedValue([
        { elevation: 100 }
        // Second cell has no corresponding elevation result
      ])
      mockFetchLandCoverInBatches.mockResolvedValue([5])

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000)

      expect(mockFetchLandCoverInBatches).toHaveBeenCalledTimes(1)
      const calledLocations = mockFetchLandCoverInBatches.mock.calls[0][0]
      expect(calledLocations).toHaveLength(1)
    })

    it('should filter out cells without valid data after processing', async () => {
      // One failed lookup in four stays under the acceptable failure rate
      mockFetchElevationsInBatches.mockResolvedValue([
        { elevation: 100 },
        { elevation: 200 },
        { elevation: 300 },
        { elevation: 400 }
      ])
      mockFetchLandCoverInBatches.mockResolvedValue([null, 5, 5, 5])

      await gridStore.generateGrid('27', BOUNDS_4_CELLS, 10000)

      // Only cells with both elevation and landCover should remain
      expect(gridStore.grid).toHaveLength(3)
      expect(gridStore.grid.every((cell) => cell.elevation && cell.landCover)).toBe(true)
    })

    it('should pair each cell with its own terrain data', async () => {
      mockFetchElevationsInBatches.mockResolvedValue([{ elevation: 100 }, { elevation: 200 }])
      mockFetchLandCoverInBatches.mockResolvedValue([5, 7])

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000)

      expect(gridStore.grid.map((cell) => [cell.id, cell.elevation, cell.landCover])).toEqual([
        ['0-0', 100, 5],
        ['0-1', 200, 7]
      ])
    })

    it('should skip land cover lookups for cells whose elevation failed', async () => {
      // First cell's lookup failed, the rest succeeded. Land cover must be
      // asked about the surviving cells' locations, not shifted onto the
      // failed one. Four cells keeps the single failure inside the acceptable
      // rate so this exercises the alignment, not the failure guard.
      mockFetchElevationsInBatches.mockResolvedValue([
        null,
        { elevation: 200 },
        { elevation: 300 },
        { elevation: 400 }
      ])
      mockFetchLandCoverInBatches.mockResolvedValue([7, 8, 9])

      await gridStore.generateGrid('27', BOUNDS_4_CELLS, 10000)

      const askedFor = mockFetchLandCoverInBatches.mock.calls[0][0]
      expect(askedFor).toHaveLength(3)
      expect(gridStore.grid).toHaveLength(3)
      expect(gridStore.grid[0].id).toBe('0-1')
      expect(gridStore.grid.map((cell) => cell.landCover)).toEqual([7, 8, 9])
    })

    it('should set isGridGenerated to true after successful generation', async () => {
      mockFetchElevationsInBatches.mockResolvedValue([{ elevation: 100 }, { elevation: 200 }])
      mockFetchLandCoverInBatches.mockResolvedValue([5, 5])

      const result = await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000)

      expect(result).toBe(true)
      expect(gridStore.isGridGenerated).toBe(true)
      expect(gridStore.grid.length).toBeGreaterThan(0)
    })

    it('should replace any existing grid rather than appending to it', async () => {
      // Regression: cells used to be pushed straight onto the store's array, so
      // a grid left over from a loaded save shifted every terrain lookup onto
      // the wrong cell and the stale cells survived the filter.
      gridStore.setGrid([{ id: 'stale', elevation: 999, landCover: 999, cost: 999 }])

      mockFetchElevationsInBatches.mockResolvedValue([{ elevation: 100 }, { elevation: 200 }])
      mockFetchLandCoverInBatches.mockResolvedValue([5, 7])

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000)

      expect(gridStore.grid).toHaveLength(2)
      expect(gridStore.grid.map((cell) => cell.id)).toEqual(['0-0', '0-1'])
      expect(gridStore.grid.find((cell) => cell.id === 'stale')).toBeUndefined()
    })

    it('should calculate costs using focal elevation operation', async () => {
      // Create a 2x2 grid with known elevations
      mockFetchElevationsInBatches.mockResolvedValue([
        { elevation: 100 },
        { elevation: 150 },
        { elevation: 120 },
        { elevation: 180 }
      ])
      mockFetchLandCoverInBatches.mockResolvedValue([10, 10, 10, 10])

      await gridStore.generateGrid('27', BOUNDS_4_CELLS, 10000)

      // Each cell should have a cost calculated
      gridStore.grid.forEach((cell) => {
        expect(cell.cost).toBeDefined()
        expect(cell.cost).toBeGreaterThanOrEqual(cell.landCover)
      })
    })
  })

  describe('progressPercent', () => {
    it('should weight elevation above its share of the requests', () => {
      // Elevation is batched, so it is a tiny share of the requests but a real
      // share of the wait. Asserting the relationship rather than the formula
      // keeps this from having to be rewritten every time pacing is retuned.
      gridStore.elevationProgress = { completed: 100, total: 100 }
      gridStore.landCoverProgress = { completed: 0, total: 100 }

      const elevationRequests = Math.ceil(100 / gridApiConfig.elevationBatchSize)
      const naiveRequestShare = (elevationRequests / (elevationRequests + 100)) * 100

      expect(gridStore.progressPercent).toBeGreaterThan(naiveRequestShare)
      // ...but finishing the cheaper phase must not read as most of the job.
      expect(gridStore.progressPercent).toBeLessThan(50)
    })

    it('should give elevation a smaller share as land cover work grows', () => {
      // The two phases scale differently, so the split has to move with the
      // grid size rather than being a fixed ratio.
      gridStore.elevationProgress = { completed: 100, total: 100 }
      gridStore.landCoverProgress = { completed: 0, total: 100 }
      const smallGridShare = gridStore.progressPercent

      gridStore.landCoverProgress = { completed: 0, total: 1000 }

      expect(gridStore.progressPercent).toBeLessThan(smallGridShare)
    })

    it('should not treat the elevation phase as a negligible sliver', () => {
      // Regression on the first cut of this: weighting purely by request count
      // gave elevation ~9% of the bar while it took about half the wall time,
      // so the bar crawled and then sprinted.
      gridStore.elevationProgress = { completed: 500, total: 500 }
      gridStore.landCoverProgress = { completed: 0, total: 500 }

      expect(gridStore.progressPercent).toBeGreaterThan(25)
    })

    it('should reach 100 when both phases are complete', () => {
      gridStore.elevationProgress = { completed: 100, total: 100 }
      gridStore.landCoverProgress = { completed: 100, total: 100 }

      expect(gridStore.progressPercent).toBe(100)
    })

    it('should not report 100 while any cell is still outstanding', () => {
      // 397 of 399 cells rounded up to 100%, so a run stalled on two hung
      // requests looked like a finished one and the player had nothing to go
      // on but a full bar that never moved (#85).
      gridStore.elevationProgress = { completed: 399, total: 399 }
      gridStore.landCoverProgress = { completed: 397, total: 399 }

      expect(gridStore.progressPercent).toBeLessThan(100)
    })

    it('should stay at zero before any work is queued', () => {
      expect(gridStore.progressPercent).toBe(0)
    })

    it('should never exceed 100 if land cover reports more than its total', () => {
      gridStore.elevationProgress = { completed: 20, total: 20 }
      gridStore.landCoverProgress = { completed: 25, total: 20 }

      expect(gridStore.progressPercent).toBeLessThanOrEqual(100)
    })
  })

  describe('clearError', () => {
    it('should drop the error without discarding the grid', async () => {
      mockFetchElevationsInBatches.mockResolvedValue([{ elevation: 100 }, { elevation: 200 }])
      mockFetchLandCoverInBatches.mockResolvedValue([5, 5])
      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000)
      const generated = gridStore.grid

      gridStore.error = 'something went wrong'
      gridStore.clearError()

      expect(gridStore.error).toBeNull()
      expect(gridStore.grid).toEqual(generated)
    })
  })

  describe('reset', () => {
    it('should clear progress and error state along with the grid', async () => {
      mockFetchElevationsInBatches.mockRejectedValue(new Error('Elevation API error'))
      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000)
      expect(gridStore.error).not.toBeNull()

      gridStore.reset()

      expect(gridStore.grid).toEqual([])
      expect(gridStore.isGridGenerated).toBe(false)
      expect(gridStore.error).toBeNull()
      expect(gridStore.currentPhase).toBe('')
      expect(gridStore.elevationProgress).toEqual({ completed: 0, total: 0 })
      expect(gridStore.landCoverProgress).toEqual({ completed: 0, total: 0 })
      expect(gridStore.progressPercent).toBe(0)
    })
  })
})
