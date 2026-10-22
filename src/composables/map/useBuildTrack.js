// useBuildTrack.js
// Vue composable for handling map drawing and cost calculation logic
// Organizes and manages all drawing-related logic, including setup, drawing controls, cost calculations, and utility functions.

import { ref, computed, onMounted, onBeforeUnmount, watch, markRaw } from 'vue'
import { useDebounceFn, onKeyStroke } from '@vueuse/core'
import L from 'leaflet'
import 'leaflet-textpath'
import { storeToRefs } from 'pinia'
import { useMapStore } from '@/stores/map'
import { usePlayerStore } from '@/stores/players'
import { useTrackStore } from '@/stores/track'
import { useGameStore } from '@/stores/game'

/**
 * Injection key for the one build-track instance a game view runs.
 *
 * The instance has to live as long as the map, because it owns the track
 * layers drawn on it, while the controls that drive it sit in the side dock.
 * The game view creates it and provides it under this key; the controls
 * inject it rather than each starting their own copy.
 */
export const buildTrackKey = Symbol('buildTrack')

/**
 * Main composable function to handle map drawing logic.
 *
 * Works on the map and towns layer held in the map store, and reads them when
 * its host component mounts. The host must therefore mount after the map
 * exists — a parent of the map component qualifies, since a parent's
 * `onMounted` runs after its children's.
 *
 * @param {Object} grid - Reactive grid data for cell-based calculations
 * @param {Function} formatCurrency - Utility function to format currency values
 * @returns {Object} - Exposes reactive state, computed properties, and functions for map drawing
 */
export default function useBuildTrack(grid, formatCurrency) {
  // ================== STATE VARIABLES ==================

  const itemizedCosts = ref([]) // Array to store individual segment costs
  const runningCost = ref(0) // Accumulator for the ongoing segment cost
  const workingLayer = ref(null) // Reference to the currently drawn line layer
  const hintMarkerMoveHandler = ref(null) // Handler for hint marker movement
  const costedHintMarker = ref(null) // The hint marker that handler is bound to
  const existingLineLayers = ref([]) // Leaflet layers for track drawn in this session
  const restoredLineLayers = ref([]) // Leaflet layers redrawn from a saved game
  const currentGridCellId = ref(null) // ID of the current grid cell for cost tracking
  const isFirstVertexAdded = ref(false) // Flag to track if the first vertex has been added
  const buildError = ref('') // Why the last section could not be built, if it could not
  const isRemoving = ref(false) // True while Geoman's removal mode is on

  // Caching town marker positions and endpoints for faster validation
  const townMarkerPositions = ref([])
  const lineEndpoints = ref([])

  // get access to isDrawingActive from map store
  const mapStore = useMapStore()
  const { isDrawingActive } = storeToRefs(mapStore)

  // Whether the mount found a map to attach to, and so whether there is
  // anything for the unmount to take back off
  let isAttached = false

  // the active player drives per-turn build state
  const playerStore = usePlayerStore()

  // completed track is game state, not a map layer, so it lives in its own store
  const trackStore = useTrackStore()
  const gameStore = useGameStore()

  // ================== COMPUTED PROPERTIES ==================

  // total cost for all track segments
  const totalCost = computed(() => itemizedCosts.value.reduce((acc, cost) => acc + cost, 0))
  /**
   * Whether the active player has track they may still tear up.
   *
   * Read from the track store rather than from the layers drawn this session,
   * so it is right in both directions: a player who reloads mid-turn can still
   * reach the refund for track they have already paid for, and a player who
   * has built nothing is not offered a Remove button for the previous
   * player's track.
   */
  const hasRemovableTrack = computed(
    () => trackStore.segmentsBuiltOn(playerStore.activePlayer?.id, gameStore.turn).length > 0
  )

  /**
   * What the active player can still put into track — whichever of cash on hand
   * and this turn's build allowance runs out first.
   */
  const availableToSpend = computed(() =>
    playerStore.availableForTrack(playerStore.activePlayer?.id)
  )

  /**
   * Cost of the line being drawn, including the leg the cursor is part way
   * through. `totalCost` alone only counts legs already committed by a vertex,
   * so it lags the cursor by a whole leg and would warn a player too late.
   */
  const pendingCost = computed(() => totalCost.value + runningCost.value)

  /**
   * True while the line in progress costs more than the player can pay for.
   * Only meaningful mid-draw: once a section is built its cost has already come
   * out of `availableToSpend`, and comparing the two would flag every build
   * that spent the last of the allowance.
   */
  const isOverBudget = computed(
    () => isDrawingActive.value && pendingCost.value > availableToSpend.value
  )

  // ================== TURN HANDLING ==================

  /**
   * Clear per-turn build state when play passes to another player, so the
   * cost panel shows what the *current* player has spent rather than an
   * ever-growing list. Any drawing or removal left in progress is ended first:
   * neither may carry over into someone else's turn.
   *
   * Completed track layers are deliberately left on the map; the segments
   * behind them are already recorded in the track store.
   */
  watch(
    () => playerStore.activePlayer?.id,
    () => {
      if (isDrawingActive.value) cancelDrawing()
      stopRemoving()
      resetLineTracking()
    }
  )

  /**
   * Leave removal mode once there is nothing left to remove. The control that
   * switches removal mode off is only shown while there is track to remove, so
   * tearing up the last section would otherwise strand the player in removal
   * mode with no button to leave it.
   */
  watch(hasRemovableTrack, (canRemove) => {
    if (!canRemove) stopRemoving()
  })

  // ================== INITIAL SETUP ==================

  /**
   * onMounted hook: Initializes map and marker events and sets default options.
   *
   * Does nothing if the map or its towns never made it into the store — the
   * map component failed to set up, and there is nothing to build on. That is
   * logged rather than thrown, so the failure stays in the map and does not
   * take the rest of the game screen down with it.
   */
  onMounted(() => {
    if (!mapStore.map || !mapStore.townsLayer) {
      console.error('Track building is unavailable: the map did not finish setting up')
      return
    }
    isAttached = true

    initializeTownMarkers() // Set up events for clickable town markers
    mapStore.map.on(mapEvents) // Listen for drawing, removal and cursor movement
    setGeomanOptions() // Configure Geoman drawing tool options
    restoreTrackLayers() // Redraw track carried in from a saved game
    initializeCaches() // Initialize town marker and line endpoint caches
  })

  /**
   * onBeforeUnmount hook: takes back off the map everything the mount put on it.
   *
   * The map outlives the component that runs this composable, so anything left
   * behind keeps working after the component is gone. A later mount then adds a
   * second set on top: every listener fires twice, so a new section is charged
   * for and recorded twice, and every saved section is drawn twice.
   *
   * Runs before unmount rather than after, so the teardown happens while the
   * host's map is certainly still the one in the store.
   */
  onBeforeUnmount(() => {
    if (!isAttached) return

    // A drawing left open would carry on with no listener to price or record it
    if (isDrawingActive.value) cancelDrawing()
    // Likewise removal mode: left on, it would let a player tear sections off
    // the map with nothing listening to take them out of the store or refund
    // them — the drift between map and save that #83 fixed
    stopRemoving()
    // The start-point check may have left a "not allowed" cursor on the map
    mapStore.map.getContainer().style.cursor = ''

    mapStore.map.off(mapEvents)
    removeTownMarkerEvents()
    allTrackLayers().forEach(removeTrackLayer)
    existingLineLayers.value = []
    restoredLineLayers.value = []
  })

  /**
   * Escape backs out of whichever map mode the player is in, the way it does in
   * most drawing tools. Registered through VueUse so the key listener is taken
   * off the window when the host unmounts.
   */
  onKeyStroke('Escape', () => {
    if (isDrawingActive.value) cancelDrawing()
    stopRemoving()
  })

  // ================== PUBLIC FUNCTIONS (EXPOSED) ==================

  /**
   * Switches removal mode on or off. While it is on, clicking a section the
   * active player built this turn tears it up and refunds it.
   *
   * `isRemoving` is not set here: Geoman announces every change of mode with
   * an event, whatever caused it, and the listener for that event keeps the
   * flag in step.
   */
  function toggleRemoveMode() {
    // Drawing and removing both act on map clicks, so only one may be live
    if (isDrawingActive.value) cancelDrawing()
    mapStore.map.pm.toggleGlobalRemovalMode()
  }

  /**
   * Switches removal mode off if it is on. Asks Geoman rather than trusting
   * `isRemoving`, so it is right even before the first toggle event arrives.
   */
  function stopRemoving() {
    if (mapStore.map?.pm.globalRemovalModeEnabled()) mapStore.map.pm.disableGlobalRemovalMode()
  }

  // ================== DRAWING CONTROL FUNCTIONS ==================

  /**
   * Initiates line drawing mode on the map.
   */
  function startDrawingLine() {
    resetLineTracking()

    // Drawing and removing both act on map clicks, so only one may be live
    stopRemoving()

    // Cost comes from the grid cells a line crosses, so with no grid every
    // line prices at zero and is built for nothing. Refuse rather than give
    // the map away.
    if (!grid.value?.length) {
      buildError.value = 'The map has not finished loading, so track cannot be priced yet.'
      return
    }

    mapStore.map.pm.enableDraw('Line', drawingLineStyles(playerStore.activePlayer?.id))
    mapStore.setIsDrawingActive(true)
  }

  /**
   * Cancels line drawing mode and resets state.
   */
  function cancelDrawing() {
    mapStore.map.pm.disableDraw('Line')
    mapStore.setIsDrawingActive(false)
    // Without this the handler stays held, the next drawing never rebinds one,
    // and every leg of it prices at zero — free track
    resetHintMarkerMoveHandler()
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
    mapStore.townsLayer.eachLayer((layer) => {
      layer.on('click', handleTownClick)
    })
  }

  /**
   * Takes the click handler back off every town marker, so a later mount does
   * not add a second one that places every vertex twice.
   */
  function removeTownMarkerEvents() {
    mapStore.townsLayer.eachLayer((layer) => {
      layer.off('click', handleTownClick)
    })
  }

  /**
   * Places a vertex exactly on a town when its marker is clicked mid-drawing.
   * The marker sits on top of the map and swallows the click, so without this
   * a line could never start or end precisely on a town.
   * @param {Object} e - Leaflet click event from the marker
   */
  function handleTownClick(e) {
    if (isDrawingActive.value) {
      mapStore.map.pm.Draw.Line._createVertex(e.latlng)
    }
  }

  /**
   * Every map-wide listener this composable needs, as one table that is handed
   * to both `map.on` at mount and `map.off` at unmount. Keeping a single list
   * means a listener cannot be added without also being removed — a missed
   * removal is exactly how listeners stacked up across mounts.
   *
   * Leaflet's `off` only removes a listener when given the same function `on`
   * was given, which is why every handler here is a named function.
   */
  const mapEvents = {
    'pm:drawstart': handleDrawStart,
    'pm:create': finalizeDrawing,
    // Geoman's global removal mode acts on the layer, so the store has to be
    // told; without this the map and the rail network drift apart (#83).
    // Removal is re-fired on the map (`_fireRemove(this.map, layer)`), so one
    // map-level listener catches every section.
    'pm:remove': handleLayerRemoved,
    'pm:globalremovalmodetoggled': handleRemovalModeToggled,
    mousemove: handleCursorMove
  }

  /**
   * Keeps `isRemoving` in step with Geoman's removal mode, so the controls and
   * the map's hint can say which mode the player is in.
   * @param {Object} e - Geoman toggle event
   * @param {boolean} e.enabled - Whether removal mode is now on
   */
  function handleRemovalModeToggled({ enabled }) {
    isRemoving.value = enabled
  }

  /**
   * Picks up the line Geoman has just started, so its vertices can be priced.
   * @param {Object} e - Geoman draw-start event carrying the line being drawn
   */
  function handleDrawStart({ workingLayer: layer }) {
    workingLayer.value = layer
    setupDrawingEvents()
  }

  function initializeCaches() {
    // Cache town marker positions
    townMarkerPositions.value = mapStore.townsLayer.getLayers().map((marker) => marker.getLatLng())

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
      const layer = L.polyline(latlngs).addTo(mapStore.map)
      attachSegment(layer, segment.id)
      // markRaw: a Leaflet layer read back out of a reactive array comes back as
      // a proxy, and Geoman hands back the raw layer, so the two would never
      // compare equal and the cleanup filters below would never match
      restoredLineLayers.value.push(markRaw(layer))
      styleTracks(layer, segment.ownerId)
    })
  }

  /**
   * Every track layer this composable has on the map: sections built since it
   * mounted, plus those redrawn from the store when it mounted.
   * @returns {Array} Track layers
   */
  function allTrackLayers() {
    return [...existingLineLayers.value, ...restoredLineLayers.value]
  }

  /**
   * Takes one section's layer off the map, along with the rails drawn over it.
   * The rails and the line are one piece of track to the player, so neither
   * may be left behind without the other.
   *
   * Only the map changes here; whether the section also leaves the track store
   * is up to the caller.
   *
   * @param {Object} layer - The track layer
   */
  function removeTrackLayer(layer) {
    removeStyling(layer)
    if (mapStore.map.hasLayer(layer)) mapStore.map.removeLayer(layer)
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
          mapStore.map.pm.Draw.Line._finishShape()
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

      const cost = totalCost.value
      const builderId = playerStore.activePlayer?.id
      const affordable = availableToSpend.value

      // Charged before it is recorded: once a section is in the store it is
      // indistinguishable from one that was paid for, so a build the player
      // cannot cover has to be turned away here rather than unwound later
      if (!playerStore.spendOnTrack(builderId, cost)) {
        // The store's own message is in raw numbers and names the player, which
        // is what a log wants and not what the person building wants to read
        console.warn('Track section refused:', playerStore.error)
        // `discardDrawnLayer` resets the drawing state, `buildError` included,
        // so the explanation is written after it rather than before
        discardDrawnLayer(e.layer)
        // Money is only one of the ways the charge can fail; blaming the budget
        // for a section that could not be priced at all would send the player
        // looking for cash they already have
        buildError.value = Number.isFinite(cost)
          ? `That section costs ${formatCurrency(cost)} — more than the ${formatCurrency(affordable)} you have left to spend.`
          : 'That section could not be priced, so it was not built.'
        return
      }

      // Record before styling: the layer has to carry its segment id from the
      // moment it exists, or a removal cannot find what to un-record
      const segment = recordSegment(e.layer, cost)
      if (!segment) {
        // Nothing was built, so nothing stays charged for
        playerStore.refundTrackSpend(builderId, cost)
        // Track that nothing owns and no save records is worse than no track at
        // all, so take it back off the map rather than leave a phantom line
        discardDrawnLayer(e.layer)
        // The line vanishing with no explanation reads as the game losing work
        buildError.value = 'That section could not be recorded, so it was not built.'
        return
      }

      buildError.value = ''
      attachSegment(e.layer, segment.id)
      existingLineLayers.value.push(markRaw(e.layer))
      updateLineEndpoints(e.layer)
      styleTracks(e.layer, segment.ownerId)
    }
    resetHintMarkerMoveHandler()
    workingLayer.value = null
  }

  /**
   * Takes a just-drawn line back off the map and clears the drawing state that
   * went with it. Used whenever a completed line is refused.
   * @param {Object} layer - The layer Geoman just created
   */
  function discardDrawnLayer(layer) {
    mapStore.map.removeLayer(layer)
    resetHintMarkerMoveHandler()
    // The itemised costs describe a line that no longer exists, and leaving
    // them up puts a total next to the message explaining it was not built
    resetLineTracking()
    workingLayer.value = null
  }

  /**
   * Writes a finished line into the track store as owned, priced game state.
   *
   * The price is passed in rather than read from `totalCost` again, so the
   * amount the player was charged and the amount the segment records are the
   * same number by construction — a refund pays back what the segment says.
   *
   * @param {Object} layer - The completed Leaflet line layer
   * @param {number} cost - What the player was charged for it
   * @returns {Object|null} The stored segment, or null if it was rejected
   */
  function recordSegment(layer, cost) {
    const segment = trackStore.addSegment({
      ownerId: playerStore.activePlayer?.id,
      coordinates: layer.getLatLngs().map(({ lat, lng }) => ({ lat, lng })),
      cost,
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
   * Ties a Leaflet layer to the segment it draws, so a later removal can find
   * what to take out of the store.
   * @param {Object} layer - The track layer
   * @param {number} segmentId - Id of the segment it draws
   */
  function attachSegment(layer, segmentId) {
    layer.segmentId = segmentId
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
   * Whether the active player is allowed to tear up this segment.
   *
   * Geoman's global removal mode offers up every track layer on the map,
   * including other players' and earlier turns'. That was harmless while
   * removal was cosmetic; now that it reaches the save and refunds money, an
   * unguarded removal would delete another player's network permanently and
   * pay the wrong player for it.
   *
   * @param {Object|undefined} segment - The segment behind the layer
   * @returns {boolean} True if the segment is the active player's, built this turn
   */
  function canRemoveSegment(segment) {
    return trackStore.isOwnedFromTurn(segment, playerStore.activePlayer?.id, gameStore.turn)
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
    if (!canRemoveSegment(segment)) {
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

    // Only track built this turn by the active player gets here, so the money
    // and the allowance both go back to the player who put them in
    if (!playerStore.refundTrackSpend(segment.ownerId, segment.cost)) {
      console.error('Could not refund track segment:', playerStore.error)
    }

    // Geoman removed whichever of the line or its rails was clicked; this takes
    // off the other half too
    removeTrackLayer(layer)

    existingLineLayers.value = existingLineLayers.value.filter((l) => l !== layer)
    restoredLineLayers.value = restoredLineLayers.value.filter((l) => l !== layer)
    // The panel was itemising the section just torn up
    resetLineTracking()
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
    if (!mapStore.map.hasLayer(layer)) layer.addTo(mapStore.map)
    removeStyling(layer)
    styleTracks(layer, segment?.ownerId)
  }

  /**
   * Rebuilds the endpoint cache from the track currently on the map.
   * Recomputing beats patching: after a removal or an edit the old endpoints
   * are no longer places track can legally start from.
   */
  function rebuildLineEndpoints() {
    lineEndpoints.value = []
    allTrackLayers().forEach(updateLineEndpoints)
  }

  // ================== COST TRACKING & TOOLTIP ==================

  /**
   * Attaches the running-cost handler to the hint marker the player is dragging.
   *
   * This is what prices a line, so failing to bind it does not degrade the
   * tooltip — it makes the track free. The guard below skips binding when a
   * handler is already held, which is why `resetHintMarkerMoveHandler` has to
   * run on every path that ends a drawing, cancellation included.
   */
  function addHintMarkerMoveHandler() {
    const hintMarker = mapStore.map.pm.Draw.Line._hintMarker
    if (hintMarker && !hintMarkerMoveHandler.value) {
      hintMarkerMoveHandler.value = useDebounceFn(
        (e) => updateRunningCostTooltip(e.latlng, hintMarker),
        100
      ) // Throttle to reduce lag
      // Held so the handler can be taken off the marker it was put on, rather
      // than off whichever marker happens to be current when it is released
      costedHintMarker.value = markRaw(hintMarker)
      hintMarker.on('move', hintMarkerMoveHandler.value)
    }
  }

  /**
   * Releases the running-cost handler once a drawing ends, however it ended.
   *
   * Geoman builds a fresh hint marker on every `enable()` and never clears the
   * old one, so the handler is unbound from the marker it was actually put on.
   * The handler is dropped whether or not that marker is still around: holding
   * a stale one would make `addHintMarkerMoveHandler` skip the next drawing,
   * and every leg of it would then price at zero.
   */
  function resetHintMarkerMoveHandler() {
    if (costedHintMarker.value && hintMarkerMoveHandler.value) {
      costedHintMarker.value.off('move', hintMarkerMoveHandler.value)
    }
    costedHintMarker.value = null
    hintMarkerMoveHandler.value = null
  }

  /**
   * Updates the tooltip on the hint marker with the current running cost.
   * @param {Object} latlng - Latitude and longitude of the hint marker
   * @param {Object} hintMarker - The hint marker element to update
   */
  function updateRunningCostTooltip(latlng, hintMarker) {
    const cell = getGridCellByLatLng(latlng)
    // `Number.isFinite` rather than a null check: an undefined or NaN cell cost
    // propagates into the running total and prices the whole line at NaN
    if (cell && cell.id !== currentGridCellId.value && Number.isFinite(cell.cost)) {
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
      const dist = mapStore.map.distance(latlng, L.latLng(cell.centroid.lat, cell.centroid.lng))
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
    buildError.value = ''
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
   * Shows a "not allowed" cursor over places a line cannot start from, so a
   * player can see where track may begin before they click.
   *
   * Debounced because mousemove fires on every pixel and the check scans every
   * town and track endpoint.
   */
  const debouncedCursorValidation = useDebounceFn((latlng) => {
    const cursorStyle = validateStartPoint(latlng) ? 'default' : 'not-allowed'
    mapStore.map.getContainer().style.cursor = cursorStyle
  }, 50)

  /**
   * Re-checks the cursor as it moves, but only while the player is choosing
   * where a line starts — once the first vertex is down, anywhere is fair game.
   * @param {Object} e - Leaflet mousemove event
   */
  function handleCursorMove(e) {
    if (isDrawingActive.value && !isFirstVertexAdded.value) {
      debouncedCursorValidation(e.latlng)
    }
  }

  /**
   * Configures Geoman global drawing options, including tooltips and snapping behavior.
   */
  function setGeomanOptions() {
    mapStore.map.pm.setLang('en', {
      tooltips: {
        placeMarker: 'Place your marker here!',
        firstVertex: 'Track must start in a town or on existing track',
        continueLine: '',
        finishLine: 'Click to finish the track'
      }
    })

    mapStore.map.pm.setGlobalOptions({
      snappable: true,
      snapDistance: 50,
      // The line's own colors are not set here: they belong to whoever is
      // drawing, so startDrawingLine passes them each time (drawingLineStyles)
      markerStyle: { draggable: true, color: 'red' }
    })
  }

  // ================== TRACK STYLING ==================

  /**
   * How the line being drawn looks: solid enough to see the player's color
   * against the map, without hiding the terrain the player is pricing.
   */
  const DRAWING_LINE_STYLE = { weight: 4, opacity: 0.9 }

  /** Leaflet's own line blue, for a line drawn by a player with no color */
  const UNOWNED_DRAWING_COLOR = '#3388ff'

  /**
   * What finished track is drawn in when its owner has no color (a damaged
   * save): plain black, the way all track looked before it was colored.
   */
  const UNOWNED_TRACK_COLOR = 'black'

  /**
   * How the rail and tie characters are drawn: in the owner's color, set
   * extra-bold so there is enough of each mark for the color to show, with
   * a thin dark edge. Without the edge the paler player colors (light
   * yellow, light cyan) all but vanish on the light map; with it every color
   * reads, on any terrain.
   */
  const TRACK_MARK_STYLE = {
    'font-weight': '900',
    stroke: '#222',
    'stroke-width': '1px',
    'stroke-linejoin': 'round',
    // Paint the edge first and the color over it, so the edge frames the
    // mark rather than eating into it
    'paint-order': 'stroke'
  }

  /**
   * Geoman's styles for a line while it is being drawn, in the color of the
   * player drawing it, so it looks like their track from the first click.
   *
   * Three lines are involved: the legs already placed (`templineStyle`), the
   * dashed leg following the cursor (`hintlineStyle`), and the finished line
   * Geoman hands over before it is restyled as track (`pathOptions`). The hint
   * line stays dashed, so the leg not yet placed still looks provisional; its
   * dashes are longer than Geoman's, because at this width the line's rounded
   * ends would close up short gaps.
   *
   * All three are always given, even for a player with no color (who gets
   * Leaflet's blue): Geoman keeps whatever styles it was last handed, so
   * leaving one out would draw this player's line in the previous player's
   * color.
   *
   * @param {number} playerId - The player about to draw
   * @returns {Object} Options for Geoman's `enableDraw`
   */
  function drawingLineStyles(playerId) {
    const color = playerStore.colorOf(playerId) ?? UNOWNED_DRAWING_COLOR

    return {
      templineStyle: { color, ...DRAWING_LINE_STYLE },
      hintlineStyle: { color, dashArray: '8,10', ...DRAWING_LINE_STYLE },
      pathOptions: { color, ...DRAWING_LINE_STYLE }
    }
  }

  /**
   * Draws a track layer as railway: rails and ties in the owning player's
   * color, each edged in dark gray, so each player's network can be told
   * apart and pale colors still show up.
   *
   * The rails and ties are text characters laid along the layer's line, and
   * the line itself is hidden. Track whose owner is not a player in the game
   * (a damaged save) is drawn in plain black.
   *
   * @param {Object} layer - A track layer
   * @param {number} ownerId - Id of the player who built the track
   */
  function styleTracks(layer, ownerId) {
    const latlngs = layer.getLatLngs()
    const color = playerStore.colorOf(ownerId) ?? UNOWNED_TRACK_COLOR

    // Hide the original layer
    layer.setStyle({
      color: 'transparent', // Hide the original line
      opacity: 0,
      weight: 0
    })

    // Add rails using text. Both the rails and the ties are centered on the
    // line ('dominant-baseline: central'), so the track sits on its route and
    // the ties cross the rails in the middle.
    const railText = '-'
    const tieText = '|    '
    const options = {
      repeat: true,
      // A string, not the number 0: leaflet-textpath reads a falsy offset as
      // "none given" and moves the text off the line by the line's width.
      // The rail line is 0 wide, but the tie line below keeps Leaflet's
      // default width of 3, so its ties would sit 3px off the rails.
      offset: '0',
      attributes: {
        fill: color,
        ...TRACK_MARK_STYLE,
        'font-size': '20px',
        'dominant-baseline': 'central'
      }
    }

    // Apply text for rails
    layer.setText(railText, { ...options, below: false })

    // Ties need a layer of their own: leaflet-textpath lays one text per line
    const tieLayer = L.polyline(latlngs, { color: 'transparent' })
    const tieOptions = {
      ...options,
      attributes: { ...options.attributes, 'font-size': '12px' }
    }
    tieLayer.setText(tieText, tieOptions)
    tieLayer.addTo(mapStore.map)

    // Link the decoration to the track it draws, in both directions, so a
    // click on the visible rails still resolves to the segment behind them.
    tieLayer.trackLayer = layer
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
      mapStore.map.removeLayer(layer.tieLayer)
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
    pendingCost,
    availableToSpend,
    isOverBudget,
    buildError,
    isDrawingActive,
    isRemoving,
    startDrawingLine,
    toggleRemoveMode,
    cancelDrawing
  }
}
