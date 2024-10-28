// grid cost generator
// generates grid of locations and calculates cost based on elevation and land cover

import { ref } from 'vue'
import { useElevationAPI } from './useElevationAPI'
import { useLandCoverAPI } from './useLandCoverAPI'
import { metersToLatitudeDegrees, metersToLongitudeDegrees } from './useMapSupport'

export function useGridCostGenerator() {
  const grid = ref([])
  const isGridGenerated = ref(false)
  const { fetchElevationsInBatches } = useElevationAPI()
  const { fetchLandCover } = useLandCoverAPI()

  async function generateGrid(bounds, cellSize) {
    console.log('Generating grid...')

    // if mass_grid.json exists, use it
    // it is in public/data/mass_grid.json
    // try {
    //   const response = await fetch('/data/mass_grid.json')
    //   if (!response.ok) {
    //     throw new Error('Network response was not ok')
    //   }
    //   const massGrid = await response.json()
    //   grid.value = massGrid
    //   console.log('Loaded test data for Massachusetts:', grid.value)
    //   focalOpElevation(grid)
    //   isGridGenerated.value = true
    //   console.log('Grid generation with elevation and land cover complete.')
    // } catch (error) {
    //   console.error('Failed to load test data:', error)
    // }

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
    const elevationResults = await fetchElevationsInBatches(locations, 100)

    // Fetch land cover data for each grid cell
    for (let index = 0; index < locations.length; index++) {
      const location = locations[index]
      const landCoverCost = await fetchLandCover(location)

      grid.value[index].elevation = elevationResults[index].elevation
      grid.value[index].landCover = landCoverCost

      console.log(
        `Assigned elevation ${grid.value[index].elevation} and land cover ${grid.value[index].landCover} to cell ${grid.value[index].id}`
      )
    }

    isGridGenerated.value = true
    console.log('Grid generation with elevation and land cover complete.')
  }

  return {
    grid,
    isGridGenerated,
    generateGrid
  }
}
