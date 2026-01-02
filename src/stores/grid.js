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

  /** Current phase of grid generation */
  const currentPhase = ref('')

  /** Combined progress percentage */
  const progressPercent = computed(() => {
    const elevTotal = elevationProgress.value.total
    const lcTotal = landCoverProgress.value.total

    if (elevTotal === 0 && lcTotal === 0) return 0

    // Elevation is ~30% of work, land cover is ~70% (since it's slower)
    const elevWeight = 0.3
    const lcWeight = 0.7

    const elevPct = elevTotal > 0 ? elevationProgress.value.completed / elevTotal : 0
    const lcPct = lcTotal > 0 ? landCoverProgress.value.completed / lcTotal : 0

    return Math.round((elevPct * elevWeight + lcPct * lcWeight) * 100)
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
   * @returns {Promise<void>}
   */
  async function generateGrid(stateFipsCode, bounds, cellSize) {
    // Reset progress state
    elevationProgress.value = { completed: 0, total: 0 }
    landCoverProgress.value = { completed: 0, total: 0 }
    currentPhase.value = 'initializing'

    // `useLocalStorage` automatically binds `grid` to `localStorage`
    const cachedGrid = useLocalStorage(`cachedGrid_${stateFipsCode}`, [])

    // check if grid already exists in cache
    if (cachedGrid.value.length > 0) {
      grid.value = cachedGrid.value
      isGridGenerated.value = true
      currentPhase.value = ''
      return
    }

    // cell size is in meters so convert to degrees
    // find mean latitude
    // bounds is in [minX, minY, maxX, maxY]
    const meanLat = (bounds[3] + bounds[1]) / 2
    const lngCellSize = metersToLongitudeDegrees(cellSize, meanLat)
    const latCellSize = metersToLatitudeDegrees(cellSize)

    const rows = Math.floor((bounds[3] - bounds[1]) / latCellSize)
    const cols = Math.floor((bounds[2] - bounds[0]) / lngCellSize)
    const locations = []

    // Loop through the grid and prepare location data for elevation and land cover
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const centroid = {
          lat: bounds[1] + (i + 0.5) * latCellSize,
          lng: bounds[0] + (j + 0.5) * lngCellSize
        }
        locations.push(centroid)

        grid.value.push({
          id: `${i}-${j}`,
          centroid,
          elevation: null,
          landCover: null,
          cost: null
        })
      }
    }

    // Initialize progress totals
    elevationProgress.value.total = locations.length
    landCoverProgress.value.total = locations.length

    // Fetch elevation for all locations
    let elevationResults = []
    isLoadingElevation.value = true
    currentPhase.value = 'elevation'
    try {
      elevationResults = await fetchElevationsInBatches(locations, 10, (completed, total) => {
        elevationProgress.value = { completed, total }
      })
    } catch (e) {
      console.error('Error fetching elevation data:', e)
      isLoadingElevation.value = false
      currentPhase.value = ''
      return
    }
    isLoadingElevation.value = false

    // Filter locations that have valid elevation data
    const validLocations = []
    const validIndices = []
    for (let i = 0; i < locations.length; i++) {
      if (elevationResults[i] && elevationResults[i].elevation !== 0) {
        validLocations.push(locations[i])
        validIndices.push(i)
      }
    }

    // Update land cover progress total to only count valid locations
    landCoverProgress.value.total = validLocations.length

    // Fetch land cover data in batches
    isLoadingLandCover.value = true
    currentPhase.value = 'landcover'
    try {
      const landCoverResults = await fetchLandCoverInBatches(
        validLocations,
        10,
        (completed, total) => {
          landCoverProgress.value = { completed, total }
        }
      )

      // Assign results to grid cells
      for (let i = 0; i < validIndices.length; i++) {
        const gridIndex = validIndices[i]
        grid.value[gridIndex].elevation = elevationResults[gridIndex].elevation
        grid.value[gridIndex].landCover = landCoverResults[i]
      }
    } catch (e) {
      console.error('Error fetching land cover data:', e)
      isLoadingLandCover.value = false
      currentPhase.value = ''
      return
    }
    isLoadingLandCover.value = false

    // remove all grid cells where either elevation or land cover is null or zero
    grid.value = grid.value.filter((cell) => cell.elevation && cell.landCover)

    // calculate total cost for grid
    currentPhase.value = 'calculating'
    focalOpElevation(grid)

    // save grid to cache
    cachedGrid.value = grid.value

    isGridGenerated.value = true
    currentPhase.value = ''
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
    generateGrid
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
