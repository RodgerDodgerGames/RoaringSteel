/**
 * Grid Store (grid.js)
 *
 * Generates and manages the hex grid overlay for the game map.
 * Each grid cell contains terrain data that affects railroad building costs:
 * - Elevation: Higher elevation differences = more expensive to build
 * - Land Cover: Different terrain types have different building costs
 *
 * The grid is used during gameplay to calculate the cost of laying track
 * across different terrain types. Costs are calculated using a focal
 * operation that considers neighboring cell elevations.
 *
 * Grid Cell Structure:
 * {
 *   id: string,         // Grid position "row-col" (e.g., "5-12")
 *   centroid: Object,   // {lat, lng} center coordinates
 *   elevation: number,  // Elevation in meters
 *   landCover: number,  // Land cover cost multiplier
 *   cost: number        // Total building cost (elevation diff + land cover)
 * }
 *
 * @module stores/grid
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { useElevationAPI } from '../composables/setup/useElevationAPI'
import { useLandCoverAPI } from '../composables/setup/useLandCoverAPI'
import {
  metersToLatitudeDegrees,
  metersToLongitudeDegrees
} from '../composables/setup/useMapSupport'
import { gridApiConfig } from '@/config/grid'

export const useGridStore = defineStore('gridStore', () => {
  /** Array of grid cells with terrain and cost data */
  const grid = ref([])

  /** Flag indicating if grid generation is complete */
  const isGridGenerated = ref(false)

  /** Loading state for elevation data fetching */
  const isLoadingElevation = ref(false)

  /** Loading state for land cover data fetching */
  const isLoadingLandCover = ref(false)

  /** Progress tracking for elevation fetching */
  const elevationProgress = ref({ completed: 0, total: 0 })

  /** Progress tracking for land cover fetching */
  const landCoverProgress = ref({ completed: 0, total: 0 })

  /** Current phase of grid generation ('' when idle) */
  const currentPhase = ref('')

  /** Player-facing message when generation fails, otherwise null */
  const error = ref(null)

  /**
   * Combined progress percentage across both fetch phases.
   *
   * Progress is weighted by how many HTTP requests each phase needs rather
   * than by cell count: elevation asks about `elevationBatchSize` cells per
   * request while land cover asks about one, so counting cells would make the
   * bar crawl through the short phase and sprint through the long one.
   */
  const progressPercent = computed(() => {
    const elevationRequests = (count) => Math.ceil(count / gridApiConfig.elevationBatchSize)

    const totalRequests =
      elevationRequests(elevationProgress.value.total) + landCoverProgress.value.total
    if (totalRequests === 0) return 0

    const doneRequests =
      elevationRequests(elevationProgress.value.completed) + landCoverProgress.value.completed

    return Math.min(100, Math.round((doneRequests / totalRequests) * 100))
  })

  const { fetchElevationsInBatches } = useElevationAPI()
  const { fetchLandCoverInBatches } = useLandCoverAPI()

  /**
   * Generates a grid of cells covering the specified bounds.
   * Fetches elevation and land cover data for each cell, then calculates costs.
   * Uses localStorage caching to avoid redundant API calls.
   *
   * @param {string} stateFipsCode - State FIPS code for cache key
   * @param {Array<number>} bounds - Bounding box [minLng, minLat, maxLng, maxLat]
   * @param {number} cellSize - Grid cell size in meters
   * @returns {Promise<boolean>} True when a usable grid was produced
   */
  async function generateGrid(stateFipsCode, bounds, cellSize) {
    elevationProgress.value = { completed: 0, total: 0 }
    landCoverProgress.value = { completed: 0, total: 0 }
    currentPhase.value = 'initializing'
    error.value = null
    isGridGenerated.value = false

    // `useLocalStorage` automatically binds `grid` to `localStorage`
    const cachedGrid = useLocalStorage(`cachedGrid_${stateFipsCode}`, [])

    // check if grid already exists in cache
    if (cachedGrid.value.length > 0) {
      grid.value = cachedGrid.value
      isGridGenerated.value = true
      currentPhase.value = ''
      return true
    }

    // cell size is in meters so convert to degrees
    // find mean latitude
    // bounds is in [minX, minY, maxX, maxY]
    const meanLat = (bounds[3] + bounds[1]) / 2
    const lngCellSize = metersToLongitudeDegrees(cellSize, meanLat)
    const latCellSize = metersToLatitudeDegrees(cellSize)

    const rows = Math.floor((bounds[3] - bounds[1]) / latCellSize)
    const cols = Math.floor((bounds[2] - bounds[0]) / lngCellSize)

    // Cells are built in a plain array and only published to `grid` once the
    // data is in. Indexing into the store's array mid-build meant anything
    // already there — a grid restored from a save, say — silently pushed every
    // lookup onto the wrong cell.
    const locations = []
    const cells = []

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const centroid = {
          lat: bounds[1] + (i + 0.5) * latCellSize,
          lng: bounds[0] + (j + 0.5) * lngCellSize
        }
        locations.push(centroid)

        cells.push({
          id: `${i}-${j}`,
          centroid,
          elevation: null,
          landCover: null,
          cost: null
        })
      }
    }

    if (locations.length === 0) {
      return fail('That region is too small to build a grid from. Try selecting a larger area.')
    }

    // Both totals start at the full cell count so the bar has a stable
    // denominator; the land cover total is narrowed once elevation says which
    // cells are actually worth querying.
    elevationProgress.value = { completed: 0, total: locations.length }
    landCoverProgress.value = { completed: 0, total: locations.length }

    // Fetch elevation for all locations
    let elevationResults
    isLoadingElevation.value = true
    currentPhase.value = 'elevation'
    try {
      elevationResults = await fetchElevationsInBatches(
        locations,
        gridApiConfig.elevationBatchSize,
        (completed, total) => {
          elevationProgress.value = { completed, total }
        }
      )
    } catch (e) {
      console.error('Error fetching elevation data:', e)
      return fail('Could not load elevation data for this region. Check your connection and retry.')
    } finally {
      isLoadingElevation.value = false
    }

    // Keep only cells the elevation lookup actually answered for. A null entry
    // is a failed lookup; a zero is open water or a gap in the dataset.
    const pending = []
    elevationResults.forEach((result, index) => {
      if (result && result.elevation) {
        cells[index].elevation = result.elevation
        pending.push({ cell: cells[index], location: locations[index] })
      }
    })

    if (pending.length === 0) {
      return fail('No elevation data came back for this region. Check your connection and retry.')
    }

    landCoverProgress.value = { completed: 0, total: pending.length }

    // Fetch land cover data for the surviving cells
    isLoadingLandCover.value = true
    currentPhase.value = 'landcover'
    try {
      const landCoverResults = await fetchLandCoverInBatches(
        pending.map((entry) => entry.location),
        (completed, total) => {
          landCoverProgress.value = { completed, total }
        }
      )

      landCoverResults.forEach((cost, index) => {
        pending[index].cell.landCover = cost
      })
    } catch (e) {
      console.error('Error fetching land cover data:', e)
      return fail(
        'Could not load land cover data for this region. Check your connection and retry.'
      )
    } finally {
      isLoadingLandCover.value = false
    }

    // remove all grid cells where either elevation or land cover is null or zero
    const usableCells = cells.filter((cell) => cell.elevation && cell.landCover)

    if (usableCells.length === 0) {
      return fail('No terrain data came back for this region. Check your connection and retry.')
    }

    const dropped = cells.length - usableCells.length
    if (dropped > 0) {
      console.warn(`Dropped ${dropped} of ${cells.length} grid cells with incomplete terrain data.`)
    }

    grid.value = usableCells

    // calculate total cost for grid
    currentPhase.value = 'calculating'
    focalOpElevation(grid)

    // save grid to cache
    cachedGrid.value = grid.value

    isGridGenerated.value = true
    currentPhase.value = ''
    return true
  }

  /**
   * Records a generation failure and leaves the store in a clean idle state.
   * The phase is cleared so the progress UI can swap to the error message
   * instead of sitting on a bar that has stopped moving.
   *
   * @param {string} message - Player-facing explanation
   * @returns {false}
   */
  function fail(message) {
    console.error('Grid generation failed:', message)
    error.value = message
    currentPhase.value = ''
    isGridGenerated.value = false
    return false
  }

  /**
   * Resets the grid store to initial state.
   */
  function reset() {
    grid.value = []
    isGridGenerated.value = false
    isLoadingElevation.value = false
    isLoadingLandCover.value = false
    elevationProgress.value = { completed: 0, total: 0 }
    landCoverProgress.value = { completed: 0, total: 0 }
    currentPhase.value = ''
    error.value = null
  }

  /**
   * Sets the complete grid array (used for loading saved games).
   * @param {Array} gridArray - Array of grid cell objects
   */
  function setGrid(gridArray) {
    if (Array.isArray(gridArray)) {
      grid.value = gridArray
      isGridGenerated.value = true
      error.value = null
    }
  }

  return {
    grid,
    isGridGenerated,
    isLoadingElevation,
    isLoadingLandCover,
    elevationProgress,
    landCoverProgress,
    currentPhase,
    progressPercent,
    error,
    generateGrid,
    reset,
    setGrid
  }

  /**
   * Runs a focal operation over the elevation values in the grid cells.
   * Uses a 3x3 neighborhood.
   * Combines output with land cover to get total cost for each cell.
   * @param {Object} grid - The grid object with elevation and land cover data.
   */
  function focalOpElevation(grid) {
    // Parse the flat grid to map each cell by its `id` for quick lookups
    const cellMap = grid.value.reduce((map, cell) => {
      map[cell.id] = cell
      return map
    }, {})

    // Iterate over each cell in the grid
    grid.value.forEach((cell) => {
      // if the landcover or elevation value is null
      // set the cost to null and continue
      if (!cell.landCover || !cell.elevation) {
        cell.cost = null
        return
      }

      // Parse cell ID to get grid coordinates (format: "row-col")
      const [row, col] = cell.id.split('-').map(Number)
      let elevationCost = 0

      // Check all 8 neighbors in a 3x3 window around this cell
      // dr/dc represent delta row/column (-1, 0, +1)
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue // Skip the center cell (self)

          const neighborId = `${row + dr}-${col + dc}`
          const neighborCell = cellMap[neighborId]

          if (neighborCell) {
            // Steeper elevation changes = higher building cost
            // Sum up absolute elevation differences with all neighbors
            elevationCost += Math.abs(cell.elevation - neighborCell.elevation)
          }
        }
      }

      // Total cost = terrain difficulty (land cover) + slope difficulty (elevation changes)
      cell.cost = elevationCost + cell.landCover

      console.log(
        `Calculated cost for cell ${cell.id}: landcover ${cell.landCover}, elevation ${elevationCost}`
      )
    })
  }
})
