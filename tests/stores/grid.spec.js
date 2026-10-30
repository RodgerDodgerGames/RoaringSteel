/**
 * Grid Store Tests
 *
 * Tests for the grid store including:
 * - Initial state
 * - Loading state transitions
 * - Progress reporting
 * - Error handling and surfacing
 * - Which cells are kept
 * - Kept grids, and the land cover year each was drawn from
 * - Finding a saved game's grid again
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Create hoisted mocks that can be configured per test. Each source is
// planned (how many requests) and then fetched; the fetches are what the
// tests script.
const mockFetchElevations = vi.hoisted(() => vi.fn())
const mockFetchLandCover = vi.hoisted(() => vi.fn())
const mockPlanElevations = vi.hoisted(() => vi.fn())
const mockPlanLandCover = vi.hoisted(() => vi.fn())
const mockLandCoverYearFor = vi.hoisted(() => vi.fn())

// Mock dependencies before any imports
vi.mock('@/composables/setup/useElevationTiles', () => ({
  useElevationTiles: () => ({ planElevations: mockPlanElevations })
}))

vi.mock('@/composables/setup/useLandCoverAPI', () => ({
  useLandCoverAPI: () => ({
    landCoverYearFor: mockLandCoverYearFor,
    planLandCover: mockPlanLandCover
  })
}))

vi.mock('@/composables/setup/useMapSupport', () => ({
  metersToLatitudeDegrees: () => 0.1,
  metersToLongitudeDegrees: () => 0.1
}))

// Import store after mocks are set up
import { useGridStore } from '@/stores/grid'
import { nlcdCostMap } from '@/config/nlcd'
import { RequestError } from '@/composables/utils'
import { getGrid, getGridYears, putGrid } from '@/composables/database'
import { makeTestGrid, cellsOf } from '../utils/testGrid'

/**
 * Bounds are named by the cell count they produce with the mocked 0.1-degree
 * cell size, because that is the only property the tests care about and it is
 * not obvious from the numbers. `[-95, 44, -94.9, 44.1]` looks like a 1x1 grid
 * but floating point makes it 1 row x 0 cols, which silently generates nothing.
 */
const BOUNDS_2_CELLS = [-95, 44, -94.8, 44.1] // 1 row x 2 cols
const BOUNDS_4_CELLS = [-95, 44, -94.8, 44.2] // 2 rows x 2 cols
const BOUNDS_NO_CELLS = [-95, 44, -94.9, 44.1] // 1 row x 0 cols

/** The year land cover is asked for: the middle of a 2021-2025 data window */
const YEAR = 2023

/** The cell size the tests keep grids under, in meters */
const CELL_SIZE = 10000

/** A grid kept in the database */
const CACHED_GRID = makeTestGrid({
  rows: 1,
  cols: 1,
  cell: () => ({ elevation: 100, landCover: 5, cost: 10 })
})

/** The ids of the store's cells, "row-col", in order */
const idsOf = (grid) => cellsOf(grid).map((cell) => cell.id)

/**
 * Keeps a grid in the database for state 27, as an earlier game would have.
 * @param {number} landCoverYear - The year it was drawn from
 * @param {Object} [grid] - The grid
 */
const keep = (landCoverYear, grid = CACHED_GRID) =>
  putGrid({ state: '27', cellSize: CELL_SIZE, landCoverYear, grid })

/** The land cover cost of open water, which is how a water cell is known */
const WATER = nlcdCostMap[11]

/** A land cover result with every picture loaded */
const landCover = (...costs) => ({ costs, failed: 0 })

describe('Grid Store', () => {
  let gridStore

  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock implementations
    mockPlanElevations.mockImplementation(() => ({ requestCount: 3, fetch: mockFetchElevations }))
    mockPlanLandCover.mockImplementation(() => ({ requestCount: 1, fetch: mockFetchLandCover }))
    mockFetchElevations.mockResolvedValue([])
    mockFetchLandCover.mockResolvedValue(landCover())
    mockLandCoverYearFor.mockImplementation(async (year) => year)
    gridStore = useGridStore()
    gridStore.reset()
  })

  describe('Initial State', () => {
    it('should start with an empty grid', () => {
      expect(gridStore.grid).toBeNull()
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

  describe('generateGrid with kept grids', () => {
    it('should use a kept grid drawn from the year the server serves', async () => {
      await keep(YEAR)

      const result = await gridStore.generateGrid('27', [-95, 44, -94, 45], CELL_SIZE, YEAR)

      expect(result).toBe(true)
      expect(cellsOf(gridStore.grid)).toEqual(cellsOf(CACHED_GRID))
      expect(gridStore.isGridGenerated).toBe(true)
      expect(mockFetchElevations).not.toHaveBeenCalled()
      expect(mockFetchLandCover).not.toHaveBeenCalled()
    })

    it('should use the kept grid when the server serves the year it was drawn from, not the one asked', async () => {
      // The server lacks 2023; the grid was drawn from 2022, its closest
      await keep(YEAR - 1)
      mockLandCoverYearFor.mockResolvedValue(YEAR - 1)

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, CELL_SIZE, YEAR)

      expect(cellsOf(gridStore.grid)).toEqual(cellsOf(CACHED_GRID))
      expect(mockFetchLandCover).not.toHaveBeenCalled()
    })

    it('should build the grid again once the server has a closer year', async () => {
      // Drawn from 2022 when the server lacked 2023; now it has 2023
      await keep(YEAR - 1)
      mockFetchElevations.mockResolvedValue([100, 200])
      mockFetchLandCover.mockResolvedValue(landCover(5, 7))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, CELL_SIZE, YEAR)

      expect(mockFetchLandCover).toHaveBeenCalled()
      expect(idsOf(gridStore.grid)).toEqual(['0-0', '0-1'])
    })

    it('should not use a grid kept for another state', async () => {
      await putGrid({ state: '06', cellSize: CELL_SIZE, landCoverYear: YEAR, grid: CACHED_GRID })
      mockFetchElevations.mockResolvedValue([100, 200])
      mockFetchLandCover.mockResolvedValue(landCover(5, 7))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, CELL_SIZE, YEAR)

      expect(idsOf(gridStore.grid)).toEqual(['0-0', '0-1'])
    })

    it('should keep a new grid with the year it was drawn from', async () => {
      // The server's closest year differs from the one asked
      mockLandCoverYearFor.mockResolvedValue(YEAR - 1)
      mockFetchElevations.mockResolvedValue([100, 200])
      mockFetchLandCover.mockResolvedValue(landCover(5, 7))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, CELL_SIZE, YEAR)

      const kept = await getGrid('27', CELL_SIZE, YEAR - 1)
      expect(cellsOf(kept.grid)).toEqual(cellsOf(gridStore.grid))
    })

    it('should keep the grids of other years alongside a new one', async () => {
      // Saved games played on the older grid still need it
      await keep(YEAR - 1)
      mockFetchElevations.mockResolvedValue([100, 200])
      mockFetchLandCover.mockResolvedValue(landCover(5, 7))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, CELL_SIZE, YEAR)

      expect(await getGridYears('27', CELL_SIZE)).toEqual([YEAR - 1, YEAR])
    })

    it('should record what the grid in play was built from', async () => {
      mockLandCoverYearFor.mockResolvedValue(YEAR - 1)
      mockFetchElevations.mockResolvedValue([100, 200])
      mockFetchLandCover.mockResolvedValue(landCover(5, 7))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, CELL_SIZE, YEAR)

      expect(gridStore.source).toEqual({
        state: '27',
        bounds: BOUNDS_2_CELLS,
        cellSize: CELL_SIZE,
        landCoverYear: YEAR - 1
      })
    })

    it("should use a kept grid, whatever its year, when the server's years cannot be had", async () => {
      await keep(YEAR - 2)
      mockLandCoverYearFor.mockRejectedValue(new Error('Network error'))

      const result = await gridStore.generateGrid('27', BOUNDS_2_CELLS, CELL_SIZE, YEAR)

      expect(result).toBe(true)
      expect(cellsOf(gridStore.grid)).toEqual(cellsOf(CACHED_GRID))
      expect(gridStore.source.landCoverYear).toBe(YEAR - 2)
      expect(gridStore.error).toBeNull()
      expect(mockFetchElevations).not.toHaveBeenCalled()
    })

    it("should use the kept grid closest to the year asked when the server's years cannot be had", async () => {
      // 2019 and 2027 are both four years off 2023; the later wins the tie
      await keep(YEAR - 4)
      await keep(YEAR + 4)
      await keep(YEAR - 1)
      mockLandCoverYearFor.mockRejectedValue(new Error('Network error'))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, CELL_SIZE, YEAR)
      expect(gridStore.source.landCoverYear).toBe(YEAR - 1)

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, CELL_SIZE, YEAR + 1)
      expect(gridStore.source.landCoverYear).toBe(YEAR - 1)

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, CELL_SIZE, YEAR - 3)
      expect(gridStore.source.landCoverYear).toBe(YEAR - 4)

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, CELL_SIZE, YEAR + 2)
      expect(gridStore.source.landCoverYear).toBe(YEAR + 4)
    })
  })

  describe('gridForSave', () => {
    /** What a save made on a 2-cell grid drawn from 2022 records */
    const SAVED_SOURCE = {
      state: '27',
      bounds: BOUNDS_2_CELLS,
      cellSize: CELL_SIZE,
      landCoverYear: YEAR - 1
    }

    it('should hand back the kept grid without downloading anything', async () => {
      await keep(YEAR - 1)

      const found = await gridStore.gridForSave(SAVED_SOURCE)

      expect(cellsOf(found)).toEqual(cellsOf(CACHED_GRID))
      expect(mockLandCoverYearFor).not.toHaveBeenCalled()
      expect(mockFetchElevations).not.toHaveBeenCalled()
    })

    it('should build the grid again from the same year when none is kept', async () => {
      // A grid of another year is no use: the save was played on 2022's
      await keep(YEAR)
      mockFetchElevations.mockResolvedValue([100, 200])
      mockFetchLandCover.mockResolvedValue(landCover(5, 7))

      const found = await gridStore.gridForSave(SAVED_SOURCE)

      expect(idsOf(found)).toEqual(['0-0', '0-1'])
      expect(mockLandCoverYearFor).not.toHaveBeenCalled()
      expect(mockPlanLandCover).toHaveBeenCalledWith(expect.any(Array), CELL_SIZE, YEAR - 1)
    })

    it('should keep a grid it builds again', async () => {
      mockFetchElevations.mockResolvedValue([100, 200])
      mockFetchLandCover.mockResolvedValue(landCover(5, 7))

      const found = await gridStore.gridForSave(SAVED_SOURCE)

      const kept = await getGrid('27', CELL_SIZE, YEAR - 1)
      expect(cellsOf(kept.grid)).toEqual(cellsOf(found))
    })

    it('should not put the grid in play, so a failed load leaves the game as it was', async () => {
      gridStore.setGrid(CACHED_GRID, { ...SAVED_SOURCE, landCoverYear: YEAR })
      mockFetchElevations.mockRejectedValue(new Error('Network error'))

      const found = await gridStore.gridForSave(SAVED_SOURCE)

      expect(found).toBe(false)
      expect(gridStore.error).toMatch(/elevation/i)
      expect(cellsOf(gridStore.grid)).toEqual(cellsOf(CACHED_GRID))
      expect(gridStore.source.landCoverYear).toBe(YEAR)
    })
  })

  describe('generateGrid land cover year', () => {
    it('should draw land cover from the year the server has closest to the one asked', async () => {
      mockLandCoverYearFor.mockResolvedValue(2021)
      mockFetchElevations.mockResolvedValue([100, 200])
      mockFetchLandCover.mockResolvedValue(landCover(5, 7))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(mockLandCoverYearFor).toHaveBeenCalledWith(YEAR)
      expect(mockPlanLandCover.mock.calls[0][2]).toBe(2021)
    })

    it("should end on its error screen if the server's years cannot be had", async () => {
      mockLandCoverYearFor.mockRejectedValue(new Error('Land cover server answered 503'))

      const result = await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(result).toBe(false)
      expect(gridStore.error).toMatch(/land cover server/)
      expect(gridStore.currentPhase).toBe('')
      expect(mockFetchElevations).not.toHaveBeenCalled()
      expect(mockFetchLandCover).not.toHaveBeenCalled()
    })

    it('should tell the player to check their connection when the server cannot be reached', async () => {
      mockLandCoverYearFor.mockRejectedValue(new Error('Network error'))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(gridStore.error).toMatch(/Check your connection/)
    })

    it('should not blame the connection when the server turns the request down', async () => {
      mockLandCoverYearFor.mockRejectedValue(
        new RequestError('Land cover server answered 400', 400)
      )

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(gridStore.error).toMatch(/turned down/)
      expect(gridStore.error).toMatch(/error 400/)
      expect(gridStore.error).not.toMatch(/connection/)
    })
  })

  describe('generateGrid loading states', () => {
    it('should set isLoadingElevation to true during fetch', async () => {
      const loadingStates = []

      mockFetchElevations.mockImplementation(async () => {
        loadingStates.push({ elevation: gridStore.isLoadingElevation })
        return [100, 200]
      })
      mockFetchLandCover.mockResolvedValue(landCover(5, 5))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(loadingStates[0].elevation).toBe(true)
      expect(gridStore.isLoadingElevation).toBe(false)
    })

    it('should set isLoadingLandCover to true during fetch', async () => {
      let wasLoadingLandCover = false

      mockFetchElevations.mockResolvedValue([100, 200, 300, 400])
      mockFetchLandCover.mockImplementation(async () => {
        if (gridStore.isLoadingLandCover) {
          wasLoadingLandCover = true
        }
        return landCover(5, 5, 5, 5)
      })

      await gridStore.generateGrid('27', BOUNDS_4_CELLS, 10000, YEAR)

      expect(wasLoadingLandCover).toBe(true)
      expect(gridStore.isLoadingLandCover).toBe(false)
    })

    it('should reset loading states after completion', async () => {
      mockFetchElevations.mockResolvedValue([100, 200])
      mockFetchLandCover.mockResolvedValue(landCover(5, 5))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(gridStore.isLoadingElevation).toBe(false)
      expect(gridStore.isLoadingLandCover).toBe(false)
    })
  })

  describe('generateGrid error handling', () => {
    it('should handle elevation fetch errors gracefully', async () => {
      mockFetchElevations.mockRejectedValue(new Error('Elevation error'))

      // Should not throw
      const result = await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(result).toBe(false)
      expect(gridStore.isLoadingElevation).toBe(false)
      expect(gridStore.isGridGenerated).toBe(false)
    })

    it('should surface an error message when elevation fails', async () => {
      mockFetchElevations.mockRejectedValue(new Error('Elevation error'))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(gridStore.error).toMatch(/elevation/i)
    })

    it('should clear the phase on failure so the progress UI can move on', async () => {
      mockFetchElevations.mockRejectedValue(new Error('Elevation error'))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(gridStore.currentPhase).toBe('')
    })

    it('should not proceed to land cover when elevation fails', async () => {
      mockFetchElevations.mockRejectedValue(new Error('Elevation error'))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(mockFetchLandCover).not.toHaveBeenCalled()
    })

    it('should handle land cover fetch errors gracefully', async () => {
      mockFetchElevations.mockResolvedValue([100, 200])
      mockFetchLandCover.mockRejectedValue(new Error('Land cover error'))

      // Should not throw
      const result = await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(result).toBe(false)
      expect(gridStore.isLoadingLandCover).toBe(false)
      expect(gridStore.isGridGenerated).toBe(false)
      expect(gridStore.error).toMatch(/land cover/i)
    })

    it('should report a failure when no elevation data comes back at all', async () => {
      // Every tile failed, so there is nothing worth asking land cover about
      mockFetchElevations.mockResolvedValue([null, null])

      const result = await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(result).toBe(false)
      expect(gridStore.error).toMatch(/elevation/i)
      expect(mockFetchLandCover).not.toHaveBeenCalled()
    })

    it('should report a failure when most elevation lookups fail', async () => {
      // A failed tile leaves its cells null rather than throwing, so a broken
      // run would otherwise reach the end and cache a grid full of holes.
      mockFetchElevations.mockResolvedValue([100, null, null, null])

      const result = await gridStore.generateGrid('27', BOUNDS_4_CELLS, 10000, YEAR)

      expect(result).toBe(false)
      expect(gridStore.isGridGenerated).toBe(false)
      expect(gridStore.error).toMatch(/elevation data was missing for 3 of 4/i)
      expect(mockFetchLandCover).not.toHaveBeenCalled()
    })

    it('should not keep a grid from a mostly-failed elevation pass', async () => {
      mockFetchElevations.mockResolvedValue([100, null, null, null])

      await gridStore.generateGrid('27', BOUNDS_4_CELLS, CELL_SIZE, YEAR)

      // A kept fragment would be reused on every future game in this state
      expect(await getGridYears('27', CELL_SIZE)).toEqual([])
    })

    it('should not count a sea-level reading as an elevation failure', async () => {
      // Zero is a real reading, not a failed lookup; counting it as one would
      // fail setup for a flat coastal region.
      mockFetchElevations.mockResolvedValue([0, 0, 0, 400])
      mockFetchLandCover.mockResolvedValue(landCover(5, 5, 5, 5))

      const result = await gridStore.generateGrid('27', BOUNDS_4_CELLS, 10000, YEAR)

      expect(result).toBe(true)
      expect(gridStore.error).toBeNull()
    })

    it('should report a failure when most land cover pictures fail', async () => {
      // A failed picture leaves its cells null rather than throwing, so this
      // would otherwise read as success and get cached as a fragmented grid.
      mockFetchElevations.mockResolvedValue([100, 200, 300, 400])
      mockFetchLandCover.mockResolvedValue({ costs: [5, null, null, null], failed: 3 })

      const result = await gridStore.generateGrid('27', BOUNDS_4_CELLS, 10000, YEAR)

      expect(result).toBe(false)
      expect(gridStore.isGridGenerated).toBe(false)
      expect(gridStore.error).toMatch(/land cover data was missing for 3 of 4/i)
    })

    it('should not keep a grid from a mostly-failed land cover pass', async () => {
      mockFetchElevations.mockResolvedValue([100, 200, 300, 400])
      mockFetchLandCover.mockResolvedValue({ costs: [5, null, null, null], failed: 3 })

      await gridStore.generateGrid('27', BOUNDS_4_CELLS, CELL_SIZE, YEAR)

      // A kept fragment would be reused on every future game in this state
      expect(await getGridYears('27', CELL_SIZE)).toEqual([])
    })

    it('should report a failure when every land cover picture fails', async () => {
      mockFetchElevations.mockResolvedValue([100, 200])
      mockFetchLandCover.mockResolvedValue({ costs: [null, null], failed: 2 })

      const result = await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(result).toBe(false)
      expect(gridStore.isGridGenerated).toBe(false)
      expect(gridStore.error).toMatch(/land cover data was missing for 2 of 2/i)
    })

    it('should not count cells beyond the border as a land cover failure', async () => {
      // Texas' box reaches into Mexico, where the NLCD has no data. Those
      // cells drop out, but nothing failed, so setup goes ahead.
      mockFetchElevations.mockResolvedValue([100, 200, 300, 400])
      mockFetchLandCover.mockResolvedValue({ costs: [5, null, null, null], failed: 0 })

      const result = await gridStore.generateGrid('27', BOUNDS_4_CELLS, 10000, YEAR)

      expect(result).toBe(true)
      expect(gridStore.grid.count).toBe(1)
    })

    it('should report a failure when no cell has both kinds of terrain data', async () => {
      mockFetchElevations.mockResolvedValue([100, 200])
      mockFetchLandCover.mockResolvedValue(landCover(null, null))

      const result = await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(result).toBe(false)
      expect(gridStore.error).toMatch(/no terrain data/i)
    })

    it('should end on its error screen if planning the downloads fails', async () => {
      // A throw here used to escape setup and leave the progress bar up forever
      mockPlanLandCover.mockImplementation(() => {
        throw new RangeError('Maximum call stack size exceeded')
      })

      const result = await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(result).toBe(false)
      expect(gridStore.error).toMatch(/terrain downloads/i)
      expect(gridStore.currentPhase).toBe('')
      expect(mockFetchElevations).not.toHaveBeenCalled()
    })

    it('should report a failure when the region is too small to hold a cell', async () => {
      const result = await gridStore.generateGrid('27', BOUNDS_NO_CELLS, 10000, YEAR)

      expect(result).toBe(false)
      expect(gridStore.error).toMatch(/too small/i)
      expect(mockFetchElevations).not.toHaveBeenCalled()
    })

    it('should clear a previous error when generation is retried', async () => {
      mockFetchElevations.mockRejectedValueOnce(new Error('Elevation error'))
      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)
      expect(gridStore.error).not.toBeNull()

      mockFetchElevations.mockResolvedValue([100, 200])
      mockFetchLandCover.mockResolvedValue(landCover(5, 5))

      const result = await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(result).toBe(true)
      expect(gridStore.error).toBeNull()
    })
  })

  describe('generateGrid data processing', () => {
    it('should ask both sources about every cell, in order, at the cell size', async () => {
      mockFetchElevations.mockResolvedValue([100, 200])
      mockFetchLandCover.mockResolvedValue(landCover(5, 5))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      const [elevationLocations, elevationCellSize] = mockPlanElevations.mock.calls[0]
      const [landCoverLocations, landCoverCellSize] = mockPlanLandCover.mock.calls[0]
      expect(elevationLocations).toHaveLength(2)
      expect(elevationLocations[0].lng).toBeLessThan(elevationLocations[1].lng)
      expect(landCoverLocations).toEqual(elevationLocations)
      expect([elevationCellSize, landCoverCellSize]).toEqual([10000, 10000])
    })

    it('should keep land at sea level and price it', async () => {
      // Regression: a reading of 0 used to drop the cell, and the cost step
      // skipped it too, so land at sea level vanished from the board.
      mockFetchElevations.mockResolvedValue([0, 100])
      mockFetchLandCover.mockResolvedValue(landCover(5, 5))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(idsOf(gridStore.grid)).toEqual(['0-0', '0-1'])
      expect(cellsOf(gridStore.grid).every((cell) => Number.isFinite(cell.cost))).toBe(true)
    })

    it('should keep land below sea level', async () => {
      mockFetchElevations.mockResolvedValue([-20, 100])
      mockFetchLandCover.mockResolvedValue(landCover(5, 5))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(cellsOf(gridStore.grid).map((cell) => cell.elevation)).toEqual([-20, 100])
    })

    it('should leave the sea off the board', async () => {
      // Water at or below sea level is the sea: the tiles read it below zero
      mockFetchElevations.mockResolvedValue([-30, 100])
      mockFetchLandCover.mockResolvedValue(landCover(WATER, 5))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(idsOf(gridStore.grid)).toEqual(['0-1'])
    })

    it('should keep a lake, which sits above sea level', async () => {
      mockFetchElevations.mockResolvedValue([300, 310])
      mockFetchLandCover.mockResolvedValue(landCover(WATER, 5))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(cellsOf(gridStore.grid).map((cell) => [cell.id, cell.landCover])).toEqual([
        ['0-0', WATER],
        ['0-1', 5]
      ])
    })

    it('should drop cells whose elevation could not be had', async () => {
      // One failed tile in four stays under the acceptable failure rate, so
      // this exercises the filter, not the failure guard
      mockFetchElevations.mockResolvedValue([null, 200, 300, 400])
      mockFetchLandCover.mockResolvedValue(landCover(7, 8, 9, 10))

      await gridStore.generateGrid('27', BOUNDS_4_CELLS, 10000, YEAR)

      expect(idsOf(gridStore.grid)).toEqual(['0-1', '1-0', '1-1'])
      expect(cellsOf(gridStore.grid).map((cell) => cell.landCover)).toEqual([8, 9, 10])
    })

    it('should pair each cell with its own terrain data', async () => {
      mockFetchElevations.mockResolvedValue([100, 200])
      mockFetchLandCover.mockResolvedValue(landCover(5, 7))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(
        cellsOf(gridStore.grid).map((cell) => [cell.id, cell.elevation, cell.landCover])
      ).toEqual([
        ['0-0', 100, 5],
        ['0-1', 200, 7]
      ])
    })

    it('should set isGridGenerated to true after successful generation', async () => {
      mockFetchElevations.mockResolvedValue([100, 200])
      mockFetchLandCover.mockResolvedValue(landCover(5, 5))

      const result = await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(result).toBe(true)
      expect(gridStore.isGridGenerated).toBe(true)
      expect(gridStore.grid.count).toBeGreaterThan(0)
    })

    it('should replace any existing grid rather than appending to it', async () => {
      // Regression: cells used to be pushed straight onto the store's array, so
      // a grid left over from a loaded save shifted every terrain lookup onto
      // the wrong cell and the stale cells survived the filter.
      const stale = makeTestGrid({
        rows: 3,
        cols: 3,
        cell: () => ({ elevation: 999, landCover: 999, cost: 999 })
      })
      gridStore.setGrid(stale, null)

      mockFetchElevations.mockResolvedValue([100, 200])
      mockFetchLandCover.mockResolvedValue(landCover(5, 7))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(gridStore.grid.count).toBe(2)
      expect(idsOf(gridStore.grid)).toEqual(['0-0', '0-1'])
      expect(cellsOf(gridStore.grid).some((cell) => cell.elevation === 999)).toBe(false)
    })

    it('should cost each cell its land cover plus the climbs to its neighbors', async () => {
      // A 2x2 grid, south row first: 100 150 / 120 180. Every cell borders
      // the other three, so cell 0-0 climbs 50 + 20 + 80 = 150, and so on.
      mockFetchElevations.mockResolvedValue([100, 150, 120, 180])
      mockFetchLandCover.mockResolvedValue(landCover(10, 10, 10, 10))

      await gridStore.generateGrid('27', BOUNDS_4_CELLS, 10000, YEAR)

      expect(cellsOf(gridStore.grid).map((cell) => cell.cost)).toEqual([160, 120, 120, 180])
    })

    it('should not count a hole beside a cell toward its climbs', async () => {
      // The sea in the south-west corner: the other cells only climb to each other
      mockFetchElevations.mockResolvedValue([-30, 150, 120, 180])
      mockFetchLandCover.mockResolvedValue(landCover(WATER, 10, 10, 10))

      await gridStore.generateGrid('27', BOUNDS_4_CELLS, 10000, YEAR)

      expect(cellsOf(gridStore.grid).map((cell) => cell.cost)).toEqual([
        10 + 30 + 30,
        10 + 30 + 60,
        10 + 30 + 60
      ])
    })
  })

  describe('progressPercent', () => {
    it('should know the whole job before the first download starts', async () => {
      // Both sources are planned up front, so the bar never jumps backward
      // when the second phase starts and turns out to have work in it.
      let landCoverTotalDuringElevation = null
      mockPlanLandCover.mockImplementation(() => ({ requestCount: 4, fetch: mockFetchLandCover }))
      mockFetchElevations.mockImplementation(async () => {
        landCoverTotalDuringElevation = gridStore.landCoverProgress.total
        return [100, 200]
      })
      mockFetchLandCover.mockResolvedValue(landCover(5, 5))

      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)

      expect(landCoverTotalDuringElevation).toBe(4)
    })

    it('should weight the slow land cover pictures above their share of requests', () => {
      // 90 small tiles done and 4 big pictures to go is not 96% of the wait.
      // Asserting the relationship rather than the formula keeps this from
      // having to be rewritten every time the timings are re-measured.
      gridStore.elevationProgress = { completed: 90, total: 90 }
      gridStore.landCoverProgress = { completed: 0, total: 4 }

      expect(gridStore.progressPercent).toBeLessThan((90 / 94) * 100)
      expect(gridStore.progressPercent).toBeGreaterThan(0)
    })

    it('should reach 100 when both phases are complete', () => {
      gridStore.elevationProgress = { completed: 100, total: 100 }
      gridStore.landCoverProgress = { completed: 4, total: 4 }

      expect(gridStore.progressPercent).toBe(100)
    })

    it('should not report 100 while any request is still outstanding', () => {
      // 397 of 399 rounded up to 100%, so a run stalled on two hung requests
      // looked like a finished one and the player had nothing to go on but a
      // full bar that never moved (#85).
      gridStore.elevationProgress = { completed: 397, total: 399 }
      gridStore.landCoverProgress = { completed: 0, total: 0 }

      expect(gridStore.progressPercent).toBeLessThan(100)
    })

    it('should stay at zero before any work is queued', () => {
      expect(gridStore.progressPercent).toBe(0)
    })

    it('should never exceed 100 if a phase reports more than its total', () => {
      gridStore.elevationProgress = { completed: 20, total: 20 }
      gridStore.landCoverProgress = { completed: 5, total: 4 }

      expect(gridStore.progressPercent).toBeLessThanOrEqual(100)
    })
  })

  describe('clearError', () => {
    it('should drop the error without discarding the grid', async () => {
      mockFetchElevations.mockResolvedValue([100, 200])
      mockFetchLandCover.mockResolvedValue(landCover(5, 5))
      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)
      const generated = gridStore.grid

      gridStore.error = 'something went wrong'
      gridStore.clearError()

      expect(gridStore.error).toBeNull()
      expect(gridStore.grid).toBe(generated)
    })
  })

  describe('reset', () => {
    it('should clear progress and error state along with the grid', async () => {
      mockFetchElevations.mockRejectedValue(new Error('Elevation error'))
      await gridStore.generateGrid('27', BOUNDS_2_CELLS, 10000, YEAR)
      expect(gridStore.error).not.toBeNull()

      gridStore.reset()

      expect(gridStore.grid).toBeNull()
      expect(gridStore.isGridGenerated).toBe(false)
      expect(gridStore.error).toBeNull()
      expect(gridStore.currentPhase).toBe('')
      expect(gridStore.elevationProgress).toEqual({ completed: 0, total: 0 })
      expect(gridStore.landCoverProgress).toEqual({ completed: 0, total: 0 })
      expect(gridStore.progressPercent).toBe(0)
    })

    it('should forget what the grid was built from', () => {
      gridStore.setGrid(CACHED_GRID, {
        state: '27',
        bounds: BOUNDS_2_CELLS,
        cellSize: CELL_SIZE,
        landCoverYear: YEAR
      })

      gridStore.reset()

      expect(gridStore.source).toBeNull()
    })
  })
})
