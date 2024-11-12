// grid cost generator store
// generates grid of locations and calculates cost based on elevation and land cover

import { defineStore } from 'pinia'
import { ref } from 'vue'

// composables
import { useLocalStorage } from '@vueuse/core'
import { useElevationAPI } from '../composables/setup/useElevationAPI'
import { useLandCoverAPI } from '../composables/setup/useLandCoverAPI'
import {
  metersToLatitudeDegrees,
  metersToLongitudeDegrees
} from '../composables/setup/useMapSupport'
import { waitRandomly } from '@/composables/utils'

export const useGridStore = defineStore('gridStore', () => {
  const grid = ref([])
  const isGridGenerated = ref(false)
  const { fetchElevationsInBatches } = useElevationAPI()
  const { fetchLandCover } = useLandCoverAPI()

  async function generateGrid(stateFipsCode, bounds, cellSize) {
    console.log('Generating grid...')

    // `useLocalStorage` automatically binds `grid` to `localStorage`
    const cachedGrid = useLocalStorage(`cachedGrid_${stateFipsCode}`, [])

    // check if grid already exists in cache
    if (cachedGrid.value.length > 0) {
      grid.value = cachedGrid.value
      isGridGenerated.value = true
      console.log('Using cached grid data.')
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

    console.log(`Grid bounds: ${bounds[0]}, ${bounds[1]}, ${bounds[2]}, ${bounds[3]}`)
    console.log(`Grid dimensions: ${rows} rows x ${cols} cols`)
    console.log(`Grid cell size: ${cellSize} meters`)

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
          elevation: null, // To be filled later
          landCover: null, // To be filled later
          cost: null // To be calculated
        })
      }
    }

    // Fetch elevation for all locations
    const elevationResults = await fetchElevationsInBatches(locations, 10)

    // Fetch land cover data for each grid cell
    for (let index = 0; index < locations.length; index++) {
      // if the elevation for a location is null or zero, skip it
      if (!elevationResults[index] || elevationResults[index].elevation === 0) {
        continue
      }

      const location = locations[index]
      const landCoverCost = await fetchLandCover(location)

      // wait for a random amount of time to avoid overloading the API
      await waitRandomly(200, 2000)

      grid.value[index].elevation = elevationResults[index].elevation
      grid.value[index].landCover = landCoverCost

      console.log(
        `Assigned elevation ${grid.value[index].elevation} and land cover ${grid.value[index].landCover} to cell ${grid.value[index].id}`
      )
    }

    // remove all grid cells where either elevation or land cover is null or zero
    grid.value = grid.value.filter((cell) => cell.elevation && cell.landCover)

    // calculate total cost for grid
    focalOpElevation(grid)

    // save grid to cache
    cachedGrid.value = grid.value

    isGridGenerated.value = true
    console.log('Grid generation with elevation and land cover complete.')
    console.log('Grid:', grid.value)
  }

  return {
    grid,
    isGridGenerated,
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

      const [row, col] = cell.id.split('-').map(Number) // Get row and col from id
      let elevationCost = 0

      // Check neighbors in a 3x3 window
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue // Skip the target cell itself

          // Get the id of the neighboring cell
          const neighborId = `${row + dr}-${col + dc}`

          // Look up the neighboring cell in the cell map
          const neighborCell = cellMap[neighborId]

          if (neighborCell) {
            // Calculate elevation difference with the neighboring cell
            elevationCost += Math.abs(cell.elevation - neighborCell.elevation)
          }
        }
      }

      // Calculate total cost and update the cell directly
      cell.cost = elevationCost + cell.landCover

      console.log(
        `Calculated cost for cell ${cell.id}: landcover ${cell.landCover}, elevation ${elevationCost}`
      )
    })
  }
})
