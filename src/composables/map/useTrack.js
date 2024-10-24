import { ref, onUnmounted } from 'vue'
import * as L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import * as turf from '@turf/turf'

import { useCostCalculator } from './useTrackCost'

export function useTrack(map) {
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
    map.value.pm.toggleControls()
    if (controlsVisible.value) {
      console.log('Drawing tools are now visible')
    } else {
      console.log('Drawing tools are now hidden')
    }
  }

  onUnmounted(() => {
    if (map.value) {
      map.value.pm.removeControls()
    }
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

  const initializeTracking = (townsLayer) => {
    if (!townsLayer || !townsLayer.value) {
      // Check if townsLayer is available and initialized
      console.error('Towns layer is not available')
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

    // Hide controls initially
    map.value.pm.toggleControls()

    // Enable snapping
    map.value.pm.setGlobalOptions({
      snappable: true,
      snapDistance: 20
    })

    // Track the start of drawing and attach vertex listeners to the working layer
    map.value.on('pm:drawstart', ({ workingLayer }) => {
      if (workingLayer && workingLayer.pm._shape === 'Line') {
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

        // Track movement of the hint marker
        const hintMarker = map.value.pm.Draw.Line._hintMarker
        if (hintMarker) {
          hintMarker.on('move', async (e) => {
            const latlng = e.latlng
            const [lon, lat] = [latlng.lng, latlng.lat]

            // Add current position of hint marker to the path
            const lastPoint = currentPath.value[currentPath.value.length - 1] || [lon, lat]
            const distanceMoved = calculateDistance(lastPoint, [lon, lat])
            console.log('Moving hint marker', distanceMoved)

            // Update path if moved > 1 km
            if (distanceMoved >= 1) {
              currentPath.value.push([lon, lat])
              await updateCost()
            }
          })
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

    map.value.on('pm:create', (e) => {
      console.log('Layer created', e)
    })
  } // end of initializeTracking

  return {
    initializeTracking,
    currentCost, // Expose currentCost for debugging or other purposes
    toggleControls, // Expose the toggle function
    controlsVisible, // Expose visibility of controls
    drawingActive // Expose whether drawing is active
  }
}
