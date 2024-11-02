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
  props.map.value.on('pm:drawstart', ({ workingLayer }) => {
    currentGridCellId.value = null
    runningCostTotal.value = 0 // Reset cost at start of new line
    drawingActive.value = true

    // Listen for the first vertex added to enable hint marker tracking
    workingLayer.on('pm:vertexadded', ({ latlng }) => {
      if (!hintMarkerMoveHandler.value) {
        const hintMarker = props.map.value.pm.Draw.Line._hintMarker
        if (hintMarker) {
          hintMarkerMoveHandler.value = (e) => {
            const latlng = e.latlng
            const cell = getGridCellByLatLng(latlng)

            if (cell && cell.id !== currentGridCellId.value) {
              currentGridCellId.value = cell.id
              if (cell.cost !== null) {
                runningCostTotal.value += cell.cost
              }
            }
          }
          hintMarker.on('move', hintMarkerMoveHandler.value)
        }
      }
    })
  })

  props.map.value.on('pm:create', (e) => {
    drawingActive.value = false

    // Remove the hint marker move handler when drawing is finished
    if (hintMarkerMoveHandler.value) {
      const hintMarker = props.map.value.pm.Draw.Line._hintMarker
      if (hintMarker) {
        hintMarker.off('move', hintMarkerMoveHandler.value)
      }
      hintMarkerMoveHandler.value = null
    }
  })
})

// Start drawing line with cost calculation
const startDrawingLine = () => {
  props.map.value.pm.enableDraw('Line', {
    snappable: true,
    snapDistance: 20
  })
}

// Validate if line starts at a marker or endpoint
const validateStartPoint = (lineLayer) => {
  const startLatLng = lineLayer.getLatLngs()[0]

  const isStartingAtMarker = props.towns
    .getLayers()
    .some((marker) => marker.getLatLng().equals(startLatLng))

  const isStartingAtLineEnd = existingLineLayer.value.some((line) => {
    const linePoints = line.getLatLngs()
    return (
      linePoints[0].equals(startLatLng) || linePoints[linePoints.length - 1].equals(startLatLng)
    )
  })

  return isStartingAtMarker || isStartingAtLineEnd
}

// Cancel drawing mode
const cancelDrawing = () => {
  props.map.value.pm.disableDraw('Line')
  drawingActive.value = false
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
