<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useGridStore } from '@/stores/grid'

const props = defineProps({
  map: {
    type: Object,
    required: true
  },
  towns: {
    type: Object,
    required: true
  }
})

// get grid data from store
const gridStore = useGridStore()
const { grid } = storeToRefs(gridStore)

const existingLineLayer = ref([])
const runningCostTotal = ref(0)
const currentGridCellId = ref(null)
const drawingActive = ref(false)
const hintMarkerMoveHandler = ref(null)
const workingLayer = ref(null)

// COMPUTED

// Compute the grid data as a dictionary for faster lookups by `id`
const gridCellsById = computed(() => {
  return Object.fromEntries(grid.value.map((cell) => [cell.id, cell]))
})

// draw button message
const drawButtonMessage = computed(() => (drawingActive.value ? 'Cancel' : 'Draw'))

// EVENT LISTENERS

// draw button clicked
function onDrawButtonClicked() {
  // if drawing is active, cancel
  if (drawingActive.value) {
    cancelDrawing()
  }

  // if it's not active, start drawing
  else {
    startDrawingLine()
  }
}

// Helper to find the closest grid cell based on lat/lng
const getGridCellByLatLng = (latlng) => {
  let closestCell = null
  let minDistance = Infinity

  grid.value.forEach((cell) => {
    const dist = props.map.value.distance(latlng, L.latLng(cell.centroid.lat, cell.centroid.lng))
    if (dist < minDistance) {
      minDistance = dist
      closestCell = cell
    }
  })

  return closestCell
}

// Initialize drawing controls and event listeners on mounted
onMounted(() => {
  // Set up town markers for line drawing
  props.towns.value.eachLayer((layer) => {
    layer.on('click', (e) => {
      if (drawingActive.value) {
        props.map.value.pm.Draw.Line._createVertex(e.latlng)
      }
    })
  })

  // Set up event listener for line drawing
  props.map.value.on('pm:drawstart', ({ workingLayer: layer }) => {
    workingLayer.value = layer // Set the current drawing layer
    let firstVertexAdded = false // Flag to track the first vertex validation

    // Reset tracking variables
    currentGridCellId.value = null
    runningCostTotal.value = 0
    drawingActive.value = true

    // Attach event to check the first vertex location
    workingLayer.value.on('pm:vertexadded', ({ latlng }) => {
      if (!firstVertexAdded) {
        // Validate the starting point only for the first vertex
        if (!validateStartPoint(latlng)) {
          // Invalid starting point: cancel drawing
          props.map.value.pm.disableDraw('Line')
          alert('You must start your line at an existing track endpoint or town marker.')
          workingLayer.value = null
        } else {
          // Start tracking hint marker movement only if start is valid
          const hintMarker = props.map.value.pm.Draw.Line._hintMarker
          if (hintMarker && !hintMarkerMoveHandler.value) {
            hintMarkerMoveHandler.value = (e) => {
              const latlng = e.latlng
              const cell = getGridCellByLatLng(latlng)

              if (cell && cell.id !== currentGridCellId.value) {
                currentGridCellId.value = cell.id
                console.log(`new cell: ${cell.id}, elev: ${cell.elevation}, lc: ${cell.landCover}`)
                if (cell.cost !== null) {
                  runningCostTotal.value += cell.cost
                }
              }
            }
            hintMarker.on('move', hintMarkerMoveHandler.value)
          }
          firstVertexAdded = true // Mark the first vertex as validated
        }
      }
    })
  })

  props.map.value.on('pm:create', (e) => {
    drawingActive.value = false
    if (e.layer && e.layer.pm._shape === 'Line') {
      existingLineLayer.value.push(e.layer)
    }

    // Remove hint marker event listener and clear workingLayer
    if (hintMarkerMoveHandler.value) {
      const hintMarker = props.map.value.pm.Draw.Line._hintMarker
      if (hintMarker) {
        hintMarker.off('move', hintMarkerMoveHandler.value)
      }
      hintMarkerMoveHandler.value = null
    }
    workingLayer.value = null
  })
})

// Start drawing line with cost calculation
const startDrawingLine = () => {
  props.map.value.pm.enableDraw('Line', {
    snappable: true,
    snapDistance: 20
  })
}

// Cancel drawing mode
const cancelDrawing = () => {
  props.map.value.pm.disableDraw('Line')
  drawingActive.value = false
  workingLayer.value = null
}

// Enable removal mode
const enableRemoveMode = () => {
  props.map.value.pm.toggleGlobalRemovalMode()
}

// Enable edit mode
const enableEditing = () => {
  props.map.value.eachLayer((layer) => {
    if (layer.pm && layer.pm.toggleEdit) {
      layer.pm.toggleEdit()
    }
  })
}

const validateStartPoint = (latlng) => {
  // Check if the starting point is a town marker
  const isStartingAtMarker = props.towns.value
    .getLayers()
    .some((marker) => marker.getLatLng().equals(latlng))

  // Check if the starting point is an endpoint of any existing line
  const isStartingAtLineEnd = existingLineLayer.value.some((line) => {
    const linePoints = line.getLatLngs()
    return linePoints[0].equals(latlng) || linePoints[linePoints.length - 1].equals(latlng)
  })

  return isStartingAtMarker || isStartingAtLineEnd
}
</script>

<template>
  <div class="buttons">
    <button class="button is-primary" @click="onDrawButtonClicked">{{ drawButtonMessage }}</button>
    <button class="button is-danger" @click="enableRemoveMode">Remove</button>
    <button class="button is-info" @click="enableEditing">Edit</button>
    <div>Running Cost Total: {{ runningCostTotal }}</div>
  </div>
</template>

<style scoped>
.buttons {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}
</style>
