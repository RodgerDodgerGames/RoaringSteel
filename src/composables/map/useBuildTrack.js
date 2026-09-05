// useBuildTrack.js
// Vue composable for handling map drawing and cost calculation logic
// Organizes and manages all drawing-related logic, including setup, drawing controls, cost calculations, and utility functions.

import { ref, computed, onMounted, watch, markRaw } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import L from 'leaflet'
import 'leaflet-textpath'
import { storeToRefs } from 'pinia'
import { useMapStore } from '@/stores/map'
import { usePlayerStore } from '@/stores/players'
import { useTrackStore } from '@/stores/track'
import { useGameStore } from '@/stores/game'

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
  const existingLineLayers = ref([]) // Leaflet layers for track drawn in this session
  const restoredLineLayers = ref([]) // Leaflet layers redrawn from a saved game
  const currentGridCellId = ref(null) // ID of the current grid cell for cost tracking
  const isFirstVertexAdded = ref(false) // Flag to track if the first vertex has been added

  // Caching town marker positions and endpoints for faster validation
  const townMarkerPositions = ref([])
  const lineEndpoints = ref([])

  // get access to isDrawingActive from map store
  const mapStore = useMapStore()
  const { isDrawingActive } = storeToRefs(mapStore)

  // the active player drives per-turn build state
  const playerStore = usePlayerStore()

  // completed track is game state, not a map layer, so it lives in its own store
  const trackStore = useTrackStore()
  const gameStore = useGameStore()

  // ================== COMPUTED PROPERTIES ==================

  // total cost for all track segments
  const totalCost = computed(() => itemizedCosts.value.reduce((acc, cost) => acc + cost, 0))
  // has any track been drawn
  const hasTrackBeenDrawn = computed(() => existingLineLayers.value.length > 0)

  // ================== TURN HANDLING ==================

  /**
   * Clear per-turn build state when play passes to another player, so the
   * cost panel shows what the *current* player has spent rather than an
   * ever-growing list. Any drawing left in progress is cancelled first.
   *
   * Completed track layers are deliberately left on the map; the segments
   * behind them are already recorded in the track store.
   */
  watch(
    () => playerStore.activePlayer?.id,
    () => {
      if (isDrawingActive.value) cancelDrawing()
      resetLineTracking()
    }
  )

  // ================== INITIAL SETUP ==================

  /**
   * onMounted hook: Initializes map and marker events and sets default options.
   */
  onMounted(() => {
    initializeTownMarkers() // Set up events for clickable town markers
    initializeMapEvents() // Set up general drawing events on the map
    setupCursorValidation() // Enable cursor validation during drawing
    setGeomanOptions() // Configure Geoman drawing tool options
    restoreTrackLayers() // Redraw track carried in from a saved game
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
    // Geoman's global removal and edit modes act on the layer, so the store has
    // to be told; without this the map and the rail network drift apart (#83).
    // Removal is re-fired on the map (`_fireRemove(this.map, layer)`) but an
    // edit is not — `_fireUpdate` only ever fires on the layer itself — so the
    // edit handler is bound per layer in `attachSegment` and `styleTracks`.
    props.map.on('pm:remove', handleLayerRemoved)
  }

  function initializeCaches() {
    // Cache town marker positions
    townMarkerPositions.value = props.towns.value.getLayers().map((marker) => marker.getLatLng())

    // Cache the endpoints of every line already on the map, so restored track
    // is a legal place to start building from
    rebuildLineEndpoints()
  }

  /**
   * Redraws the track held in the track store, so a loaded game comes back with
   * its rail network on the map.
   *
   * Restored layers are kept apart from `existingLineLayers` because that list
   * drives the "track you have built this turn" controls — loading a save is
   * not building.
   */
  function restoreTrackLayers() {
    trackStore.segments.forEach((segment) => {
      const latlngs = segment.coordinates.map((point) => L.latLng(point.lat, point.lng))
      const layer = L.polyline(latlngs).addTo(props.map)
      attachSegment(layer, segment.id)
      // markRaw: a Leaflet layer read back out of a reactive array comes back as
      // a proxy, and Geoman hands back the raw layer, so the two would never
      // compare equal and the cleanup filters below would never match
      restoredLineLayers.value.push(markRaw(layer))
      styleTracks(layer)
    })
  }

  // ================== DRAWING EVENT HANDLERS ==================

  /**
   * Sets up events for adding vertices and tracking segment costs.
   * This is activated whenever a line drawing starts.
   */
  function setupDrawingEvents() {
    let previousVertex = null // Store the last vertex for distance calculations
    isFirstVertexAdded.value = false // Reset flag for the first vertex

    workingLayer.value.on('pm:vertexadded', (evt) => {
      const addedVertex = evt.latlng // Get the position of the added vertex

      if (!isFirstVertexAdded.value) {
        if (!validateStartPoint(addedVertex)) {
          cancelDrawing() // Cancel if the start point is invalid
          startDrawingLine()
        } else {
          previousVertex = addedVertex
          isFirstVertexAdded.value = true
          addHintMarkerMoveHandler() // Add movement handler for cost tooltip
        }
      } else {
        // Calculate cost for the current segment
        calculateSegmentCost()
        previousVertex = addedVertex

        // Check if the added vertex is on a town marker
        const isOnTown = townMarkerPositions.value.some((townPos) => townPos.equals(addedVertex))
        // if so, then finish the drawing
        if (isOnTown) {
          props.map.pm.Draw.Line._finishShape()
        }
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
      // A line finished by double-clicking rather than by landing on a town
      // never fires a final `pm:vertexadded`, so the last leg is still sitting
      // in the accumulator. Flush it before the segment is priced.
      if (runningCost.value > 0) calculateSegmentCost()

      // Record before styling: the layer has to carry its segment id from the
      // moment it exists, or a removal cannot find what to un-record
      const segment = recordSegment(e.layer)
      if (!segment) {
        // Track that nothing owns and no save records is worse than no track at
        // all, so take it back off the map rather than leave a phantom line
        props.map.removeLayer(e.layer)
        resetHintMarkerMoveHandler()
        workingLayer.value = null
        return
      }

      attachSegment(e.layer, segment.id)
      existingLineLayers.value.push(markRaw(e.layer))
      updateLineEndpoints(e.layer)
      styleTracks(e.layer)
    }
    resetHintMarkerMoveHandler()
    workingLayer.value = null
  }

  /**
   * Writes a finished line into the track store as owned, priced game state.
   * @param {Object} layer - The completed Leaflet line layer
   * @returns {Object|null} The stored segment, or null if it was rejected
   */
  function recordSegment(layer) {
    const segment = trackStore.addSegment({
      ownerId: playerStore.activePlayer?.id,
      coordinates: layer.getLatLngs().map(({ lat, lng }) => ({ lat, lng })),
      cost: totalCost.value,
      turn: gameStore.turn
    })

    // Losing the segment silently would leave track on the map that no player
    // owns and no save records, so say so rather than carrying on quietly
    if (!segment) {
      console.error('Could not record track segment:', trackStore.error)
    }
    return segment
  }

  // ================== MAP / STORE SYNCHRONISATION ==================

  /**
   * Ties a Leaflet layer to the segment it draws, so a later removal or edit
   * can find what to change in the store.
   *
   * The edit handler is bound here rather than on the map because Geoman fires
   * `pm:update` on the layer alone — unlike `pm:remove`, it is never re-fired
   * on the map, so a map-level listener would never run.
   *
   * @param {Object} layer - The track layer
   * @param {number} segmentId - Id of the segment it draws
   */
  function attachSegment(layer, segmentId) {
    layer.segmentId = segmentId
    layer.on('pm:update', handleLayerEdited)
  }

  /**
   * Finds the track layer an event belongs to.
   *
   * The rails a player actually sees and drags are the styled decoration, not
   * the line itself — the line is set fully transparent by `styleTracks`. So an
   * event can arrive on either, and both have to lead back to the same segment.
   *
   * @param {Object} layer - The layer the Geoman event fired on
   * @returns {Object|null} The track layer carrying a segment id, if any
   */
  function resolveTrackLayer(layer) {
    if (!layer) return null
    if (layer.trackLayer) return layer.trackLayer
    // `!= null` rather than a truthiness check: a save can carry segment id 0
    return layer.segmentId != null ? layer : null
  }

  /**
   * Whether the active player is allowed to change this segment.
   *
   * Geoman's global modes offer up every track layer on the map, including
   * other players' and earlier turns'. That was harmless while removal was
   * cosmetic; now that it reaches the save, an unguarded removal would delete
   * another player's network permanently.
   *
   * @param {Object|undefined} segment - The segment behind the layer
   * @returns {boolean} True if the segment is the active player's, built this turn
   */
  function canModifySegment(segment) {
    if (!segment) return false
    return segment.ownerId === playerStore.activePlayer?.id && segment.turn === gameStore.turn
  }

  /**
   * Takes a removed layer out of the rail network, so a torn-up section stays
   * torn up after a reload.
   * @param {Object} e - Geoman removal event
   */
  function handleLayerRemoved(e) {
    const layer = resolveTrackLayer(e.layer)
    if (!layer) return

    const segment = trackStore.getSegment(layer.segmentId)
    if (!canModifySegment(segment)) {
      // Geoman has already taken it off the map, so put it back rather than
      // let the map lose track the store still holds
      redrawLayer(layer, segment)
      return
    }

    if (!trackStore.removeSegment(layer.segmentId)) {
      console.error('Could not remove track segment:', trackStore.error)
      redrawLayer(layer, segment)
      return
    }

    // The rails and the line are one piece of track to the player, so removing
    // either has to take the other off the map with it
    removeStyling(layer)
    if (props.map.hasLayer(layer)) props.map.removeLayer(layer)

    existingLineLayers.value = existingLineLayers.value.filter((l) => l !== layer)
    restoredLineLayers.value = restoredLineLayers.value.filter((l) => l !== layer)
    rebuildLineEndpoints()
  }

  /**
   * Writes a reshaped layer's new geometry back to its segment, and redraws the
   * rails to match.
   *
   * The player drags the rails, not the line, so the geometry is read from
   * whichever layer the event fired on and the line underneath is caught up to
   * it — reading the line's own points would silently discard the edit.
   *
   * @param {Object} e - Geoman update event
   */
  function handleLayerEdited(e) {
    const editedLayer = e.layer
    const layer = resolveTrackLayer(editedLayer)
    if (!layer) return

    const segment = trackStore.getSegment(layer.segmentId)
    if (!canModifySegment(segment)) {
      redrawLayer(layer, segment)
      return
    }

    const coordinates = editedLayer.getLatLngs().map(({ lat, lng }) => ({ lat, lng }))
    if (!trackStore.updateSegmentCoordinates(layer.segmentId, coordinates)) {
      console.error('Could not update track segment:', trackStore.error)
      // The store refused the new shape, so the map must not keep it either
      redrawLayer(layer, segment)
      return
    }

    layer.setLatLngs(editedLayer.getLatLngs())
    removeStyling(layer)
    styleTracks(layer)
    rebuildLineEndpoints()
  }

  /**
   * Puts a layer back the way the store has it — on the map, in the stored
   * shape, with fresh rails. Used whenever a change is refused, so a rejected
   * removal or edit cannot leave the map showing something the save does not.
   * @param {Object} layer - The track layer
   * @param {Object|undefined} segment - The segment it should match
   */
  function redrawLayer(layer, segment) {
    if (segment) {
      layer.setLatLngs(segment.coordinates.map((point) => L.latLng(point.lat, point.lng)))
    }
    if (!props.map.hasLayer(layer)) layer.addTo(props.map)
    removeStyling(layer)
    styleTracks(layer)
  }

  /**
   * Rebuilds the endpoint cache from the track currently on the map.
   * Recomputing beats patching: after a removal or an edit the old endpoints
   * are no longer places track can legally start from.
   */
  function rebuildLineEndpoints() {
    lineEndpoints.value = []
    ;[...existingLineLayers.value, ...restoredLineLayers.value].forEach(updateLineEndpoints)
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

  // ================== TRACK STYLING ==================

  // function to style layer like railroad tracks
  function styleTracks(layer) {
    const latlngs = layer.getLatLngs()

    // Hide the original layer
    layer.setStyle({
      color: 'transparent', // Hide the original line
      opacity: 0,
      weight: 0
    })

    // Add rails using text
    const railText = '-'
    const tieText = '|    '
    const options = {
      repeat: true,
      offset: 0, // Adjust text placement
      attributes: { fill: 'black', 'font-size': '16px' }
    }

    // Apply text for rails
    layer.setText(railText, { ...options, below: false })

    // Optionally, add ties using another layer
    const tieLayer = L.polyline(latlngs, { color: 'transparent' })
    const tieOptions = {
      ...options,
      offset: -1.5,
      attributes: { fill: 'black', 'font-size': '10px' }
    }
    tieLayer.setText(tieText, tieOptions)
    tieLayer.addTo(props.map)

    // Link the decoration to the track it draws, in both directions, so a
    // click or a drag on the visible rails still resolves to the segment behind
    // them. The ties are rebuilt on every restyle, so this listener goes with
    // the layer it is bound to rather than accumulating.
    tieLayer.trackLayer = layer
    tieLayer.on('pm:update', handleLayerEdited)
    layer.tieLayer = tieLayer
  }

  /**
   * Takes the drawn rails off the map, leaving the underlying line alone.
   * Used before redrawing after an edit, and when a section is removed.
   *
   * The rail text is cleared too: leaflet-textpath only drops its existing text
   * node when `setText` is called with nothing, so restyling without this
   * abandons a text node in the SVG on every edit.
   *
   * @param {Object} layer - The track layer whose styling should be cleared
   */
  function removeStyling(layer) {
    layer.setText(null)

    if (layer.tieLayer) {
      props.map.removeLayer(layer.tieLayer)
      layer.tieLayer = null
    }
  }

  // function to add ties to railroad tracks
  function addRailroadTies(map, latlngs, interval, tieLength) {
    console.log('Adding ties to railroad tracks...')
    console.log('latlngs:', latlngs)
    console.log('interval:', interval)
    console.log('tieLength:', tieLength)

    for (let i = 1; i < latlngs.length; i++) {
      const start = latlngs[i - 1]
      const end = latlngs[i]

      // Compute the number of ties based on segment length
      const distance = map.distance(start, end)
      const numTies = Math.floor(distance / interval)

      console.log(`Segment from ${start} to ${end} is ${distance} meters, adding ${numTies} ties.`)

      for (let j = 0; j < numTies; j++) {
        const fraction = j / numTies
        const midpoint = {
          lat: start.lat + fraction * (end.lat - start.lat),
          lng: start.lng + fraction * (end.lng - start.lng)
        }

        // Compute perpendicular tie positions
        const angle = Math.atan2(end.lat - start.lat, end.lng - start.lng)
        const tieOffsetLat = (tieLength * Math.cos(angle + Math.PI / 2)) / 2
        const tieOffsetLng = (tieLength * Math.sin(angle + Math.PI / 2)) / 2

        const tieCoords = [
          { lat: midpoint.lat - tieOffsetLat, lng: midpoint.lng - tieOffsetLng },
          { lat: midpoint.lat + tieOffsetLat, lng: midpoint.lng + tieOffsetLng }
        ]

        // Add tie to the map
        L.polyline(tieCoords, {
          color: 'brown',
          weight: 2
        }).addTo(map)
      }
    }
  }

  // function to create parallel rails
  function createParallelLines(latlngs, offset) {
    console.log('Creating parallel rails from latlngs:', latlngs)
    console.log('Offset:', offset)

    const leftRail = []
    const rightRail = []

    for (let i = 0; i < latlngs.length - 1; i++) {
      const start = latlngs[i]
      const end = latlngs[i + 1]

      console.log('Segment from', start, 'to', end)

      // Compute angle of the segment
      const angle = Math.atan2(end.lat - start.lat, end.lng - start.lng)

      console.log('Angle:', angle)

      // Calculate offset positions
      const offsetLat = offset * Math.cos(angle)
      const offsetLng = offset * Math.sin(angle)

      console.log('Offset positions:', offsetLat, offsetLng)

      leftRail.push({ lat: start.lat + offsetLat, lng: start.lng - offsetLng })
      rightRail.push({ lat: start.lat - offsetLat, lng: start.lng + offsetLng })

      if (i === latlngs.length - 2) {
        // Add the final points
        leftRail.push({ lat: end.lat + offsetLat, lng: end.lng - offsetLng })
        rightRail.push({ lat: end.lat - offsetLat, lng: end.lng + offsetLng })
      }
    }

    console.log('Left rail:', leftRail)
    console.log('Right rail:', rightRail)

    return { leftRail, rightRail }
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
