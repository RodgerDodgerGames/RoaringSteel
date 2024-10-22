export function useCostCalculator() {
  // Generic API query function to fetch land cover and elevation data
  const queryAPI = async (type, lat, lon) => {
    const urlMap = {
      landcover: `https://landcover-api.example.com?lat=${lat}&lon=${lon}`,
      elevation: `https://elevation-api.example.com?lat=${lat}&lon=${lon}`
    }

    try {
      const response = await fetch(urlMap[type])
      const data = await response.json()
      return type === 'landcover' ? data.land_cover : data.elevation
    } catch (error) {
      console.error(`Failed to query ${type} API for coordinates [${lat}, ${lon}]`, error)
      return null
    }
  }

  // Query land cover API
  const queryLandCoverAPI = (lat, lon) => queryAPI('landcover', lat, lon)

  // Query elevation API
  const queryElevationAPI = (lat, lon) => queryAPI('elevation', lat, lon)

  // Calculate cost based on elevation and land cover
  const calculateCost = (previousElevation, currentElevation, landCover) => {
    const elevationCost = Math.abs(currentElevation - previousElevation) // Elevation change cost

    // Example land cover costs (customize as needed)
    const landCoverCostMap = {
      forest: 10,
      water: 50,
      grassland: 5,
      urban: 20
    }

    const landCoverCost = landCoverCostMap[landCover] || 1 // Default cost if land cover is unknown
    return elevationCost + landCoverCost // Total cost is elevation change + land cover cost
  }

  return {
    calculateCost,
    queryLandCoverAPI,
    queryElevationAPI
  }
}
