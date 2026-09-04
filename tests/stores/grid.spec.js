/**
 * Grid Store Tests
 *
 * Tests for the grid store including:
 * - Initial state
 * - Loading state transitions
 * - Error handling
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

describe('Grid Store', () => {
  let gridStore

  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock implementations
    mockUseLocalStorage.mockImplementation((key, defaultValue) => ({ value: defaultValue }))
    mockFetchElevationsInBatches.mockResolvedValue([])
    mockFetchLandCoverInBatches.mockResolvedValue([])
    gridStore = useGridStore()
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
  })

  describe('generateGrid with cached data', () => {
    it('should use cached grid data when available', async () => {
      const cachedData = [{ id: '0-0', elevation: 100, landCover: 5, cost: 10 }]
      mockUseLocalStorage.mockReturnValue({ value: cachedData })

      await gridStore.generateGrid('27', [-95, 44, -94, 45], 10000)

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
        return [{ elevation: 100 }]
      })

      await gridStore.generateGrid('27', [-95, 44, -94.9, 44.1], 10000)

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

      // Generate grid - bounds create 2x2 = 4 cells
      await gridStore.generateGrid('27', [-95, 44, -94.8, 44.2], 10000)

      expect(wasLoadingLandCover).toBe(true)
      expect(gridStore.isLoadingLandCover).toBe(false)
    })

    it('should reset loading states after completion', async () => {
      mockFetchElevationsInBatches.mockResolvedValue([{ elevation: 100 }])
      mockFetchLandCoverInBatches.mockResolvedValue([5])

      await gridStore.generateGrid('27', [-95, 44, -94.9, 44.1], 10000)

      expect(gridStore.isLoadingElevation).toBe(false)
      expect(gridStore.isLoadingLandCover).toBe(false)
    })
  })

  describe('generateGrid error handling', () => {
    it('should handle elevation fetch errors gracefully', async () => {
      mockFetchElevationsInBatches.mockRejectedValue(new Error('Elevation API error'))

      // Should not throw
      await gridStore.generateGrid('27', [-95, 44, -94.9, 44.1], 10000)

      expect(gridStore.isLoadingElevation).toBe(false)
      expect(gridStore.isGridGenerated).toBe(false)
    })

    it('should not proceed to land cover when elevation fails', async () => {
      mockFetchElevationsInBatches.mockRejectedValue(new Error('Elevation API error'))

      await gridStore.generateGrid('27', [-95, 44, -94.9, 44.1], 10000)

      expect(mockFetchLandCoverInBatches).not.toHaveBeenCalled()
    })

    it('should handle land cover fetch errors gracefully', async () => {
      mockFetchElevationsInBatches.mockResolvedValue([{ elevation: 100 }, { elevation: 200 }])

      mockFetchLandCoverInBatches.mockRejectedValue(new Error('Land cover API error'))

      // Should not throw
      await gridStore.generateGrid('27', [-95, 44, -94.8, 44.2], 10000)

      expect(gridStore.isLoadingLandCover).toBe(false)
      expect(gridStore.isGridGenerated).toBe(false)
    })
  })

  describe('generateGrid data processing', () => {
    it('should skip cells with zero elevation when fetching land cover', async () => {
      mockFetchElevationsInBatches.mockResolvedValue([{ elevation: 0 }, { elevation: 100 }])
      mockFetchLandCoverInBatches.mockResolvedValue([5])

      await gridStore.generateGrid('27', [-95, 44, -94.8, 44.2], 10000)

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

      // Use bounds that generate exactly 2 cells (1 row x 2 cols)
      await gridStore.generateGrid('27', [-95, 44, -94.8, 44.1], 10000)

      // Should only call fetchLandCoverInBatches with 1 location
      expect(mockFetchLandCoverInBatches).toHaveBeenCalledTimes(1)
      const calledLocations = mockFetchLandCoverInBatches.mock.calls[0][0]
      expect(calledLocations).toHaveLength(1)
    })

    it('should filter out cells without valid data after processing', async () => {
      mockFetchElevationsInBatches.mockResolvedValue([{ elevation: 100 }, { elevation: 200 }])
      // Return null for first cell, valid for second
      mockFetchLandCoverInBatches.mockResolvedValue([null, 5])

      await gridStore.generateGrid('27', [-95, 44, -94.8, 44.2], 10000)

      // Only cells with both elevation and landCover should remain
      expect(gridStore.grid.every((cell) => cell.elevation && cell.landCover)).toBe(true)
    })

    it('should set isGridGenerated to true after successful generation', async () => {
      mockFetchElevationsInBatches.mockResolvedValue([{ elevation: 100 }])
      mockFetchLandCoverInBatches.mockResolvedValue([5])

      await gridStore.generateGrid('27', [-95, 44, -94.9, 44.1], 10000)

      expect(gridStore.isGridGenerated).toBe(true)
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

      await gridStore.generateGrid('27', [-95, 44, -94.8, 44.2], 10000)

      // Each cell should have a cost calculated
      gridStore.grid.forEach((cell) => {
        expect(cell.cost).toBeDefined()
        expect(cell.cost).toBeGreaterThanOrEqual(cell.landCover)
      })
    })
  })
})
