import { ref, onUnmounted } from 'vue'
import * as L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'

export function useDrawing(map) {
  const controlsVisible = ref(false)
  const drawingActive = ref(false)

  const initializeDrawing = (townsLayer) => {
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

    // Hide controls initially
    map.value.pm.toggleControls()

    // Enable snapping
    map.value.pm.setGlobalOptions({
      snappable: true,
      snapDistance: 20
    })

    // Track drawing state
    map.value.on('pm:drawstart', () => {
      drawingActive.value = true
    })

    map.value.on('pm:drawend', () => {
      drawingActive.value = false
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
  }

  const toggleControls = () => {
    if (map.value) {
      controlsVisible.value = !controlsVisible.value
      map.value.pm.toggleControls()
    }
  }

  onUnmounted(() => {
    if (map.value) {
      map.value.pm.removeControls()
    }
  })

  return {
    initializeDrawing,
    toggleControls,
    controlsVisible,
    drawingActive
  }
}
