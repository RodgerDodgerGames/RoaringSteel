import { useCostCalculator } from './useTrackCost'
import { ref } from 'vue'
import * as turf from '@turf/turf'

export function useTrack(map, townsLayer) {
  const { queryLandCoverAPI, queryElevationAPI, calculateCost } = useCostCalculator()

  const currentPath = ref([]) // Store the current path being drawn
  const currentCost = ref(0) // Store the cumulative cost of the path
  const controlsVisible = ref(false) // Track visibility of drawing controls
  const drawingActive = ref(false) // Track if drawing is currently active
  let tooltip = null // Tooltip to follow the cursor
  let totalDistance = 0 // Track total distance for 1 km sampling
  let lastSampledPoint = null // Keep track of the last point that was sampled

  // Toggle the visibility of the drawing controls
  const toggleControls = () => {
    controlsVisible.value = !controlsVisible.value
    if (controlsVisible.value) {
      console.log('Drawing tools are now visible')
    } else {
      console.log('Drawing tools are now hidden')
    }
  }

  // Enable drawing mode when a marker is clicked, but only if drawing is already active
  townsLayer.value.eachLayer((layer) => {
    layer.on('click', (e) => {
      // Only allow drawing if the drawing controls are visible and drawingActive is true
      if (controlsVisible.value && drawingActive.value) {
        // Start drawing a line from the marker's location
        map.value.pm.Draw.Line._createVertex(e.latlng)
      }
    })
  })

  // Function to calculate distance between two points
  const calculateDistance = (pointA, pointB) => {
    return turf.distance(turf.point(pointA), turf.point(pointB), { units: 'kilometers' })
  }

  // Function to update the cost along the path, called after every 1km movement
  const updateCost = async () => {
    if (currentPath.value.length < 2) return

    const lastPoint = currentPath.value[currentPath.value.length - 1]
    const [lon, lat] = lastPoint

    const landCover = await queryLandCoverAPI(lat, lon)
    const elevation = await queryElevationAPI(lat, lon)

    if (lastSampledPoint) {
      const previousElevation = await queryElevationAPI(lastSampledPoint[1], lastSampledPoint[0])
      const cost = calculateCost(previousElevation, elevation, landCover)
      currentCost.value += cost
    }

    // Update last sampled point
    lastSampledPoint = lastPoint
    console.log(`Cost updated to: ${currentCost.value}`)
  }

  const initializeTracking = () => {
    if (!map.value) {
      console.error('Map instance is not available')
      return
    }

    // Initialize Leaflet Geoman controls
    map.value.pm.addControls({
      position: 'topleft',
      drawMarker: false,
      drawPolygon: false,
      drawCircle: false,
      drawRectangle: false,
      drawCircleMarker: false,
      editMode: true,
      dragMode: true,
      cutPolygon: false,
      removalMode: true
    })

    // Start drawing event
    map.value.on('pm:drawstart', (e) => {
      if (e.shape === 'Line') {
        drawingActive.value = true // Mark drawing as active
        currentPath.value = [] // Reset the path
        currentCost.value = 0 // Reset the cost
        totalDistance = 0 // Reset distance
        lastSampledPoint = null // Reset last sampled point

        tooltip = L.popup({
          closeButton: false,
          className: 'cost-tooltip'
        })

        console.log('Starting new path, cost reset to 0')
      }
    })

    // Event for adding a vertex
    map.value.on('pm:vertexadded', (e) => {
      if (e.shape === 'Line') {
        const latlng = e.marker.getLatLng()
        const [lon, lat] = [latlng.lng, latlng.lat]

        currentPath.value.push([lon, lat])

        if (!lastSampledPoint) {
          lastSampledPoint = [lon, lat] // Set first sampled point
        }
      }
    })

    // Handle dragging the line or vertices
    map.value.on('pm:drag', async (e) => {
      if (drawingActive.value && currentPath.value.length > 1) {
        const newPath = e.layer.getLatLngs().map((latlng) => [latlng.lng, latlng.lat])

        currentPath.value = newPath // Update path with new position

        // Calculate the distance from the last sampled point to the current point
        const lastPoint = newPath[newPath.length - 1]
        const distanceMoved = calculateDistance(lastSampledPoint, lastPoint)

        // If the distance exceeds 1 km, update the cost
        if (distanceMoved >= 1) {
          await updateCost()
          totalDistance = 0 // Reset the distance tracker
        }
      }
    })

    // End of drawing event
    map.value.on('pm:drawend', (e) => {
      if (e.shape === 'Line' && tooltip) {
        map.value.closePopup(tooltip)
        tooltip = null
        drawingActive.value = false // Mark drawing as inactive
        console.log(`Final cost for the path: ${currentCost.value}`)
      }
    })

    // Track the mouse movement to update the tooltip position with the current cost
    map.value.on('mousemove', (e) => {
      if (tooltip) {
        tooltip.setLatLng(e.latlng).setContent(`Current Cost: ${currentCost.value.toFixed(2)}`)

        if (!tooltip.isOpen()) {
          tooltip.openOn(map.value)
        }
      }
    })
  }

  return {
    initializeTracking,
    currentCost, // Expose currentCost for debugging or other purposes
    toggleControls, // Expose the toggle function
    controlsVisible, // Expose visibility of controls
    drawingActive // Expose whether drawing is active
  }
}
