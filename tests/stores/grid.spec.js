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

    it('should report a failure when every land cover lookup fails', async () => {
      mockFetchElevationsInBatches.mockResolvedValue([{ elevation: 100 }, { elevation: 200 }])
      mockFetchLandCoverInBatches.mockResolvedValue([null, null])

      const result = await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000)

      expect(result).toBe(false)
      expect(gridStore.isGridGenerated).toBe(false)
      expect(gridStore.error).toMatch(/terrain/i)
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
      mockFetchElevationsInBatches.mockResolvedValue([{ elevation: 100 }, { elevation: 200 }])
      // Return null for first cell, valid for second
      mockFetchLandCoverInBatches.mockResolvedValue([null, 5])

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000)

      // Only cells with both elevation and landCover should remain
      expect(gridStore.grid).toHaveLength(1)
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
      // First cell's lookup failed, second succeeded. Land cover must be asked
      // about the second cell's location, not the first's.
      mockFetchElevationsInBatches.mockResolvedValue([null, { elevation: 200 }])
      mockFetchLandCoverInBatches.mockResolvedValue([7])

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000)

      expect(gridStore.grid).toHaveLength(1)
      expect(gridStore.grid[0].id).toBe('0-1')
      expect(gridStore.grid[0].landCover).toBe(7)
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
    it('should weight phases by request count, not cell count', () => {
      // 100 cells: elevation is 10 batched requests, land cover is 100 single
      // ones. Finishing elevation is therefore a small slice of the wait, not
      // the ~30% a cell-count split would suggest.
      gridStore.elevationProgress = { completed: 100, total: 100 }
      gridStore.landCoverProgress = { completed: 0, total: 100 }

      const elevationRequests = Math.ceil(100 / gridApiConfig.elevationBatchSize)
      const expected = Math.round((elevationRequests / (elevationRequests + 100)) * 100)

      expect(gridStore.progressPercent).toBe(expected)
    })

    it('should reach 100 when both phases are complete', () => {
      gridStore.elevationProgress = { completed: 100, total: 100 }
      gridStore.landCoverProgress = { completed: 100, total: 100 }

      expect(gridStore.progressPercent).toBe(100)
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
