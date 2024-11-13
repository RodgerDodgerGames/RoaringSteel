// useBuildTrack.js
// Vue composable for handling map drawing and cost calculation logic
// Organizes and manages all drawing-related logic, including setup, drawing controls, cost calculations, and utility functions.

import { ref, computed, onMounted } from 'vue'

/**
 * Main composable function to handle map drawing logic
 * @param {Object} props - The component props (map, towns)
 * @param {Object} grid - Reactive grid data for cell-based calculations
 * @param {Ref} drawingActive - Ref indicating if drawing mode is active
 * @param {Function} formatCurrency - Utility function to format currency values
 * @returns {Object} - Exposes reactive state, computed properties, and functions for map drawing
 */
export default function useBuildTrack(props, grid, drawingActive, formatCurrency) {
  // ================== STATE VARIABLES ==================

  const itemizedCosts = ref([])            // Array to store individual segment costs
  const runningCost = ref(0)               // Accumulator for the ongoing segment cost
  const workingLayer = ref(null)           // Reference to the currently drawn line layer
  const hintMarkerMoveHandler = ref(null)  // Handler for hint marker movement
  const existingLineLayers = ref([])       // Store for completed line layers
  const currentGridCellId = ref(null)      // ID of the current grid cell for cost tracking

  // ================== COMPUTED PROPERTIES ==================

  const totalCost = computed(() => itemizedCosts.value.reduce((acc, cost) => acc + cost, 0))
  const drawButtonMessage = computed(() => (drawingActive.value ? 'Save' : 'Draw'))

  // ================== INITIAL SETUP ==================

  /**
   * onMounted hook: Initializes map and marker events and sets default options.
   */
  onMounted(() => {
    initializeTownMarkers()   // Set up events for clickable town markers
    initializeMapEvents()     // Set up general drawing events on the map
    setupCursorValidation()   // Enable cursor validation during drawing
    setGeomanOptions()        // Configure Geoman drawing tool options
  })

  // ================== PUBLIC FUNCTIONS (EXPOSED) ==================

  /**
   * Toggles drawing mode on button click.
   */
  function onDrawButtonClicked() {
    drawingActive.value ? cancelDrawing() : startDrawingLine()
  }

  /**
   * Enables removal mode for deleting map elements.
   */
  function enableRemoveMode() {
    props.map.value.pm.toggleGlobalRemovalMode()
  }

  /**
   * Enables edit mode for modifying existing lines.
   */
  function enableEditing() {
    props.map.value.eachLayer(layer => {
      if (layer.pm?.toggleEdit) layer.pm.toggleEdit()
    })
  }

  // ================== DRAWING CONTROL FUNCTIONS ==================

  /**
   * Initiates line drawing mode on the map.
   */
  function startDrawingLine() {
    props.map.value.pm.enableDraw('Line')
    drawingActive.value = true
    resetLineTracking()
  }

  /**
   * Cancels line drawing mode and resets state.
   */
  function cancelDrawing() {
    props.map.value.pm.disableDraw('Line')
    drawingActive.value = false
    workingLayer.value = null
  }

  /**
   * Calculates and stores the cost for the current line segment, then resets the running cost.
   */
  function calculateSegmentCost() {
    itemizedCosts.value.push(runningCost.value)
    runningCost.value = 0
  }

  // ================== MAP & MARKER INITIALIZATION ==================

  /**
   * Initializes town markers with click events for starting line drawing.
   * This allows starting a line from specific points (e.g., town markers).
   */
  function initializeTownMarkers() {
    props.towns.value.eachLayer(layer => {
      layer.on('click', e => {
        if (drawingActive.value) {
          props.map.value.pm.Draw.Line._createVertex(e.latlng)
        }
      })
    })
  }

  /**
   * Sets up map-wide drawing events, including starting and completing a line.
   */
  function initializeMapEvents() {
    props.map.value.on('pm:drawstart', ({ workingLayer: layer }) => {
      workingLayer.value = layer
      setupDrawingEvents()
    })
    props.map.value.on('pm:create', finalizeDrawing)
  }

  // ================== DRAWING EVENT HANDLERS ==================

  /**
   * Sets up events for adding vertices and tracking segment costs.
   * This is activated whenever a line drawing starts.
   */
  function setupDrawingEvents() {
    let firstVertexAdded = false          // Track if the first vertex has been added
    let previousVertex = null             // Store the last vertex for distance calculations

    // Event triggered when a vertex is added to the line
    workingLayer.value.on('pm:vertexadded', evt => {
      if (!firstVertexAdded) {
        // Ensure the starting point is valid; otherwise, cancel drawing
        if (!validateStartPoint(evt.latlng)) {
          cancelDrawing()
          alert('Start the line at a town marker or an existing endpoint.')
        } else {
          previousVertex = evt.latlng
          firstVertexAdded = true
          addHintMarkerMoveHandler()   // Add movement handler for cost tooltip
        }
      } else {
        // Calculate cost for each segment as a new vertex is added
        calculateSegmentCost()
        previousVertex = evt.latlng
      }
    })
  }

  /**
   * Finalizes the drawing process, stores the completed line, and cleans up temporary state.
   * @param {Object} e - Event object from Geoman with the created layer
   */
  function finalizeDrawing(e) {
    drawingActive.value = false
    if (e.layer?.pm?._shape === 'Line') {
      existingLineLayers.value.push(e.layer)
    }
    resetHintMarkerMoveHandler()
    workingLayer.value = null
  }

  // ================== COST TRACKING & TOOLTIP ==================

  /**
   * Attaches a tooltip update handler to the hint marker to show running cost.
   */
  function addHintMarkerMoveHandler() {
    const hintMarker = props.map.value.pm.Draw.Line._hintMarker
    if (hintMarker && !hintMarkerMoveHandler.value) {
      hintMarkerMoveHandler.value = e => updateRunningCostTooltip(e.latlng, hintMarker)
      hintMarker.on('move', hintMarkerMoveHandler.value)
    }
  }

  /**
   * Detaches the tooltip update handler from the hint marker after drawing completion.
   */
  function resetHintMarkerMoveHandler() {
    const hintMarker = props.map.value.pm.Draw.Line._hintMarker
    if (hintMarker && hintMarkerMoveHandler.value) {
      hintMarker.off('move', hintMarkerMoveHandler.value)
      hintMarkerMoveHandler.value = null
    }
  }

  /**
   * Updates the tooltip on the hint marker with the current running cost.
   * @param {Object} latlng - Latitude and longitude of the hint marker
   * @param {Object} hintMarker - The hint marker element to update
   */
  function updateRunningCostTooltip(latlng, hintMarker) {
    const cell = getGridCellByLatLng(latlng)
    if (cell && cell.id !== currentGridCellId.value && cell.cost !== null) {
      currentGridCellId.value = cell.id
      runningCost.value += cell.cost
      hintMarker.setTooltipContent(`Cost: ${formatCurrency(runningCost.value)}`)
    }
  }

  // ================== UTILITY FUNCTIONS ==================

  /**
   * Finds the closest grid cell based on a given latitude and longitude.
   * Used for cost calculations as vertices are added to the line.
   * @param {Object} latlng - Latitude and longitude of the point
   * @returns {Object|null} - The closest grid cell or null if none found
   */
  function getGridCellByLatLng(latlng) {
    let closestCell = null
    let minDistance = Infinity
    grid.value.forEach(cell => {
      const dist = props.map.value.distance(latlng, L.latLng(cell.centroid.lat, cell.centroid.lng))
      if (dist < minDistance) {
        minDistance = dist
        closestCell = cell
      }
    })
    return closestCell
  }

  /**
   * Resets variables tracking the state of the current line drawing.
   * Used when beginning or canceling a new drawing.
   */
  function resetLineTracking() {
    currentGridCellId.value = null
    runningCost.value = 0
    itemizedCosts.value = []
  }

  /**
   * Validates that the starting point is on a town marker or existing line endpoint.
   * Prevents drawing from invalid starting points.
   * @param {Object} latlng - Latitude and longitude of the starting point
   * @returns {boolean} - True if the starting point is valid, false otherwise
   */
  function validateStartPoint(latlng) {
    const isAtTownMarker = props.towns.value.getLayers().some(marker => marker.getLatLng().equals(latlng))
    const isAtLineEnd = existingLineLayers.value.some(line => {
      const linePoints = line.getLatLngs()
      return linePoints[0].equals(latlng) || linePoints[linePoints.length - 1].equals(latlng)
    })
    return isAtTownMarker || isAtLineEnd
  }

  // ================== MAP OPTIONS & CURSOR SETUP ==================

  /**
   * Sets up cursor styles based on the validity of points during line drawing.
   */
  function setupCursorValidation() {
    props.map.value.on('mousemove', e => {
      if (!drawingActive.value) return
      if (validateStartPoint(e.latlng)) {
        props.map.value.getContainer().style.cursor = 'default'
      } else {
        props.map.value.getContainer().style.cursor = 'not-allowed'
      }
    })
  }

  /**
   * Configures Geoman global drawing options, including tooltips and snapping behavior.
   */
  function setGeomanOptions() {
    props.map.value.pm.setLang('en', {
      tooltips: {
        placeMarker: 'Place your marker here!',
        firstVertex: 'Track must start in a town or on existing track',
        continueLine: '',
        finishLine: 'Click to finish the track'
      }
    })

    props.map.value.pm.setGlobalOptions({
      snappable: true,
      snapDistance: 50,
      markerStyle: { draggable: true, color: 'red' },
      pathOptions: { color: 'blue', fillColor: 'blue', fillOpacity: 0.4, weight: 3 }
    })
  }

  // ================== RETURN EXPOSED METHODS AND STATE ==================

  return {
    itemizedCosts,
    totalCost,
    drawButtonMessage,
    onDrawButtonClicked,
    enableRemoveMode,
    enableEditing
  }
}
