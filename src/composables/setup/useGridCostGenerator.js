// grid cost generator
// generates grid of locations and calculates cost based on elevation and land cover

import { ref } from 'vue'
import { useElevationAPI } from './useElevationAPI'
import { useLandCoverAPI } from './useLandCoverAPI'

export function useGridCostGenerator() {
  const grid = ref([])
  const isGridGenerated = ref(false)
  const { fetchElevationsInBatches } = useElevationAPI()
  const { fetchLandCover } = useLandCoverAPI()

  async function generateGrid(bounds, cellSize) {
    console.log('Generating grid...')

    const rows = Math.floor((bounds.maxLat - bounds.minLat) / cellSize)
    const cols = Math.floor((bounds.maxLng - bounds.minLng) / cellSize)
    const locations = []

    // Loop through the grid and prepare location data for elevation and land cover
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const centroid = {
          lat: bounds.minLat + (i + 0.5) * cellSize,
          lng: bounds.minLng + (j + 0.5) * cellSize
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
      const landCoverData = await fetchLandCover(location)

      // Extract land cover value from the response
      const landCoverValue = landCoverData.features[0]?.properties?.land_cover_value || 0

      grid.value[index].elevation = elevationResults[index].elevation
      grid.value[index].landCover = landCoverValue

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
