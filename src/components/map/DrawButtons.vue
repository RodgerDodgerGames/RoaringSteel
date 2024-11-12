<script setup>
import { ref, onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useGridStore } from '@/stores/grid'
import { formatCurrency } from '@/composables/utils'

// Props for map and towns objects
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

// Store references for reactive state and grid data
const gridStore = useGridStore()
const { grid } = storeToRefs(gridStore)

// Reactive state variables
const drawingActive = ref(false)
const currentGridCellId = ref(null)
const existingLineLayers = ref([])
const itemizedCosts = ref([]) // Cost for each line section
const runningCost = ref(0) // Running cost of the line being drawn
const workingLayer = ref(null)
const hintMarkerMoveHandler = ref(null)
const cursorAllowed = ref(false) // NEW: Track if cursor is over an eligible start point

// Computed properties for total cost and draw button text
const totalCost = computed(() => itemizedCosts.value.reduce((acc, cost) => acc + cost, 0))
const drawButtonMessage = computed(() => (drawingActive.value ? 'Save' : 'Draw'))

// ================== EVENT HANDLERS ==================

// Initialize town markers and map events on mount
onMounted(() => {
  initializeTownMarkers()
  initializeMapEvents()
  setupCursorValidation()
  setGeomanOptions()
})

// Toggle draw mode
function onDrawButtonClicked() {
  drawingActive.value ? cancelDrawing() : startDrawingLine()
}

// Enable map's global removal mode
function enableRemoveMode() {
  props.map.value.pm.toggleGlobalRemovalMode()
}

// Enable edit mode on existing layers
function enableEditing() {
  props.map.value.eachLayer((layer) => {
    if (layer.pm?.toggleEdit) layer.pm.toggleEdit()
  })
}

// ================== DRAWING CONTROL FUNCTIONS ==================

// Start drawing mode for creating lines
function startDrawingLine() {
  props.map.value.pm.enableDraw('Line')
  drawingActive.value = true
  resetLineTracking()
}

// Cancel drawing mode and reset state
function cancelDrawing() {
  props.map.value.pm.disableDraw('Line')
  drawingActive.value = false
  workingLayer.value = null
}

// ================== COST CALCULATION ==================

// Track running cost and update tooltip
function updateRunningCostTooltip(latlng, hintMarker) {
  const cell = getGridCellByLatLng(latlng)
  if (cell && cell.id !== currentGridCellId.value && cell.cost !== null) {
    currentGridCellId.value = cell.id
    runningCost.value += cell.cost
    hintMarker.setTooltipContent(`Cost: ${formatCurrency(runningCost.value)}`)
  }
}

// Calculate cost for each line segment
function calculateSegmentCost() {
  // add the running cost to the list of itemized costs
  itemizedCosts.value.push(runningCost.value)
  // reset the running cost
  runningCost.value = 0
}

// ================== MAP & MARKER SETUP ==================

// Attach click events to town markers for line start validation
function initializeTownMarkers() {
  props.towns.value.eachLayer((layer) => {
    layer.on('click', (e) => {
      if (drawingActive.value) {
        props.map.value.pm.Draw.Line._createVertex(e.latlng)
      }
    })
  })
}

// Initialize drawing events on the map
function initializeMapEvents() {
  props.map.value.on('pm:drawstart', ({ workingLayer: layer }) => {
    workingLayer.value = layer
    setupDrawingEvents()
  })

  props.map.value.on('pm:create', finalizeDrawing)
}

// Set up vertex addition and hint marker events during drawing
// This function is called whenever a vertex is added to a line
// during drawing. It is responsible for:
// 1. Validating the starting point of the line
// 2. Adding the hint marker that shows the running cost of the line
// 3. Calculating the cost of each segment of the line
function setupDrawingEvents() {
  // Flag to track whether the first vertex has been added
  let firstVertexAdded = false
  // Store the previous vertex for calculating segment costs
  let previousVertex = null

  // Event handler for when a vertex is added
  workingLayer.value.on('pm:vertexadded', (evt) => {
    // If the first vertex, validate that it is a town or endpoint
    if (!firstVertexAdded) {
      // If the first vertex is invalid, cancel drawing
      if (!validateStartPoint(evt.latlng)) {
        cancelDrawing()
        alert('Start the line at a town marker or an existing endpoint.')
      } else {
        // Otherwise, store the vertex and add the hint marker
        previousVertex = evt.latlng
        firstVertexAdded = true
        addHintMarkerMoveHandler()
      }
    } else {
      // For each subsequent vertex, calculate the cost of the segment
      calculateSegmentCost()
      // Update the previous vertex for the next segment
      previousVertex = evt.latlng
    }
  })
}

// Finalize drawing by clearing temporary variables and saving the layer
function finalizeDrawing(e) {
  drawingActive.value = false
  if (e.layer?.pm?._shape === 'Line') {
    existingLineLayers.value.push(e.layer)
  }
  resetHintMarkerMoveHandler()
  workingLayer.value = null
}

// Add event handler to update running cost on hint marker movement
function addHintMarkerMoveHandler() {
  const hintMarker = props.map.value.pm.Draw.Line._hintMarker
  if (hintMarker && !hintMarkerMoveHandler.value) {
    hintMarkerMoveHandler.value = (e) => updateRunningCostTooltip(e.latlng, hintMarker)
    hintMarker.on('move', hintMarkerMoveHandler.value)
  }
}

// Remove hint marker movement handler after drawing completion
function resetHintMarkerMoveHandler() {
  const hintMarker = props.map.value.pm.Draw.Line._hintMarker
  if (hintMarker && hintMarkerMoveHandler.value) {
    hintMarker.off('move', hintMarkerMoveHandler.value)
    hintMarkerMoveHandler.value = null
  }
}

// ================== UTILITIES ==================

// Find the closest grid cell based on a lat/lng position
function getGridCellByLatLng(latlng) {
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

// Reset line-related tracking variables
function resetLineTracking() {
  currentGridCellId.value = null
  runningCost.value = 0
  itemizedCosts.value = []
}

// Validate if the starting point is on a town marker or line endpoint
function validateStartPoint(latlng) {
  const isAtTownMarker = props.towns.value
    .getLayers()
    .some((marker) => marker.getLatLng().equals(latlng))
  const isAtLineEnd = existingLineLayers.value.some((line) => {
    const linePoints = line.getLatLngs()
    return linePoints[0].equals(latlng) || linePoints[linePoints.length - 1].equals(latlng)
  })
  return isAtTownMarker || isAtLineEnd
}

function setupCursorValidation() {
  props.map.value.on('mousemove', (e) => {
    // check if drawing is active first
    if (!drawingActive.value) return
    if (validateStartPoint(e.latlng)) {
      cursorAllowed.value = true
      props.map.value.getContainer().style.cursor = 'default' // or another allowed cursor icon
    } else {
      cursorAllowed.value = false
      props.map.value.getContainer().style.cursor = 'not-allowed'
    }
  })
}

function setGeomanOptions() {
  // Set default tooltip text for drawing
  props.map.value.pm.setLang('en', {
    tooltips: {
      placeMarker: 'Place your marker here!',
      firstVertex: 'Track must start in a town or on existing track',
      continueLine: '',
      finishLine: 'Click to finish the track'
    }
  })

  const drawOptions = {
    snappable: true,
    snapDistance: 50,
    // requireSnapToFinish: true,
    // cursorMarker: false
    markerStyle: {
      // Default style for markers
      draggable: true,
      color: 'red'
    },
    pathOptions: {
      // Default style for lines and polygons
      color: 'blue',
      fillColor: 'blue',
      fillOpacity: 0.4,
      weight: 3
    }
  }

  props.map.value.pm.setGlobalOptions(drawOptions)
}
</script>

<template>
  <div class="panel-block">
    <div class="buttons">
      <button
        :class="[drawingActive ? 'is-success' : 'is-primary', 'button']"
        @click="onDrawButtonClicked"
      >
        {{ drawButtonMessage }}
      </button>
      <button class="button is-danger" @click="enableRemoveMode">Remove</button>
      <button class="button is-info" @click="enableEditing">Edit</button>
    </div>
  </div>
  <div class="panel-block" v-if="itemizedCosts.length">
    <div class="mt-2">
      <div
        v-for="(cost, index) in itemizedCosts"
        :key="index"
        class="is-flex is-justify-content-space-between"
      >
        <span>Section {{ index + 1 }}</span>
        <span>{{ formatCurrency(cost) }}</span>
      </div>
      <hr class="mt-3 mb-3" />
      <div class="is-flex is-justify-content-space-between has-text-weight-bold">
        Total Cost: {{ formatCurrency(totalCost) }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.buttons {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}
</style>
