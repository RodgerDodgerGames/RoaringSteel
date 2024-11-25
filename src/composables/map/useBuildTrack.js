// useBuildTrack.js
// Vue composable for handling map drawing and cost calculation logic
// Organizes and manages all drawing-related logic, including setup, drawing controls, cost calculations, and utility functions.

import { ref, computed, onMounted } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { useMapStore } from '@/stores/map'

/**
 * Main composable function to handle map drawing logic
 * @param {Object} props - The component props (map, towns)
 * @param {Object} grid - Reactive grid data for cell-based calculations
 * @param {Function} formatCurrency - Utility function to format currency values
 * @returns {Object} - Exposes reactive state, computed properties, and functions for map drawing
 */
export default function useBuildTrack(props, grid, formatCurrency) {
  // ================== STATE VARIABLES ==================

  const itemizedCosts = ref([]) // Array to store individual segment costs
  const runningCost = ref(0) // Accumulator for the ongoing segment cost
  const workingLayer = ref(null) // Reference to the currently drawn line layer
  const hintMarkerMoveHandler = ref(null) // Handler for hint marker movement
  const existingLineLayers = ref([]) // Store for completed line layers
  const currentGridCellId = ref(null) // ID of the current grid cell for cost tracking
  const isFirstVertexAdded = ref(false) // Flag to track if the first vertex has been added

  // Caching town marker positions and endpoints for faster validation
  const townMarkerPositions = ref([])
  const lineEndpoints = ref([])

  // get access to isDrawingActive from map store
  const mapStore = useMapStore()
  const { isDrawingActive } = storeToRefs(mapStore)

  // ================== COMPUTED PROPERTIES ==================

  // total cost for all track segments
  const totalCost = computed(() => itemizedCosts.value.reduce((acc, cost) => acc + cost, 0))
  // has any track been drawn
  const hasTrackBeenDrawn = computed(() => existingLineLayers.value.length > 0)

  // ================== INITIAL SETUP ==================

  /**
   * onMounted hook: Initializes map and marker events and sets default options.
   */
  onMounted(() => {
    initializeTownMarkers() // Set up events for clickable town markers
    initializeMapEvents() // Set up general drawing events on the map
    setupCursorValidation() // Enable cursor validation during drawing
    setGeomanOptions() // Configure Geoman drawing tool options
    initializeCaches() // Initialize town marker and line endpoint caches
  })

  // ================== PUBLIC FUNCTIONS (EXPOSED) ==================

  /**
   * Enables removal mode for deleting map elements.
   */
  function enableRemoveMode() {
    props.map.pm.toggleGlobalRemovalMode()
  }

  /**
   * Enables edit mode for modifying existing lines.
   */
  function enableEditing() {
    props.map.eachLayer((layer) => {
      if (layer.pm?.toggleEdit) layer.pm.toggleEdit()
    })
  }

  // ================== DRAWING CONTROL FUNCTIONS ==================

  /**
   * Initiates line drawing mode on the map.
   */
  function startDrawingLine() {
    props.map.pm.enableDraw('Line')
    mapStore.setIsDrawingActive(true)
    resetLineTracking()
  }

  /**
   * Cancels line drawing mode and resets state.
   */
  function cancelDrawing() {
    props.map.pm.disableDraw('Line')
    mapStore.setIsDrawingActive(false)
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
    props.towns.value.eachLayer((layer) => {
      layer.on('click', (e) => {
        if (isDrawingActive.value) {
          props.map.pm.Draw.Line._createVertex(e.latlng)
        }
      })
    })
  }

  /**
   * Sets up map-wide drawing events, including starting and completing a line.
   */
  function initializeMapEvents() {
    props.map.on('pm:drawstart', ({ workingLayer: layer }) => {
      workingLayer.value = layer
      setupDrawingEvents()
    })
    props.map.on('pm:create', finalizeDrawing)
  }

  function initializeCaches() {
    // Cache town marker positions
    townMarkerPositions.value = props.towns.value.getLayers().map((marker) => marker.getLatLng())

    // Cache initial line endpoints (assuming some existing lines)
    existingLineLayers.value.forEach((line) => {
      const linePoints = line.getLatLngs()
      lineEndpoints.value.push(linePoints[0], linePoints[linePoints.length - 1])
    })
  }

  // ================== DRAWING EVENT HANDLERS ==================

  /**
   * Sets up events for adding vertices and tracking segment costs.
   * This is activated whenever a line drawing starts.
   */
  function setupDrawingEvents() {
    let previousVertex = null // Store the last vertex for distance calculations
    // set (or reset) the first vertex added flag
    isFirstVertexAdded.value = false

    // Event triggered when a vertex is added to the line
    workingLayer.value.on('pm:vertexadded', (evt) => {
      if (!isFirstVertexAdded.value) {
        // Ensure the starting point is valid; otherwise, cancel drawing
        if (!validateStartPoint(evt.latlng)) {
          // cancel drawing and restarting again prevents the first vertex
          // from being added (or just removes it)
          cancelDrawing()
          startDrawingLine()
        } else {
          previousVertex = evt.latlng
          isFirstVertexAdded.value = true
          addHintMarkerMoveHandler() // Add movement handler for cost tooltip
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
    mapStore.setIsDrawingActive(false)
    if (e.layer?.pm?._shape === 'Line') {
      existingLineLayers.value.push(e.layer)
      updateLineEndpoints(e.layer)
    }
    resetHintMarkerMoveHandler()
    workingLayer.value = null
  }

  // ================== COST TRACKING & TOOLTIP ==================

  /**
   * Attaches a tooltip update handler to the hint marker to show running cost.
   */
  function addHintMarkerMoveHandler() {
    const hintMarker = props.map.pm.Draw.Line._hintMarker
    if (hintMarker && !hintMarkerMoveHandler.value) {
      hintMarkerMoveHandler.value = useDebounceFn(
        (e) => updateRunningCostTooltip(e.latlng, hintMarker),
        100
      ) // Throttle to reduce lag
      hintMarker.on('move', hintMarkerMoveHandler.value)
    }
  }

  /**
   * Detaches the tooltip update handler from the hint marker after drawing completion.
   */
  function resetHintMarkerMoveHandler() {
    const hintMarker = props.map.pm.Draw.Line._hintMarker
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
    grid.value.forEach((cell) => {
      const dist = props.map.distance(latlng, L.latLng(cell.centroid.lat, cell.centroid.lng))
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

  function validateStartPoint(latlng) {
    const isNearTownMarker = townMarkerPositions.value.some((markerPos) => markerPos.equals(latlng))
    const isNearLineEnd = lineEndpoints.value.some((endPoint) => endPoint.equals(latlng))
    return isNearTownMarker || isNearLineEnd
  }

  function updateLineEndpoints(lineLayer) {
    const linePoints = lineLayer.getLatLngs()
    lineEndpoints.value.push(linePoints[0], linePoints[linePoints.length - 1])
  }

  // ================== MAP OPTIONS & CURSOR SETUP ==================

  /**
   * Sets up cursor styles based on the validity of points during line drawing.
   */
  function setupCursorValidation() {
    const debouncedCursorValidation = useDebounceFn((latlng) => {
      const cursorStyle = validateStartPoint(latlng) ? 'default' : 'not-allowed'
      props.map.getContainer().style.cursor = cursorStyle
    }, 50) // Adjust debounce delay as needed

    props.map.on('mousemove', (e) => {
      // only update cursor when drawing is active but first vertex has not been added
      if (isDrawingActive.value && !isFirstVertexAdded.value) {
        debouncedCursorValidation(e.latlng)
      }
    })
  }

  /**
   * Configures Geoman global drawing options, including tooltips and snapping behavior.
   */
  function setGeomanOptions() {
    props.map.pm.setLang('en', {
      tooltips: {
        placeMarker: 'Place your marker here!',
        firstVertex: 'Track must start in a town or on existing track',
        continueLine: '',
        finishLine: 'Click to finish the track'
      }
    })

    props.map.pm.setGlobalOptions({
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
    hasTrackBeenDrawn,
    startDrawingLine,
    enableRemoveMode,
    enableEditing,
    cancelDrawing
  }
}
