// useBuildTrack.js
// Vue composable for handling map drawing and cost calculation logic
// Organizes and manages all drawing-related logic, including setup, drawing controls, cost calculations, and utility functions.

import { ref, computed, onMounted, onBeforeUnmount, watch, markRaw } from 'vue'
import { useDebounceFn, onKeyStroke } from '@vueuse/core'
import L from 'leaflet'
import { storeToRefs } from 'pinia'
import { useMapStore } from '@/stores/map'
import { usePlayerStore } from '@/stores/players'
import { useTrackStore } from '@/stores/track'
import { useGameStore } from '@/stores/game'
import { useTownsStore } from '@/stores/towns'
import { priceLine, linePrice } from '@/composables/map/trackCost'
import { lineBlock, blockMessage, townCells, builtLegs } from '@/composables/map/buildRules'
import { regionTest } from '@/composables/map/region'
import { BUILD_VIEW, PLAN_VIEW } from '@/composables/map/mapViews'
import {
  UNOWNED_TRACK_COLOR,
  RAIL_STYLE,
  CASING_STYLE,
  TIES_STYLE
} from '@/composables/map/trackStyles'

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

  const workingLayer = ref(null) // Reference to the currently drawn line layer
  const hintMarkerMoveHandler = ref(null) // Handler for hint marker movement
  const costedHintMarker = ref(null) // The hint marker that handler is bound to
  const existingLineLayers = ref([]) // Leaflet layers for track drawn in this session
  const restoredLineLayers = ref([]) // Leaflet layers redrawn from a saved game
  const isFirstVertexAdded = ref(false) // Flag to track if the first vertex has been added
  const buildError = ref('') // Why the last section could not be built, if it could not
  const isRemoving = ref(false) // True while Geoman's removal mode is on

  /**
   * Cost of the line being drawn, out to the cursor: the vertices placed so
   * far plus the leg the cursor is pulling out from the last one. Repriced
   * from scratch each time (see `priceLine`), so it follows the cursor down as
   * well as up.
   */
  const pendingCost = ref(0)

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
  const townsStore = useTownsStore()

  // ================== COMPUTED PROPERTIES ==================

  /**
   * What every line is checked against before it is built (see buildRules.js):
   * the grid, the region being played, the cells the towns sit in, and the
   * track built so far. Worked out once rather than on every move of the
   * cursor; the board parts and the track are kept apart, so building or
   * tearing up track does not work the board out again.
   */
  const boardRules = computed(() => ({
    grid: grid.value ?? [],
    isInRegion: regionTest(gameStore.region),
    townCells: townCells(townsStore.towns, grid.value ?? [])
  }))
  const buildRules = computed(() => ({
    ...boardRules.value,
    builtLegs: builtLegs(trackStore.segments)
  }))

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
   * Clear per-turn build state when play passes to another player, so no
   * pending cost or build error from the last player's turn is left showing.
   * Any drawing or removal left in progress is ended first: neither may carry
   * over into someone else's turn.
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

  /**
   * Track is only built in the Build view. The Plan view shows the whole
   * region fixed in place, too far out to place track accurately, so
   * switching to it ends any drawing or removal in progress, as Escape does.
   *
   * Synchronous, so it runs on every switch: a deferred watcher sees only
   * where the view ends up once the tick is over, and would miss a switch to
   * Build and straight back.
   */
  watch(
    () => mapStore.viewMode,
    (view) => {
      if (view !== PLAN_VIEW) return
      if (isDrawingActive.value) cancelDrawing()
      stopRemoving()
    },
    { flush: 'sync' }
  )

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
    createTrackPanes() // Make the panes track is drawn in, before any is drawn
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
    // Track is torn up in the Build view. Removal mode is only ever on in that
    // view, so when this switches it off the view stays as it is.
    mapStore.setViewMode(BUILD_VIEW)
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
   * Initiates line drawing mode on the map, switching the map to the Build
   * view first if the player was looking at the Plan view.
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

    // Before drawing starts, so the map is already zoomed in and limited to
    // the Build view's range by the time the player places a first point
    mapStore.setViewMode(BUILD_VIEW)
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
    // markRaw: Geoman fires this line's events on the raw layer, so it is kept
    // raw here too rather than wrapped in a Vue proxy (see the map store)
    workingLayer.value = markRaw(layer)
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
      // Created in the rail pane: the layer becomes the track's rail, and a
      // line cannot change pane once it is on the map
      const layer = L.polyline(latlngs, { pane: RAILS_PANE }).addTo(mapStore.map)
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
   * Takes one section's layer (its rail) off the map, along with the casing
   * and ties drawn under it. The three are one piece of track to the player,
   * so none may be left behind without the others.
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
   * Sets up events for adding vertices and pricing the line as it grows.
   * This is activated whenever a line drawing starts.
   */
  function setupDrawingEvents() {
    isFirstVertexAdded.value = false // Reset flag for the first vertex

    workingLayer.value.on('pm:vertexadded', (evt) => {
      const addedVertex = evt.latlng // Get the position of the added vertex

      if (!isFirstVertexAdded.value) {
        if (!validateStartPoint(addedVertex)) {
          cancelDrawing() // Cancel if the start point is invalid
          startDrawingLine()
        } else {
          isFirstVertexAdded.value = true
          // The cell the line starts in is charged too, so the price starts there
          repriceLine()
          addHintMarkerMoveHandler() // Add movement handler for cost tooltip
        }
      } else {
        // A leg that breaks a build rule is taken straight back off, so the
        // line never holds track that could not be built; the player is told
        // why, and carries on from the vertex before
        // The whole line, not just the new leg: a crossing of water can run
        // over several legs
        const message = whyNotBuildable(workingLayer.value.getLatLngs())
        if (message) {
          const drawing = mapStore.map.pm.Draw.Line
          drawing._removeLastVertex()
          // Geoman puts its own "click to finish" text back on the cursor as it
          // takes the vertex off; the reason is what the player needs there
          drawing._hintMarker?.setTooltipContent(message)
          repriceLine()
          buildError.value = message
          return
        }
        buildError.value = ''

        // Priced here from the vertex itself, not left to the cursor handler:
        // that one is debounced, so it can still be a step behind the click
        repriceLine()

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
      // Checked again as a whole, however the drawing ended: each leg was
      // checked as it was placed, but a finished line is what gets built
      const blocked = whyNotBuildable(e.layer.getLatLngs(), { isFinished: true })
      if (blocked) {
        discardDrawnLayer(e.layer)
        buildError.value = `${blocked} That section was not built.`
        return
      }

      // Priced from the finished line itself, by the same rule as the live
      // cost, so the charge matches what was shown however the drawing ended
      // (town, double-click or the Finish tooltip)
      const cost = priceLine(e.layer.getLatLngs(), grid.value)
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
    // The pending cost describes a line that no longer exists, and leaving it
    // up puts a total next to the message explaining it was not built
    resetLineTracking()
    workingLayer.value = null
  }

  /**
   * Writes a finished line into the track store as owned, priced game state.
   *
   * The price is passed in rather than worked out again, so the
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

  // ================== MAP / STORE SYNCHRONIZATION ==================

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
   * Track is drawn as three lines: the layer itself, which is the rail, and the
   * casing and ties `styleTracks` lays under it. A click in removal mode can
   * land on any of the three, depending on where on the track it falls, and
   * all three have to lead back to the same segment.
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

    // Geoman removed whichever of the rail, casing or ties was clicked; this
    // takes off the rest
    removeTrackLayer(layer)

    existingLineLayers.value = existingLineLayers.value.filter((l) => l !== layer)
    restoredLineLayers.value = restoredLineLayers.value.filter((l) => l !== layer)
    // The panel was itemizing the section just torn up
    resetLineTracking()
    rebuildLineEndpoints()
  }

  /**
   * Puts a layer back the way the store has it — on the map, in the stored
   * shape, with a fresh casing and ties. Used whenever a change is refused, so a rejected
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
   * Sets `pendingCost` to the price of the line being drawn: the vertices
   * placed so far, plus the leg out to the cursor when one is given. Every
   * change to the line reprices it through here, so the cost shown can never
   * be left describing an older shape of the line.
   *
   * @param {Object} [cursorLatLng] - Where the cursor is, if the leg to it counts
   * @returns {{cost: number, bridges: number}} What the leg to the cursor adds,
   *   and how much of that is bridges: the line's price with the leg minus
   *   the price without, so a cell already paid for is not shown again
   */
  function repriceLine(cursorLatLng) {
    const placed = workingLayer.value.getLatLngs()
    const without = linePrice(placed, grid.value)
    const withLeg = cursorLatLng ? linePrice([...placed, cursorLatLng], grid.value) : without
    pendingCost.value = withLeg.total
    return { cost: withLeg.total - without.total, bridges: withLeg.bridges - without.bridges }
  }

  /**
   * Reprices the line out to where the cursor is, and shows the leg the
   * cursor is pulling out on the hint marker's tooltip.
   * @param {Object} latlng - Latitude and longitude of the hint marker
   * @param {Object} hintMarker - The hint marker element to update
   */
  function updateRunningCostTooltip(latlng, hintMarker) {
    // The handler is debounced, so a call can land after its drawing ended,
    // or even after the next one began. Geoman gives every drawing a fresh
    // hint marker, so a call from any marker but the current one is stale.
    if (!workingLayer.value || hintMarker !== costedHintMarker.value) return

    // A leg that could not be built says so instead of giving a price, and the
    // dashed line out to the cursor turns red. Its cost is left out of the
    // line's running total: counted, it could push the total over budget, and
    // the panel would blame money for a leg the border rules out.
    //
    // Checked as if the line were finished here, so a leg ending on water
    // can say so before the player double-clicks and loses the line. That
    // is only a warning while drawing goes on, and `lineBlock` checks it
    // last, so it is never in the way of a rule that is actually broken.
    const block = lineBlock([...workingLayer.value.getLatLngs(), latlng], buildRules.value, {
      isFinished: true
    })
    const endsOnWater = block?.reason === 'endsOnWater'
    const message = block && !endsOnWater ? describeBlock(block) : null
    const leg = repriceLine(message ? undefined : latlng)
    hintMarker.setTooltipContent(
      message ??
        `${legTooltip(leg)}${endsOnWater ? ': keep going, a bridge has to reach land' : ''}`
    )
    const hintLine = mapStore.map.pm.Draw.Line._hintline
    hintLine?.setStyle({
      color: message
        ? BLOCKED_LEG_COLOR
        : drawingLineStyles(playerStore.activePlayer?.id).hintlineStyle.color
    })
  }

  /**
   * The cursor's tooltip for a leg that can be built: its cost, and how much
   * of that is bridges when it crosses water, so a costly leg says why.
   * @param {{cost: number, bridges: number}} leg - From `repriceLine`
   * @returns {string} The tooltip's text
   */
  function legTooltip({ cost, bridges }) {
    const price = `Cost: ${formatCurrency(cost)}`
    return bridges > 0 ? `${price} (bridge ${formatCurrency(bridges)})` : price
  }

  /**
   * Why a line may not be built, in words for the player; null if it may.
   * @param {Array<Object>} latlngs - The line's vertices
   * @param {Object} [options] - See `lineBlock`: `isFinished` for a line
   *   that is done, which may not end on water
   * @returns {string|null} The reason, or null
   */
  function whyNotBuildable(latlngs, options) {
    const block = lineBlock(latlngs, buildRules.value, options)
    return block && describeBlock(block)
  }

  /**
   * A broken rule, in words for the player (see `blockMessage`).
   * @param {Object} block - What `lineBlock` found
   * @returns {string} The message
   */
  function describeBlock(block) {
    return blockMessage(block, gameStore.region?.properties?.NAME)
  }

  // ================== UTILITY FUNCTIONS ==================

  /**
   * Resets variables tracking the state of the current line drawing.
   * Used when beginning or canceling a new drawing.
   */
  function resetLineTracking() {
    pendingCost.value = 0
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
      // In screen pixels, so the same at every zoom: about a town icon's
      // width, so the line catches a town or a track end once the cursor is
      // on it, not from well outside it
      snapDistance: 15,
      // The line's own colors are not set here: they belong to whoever is
      // drawing, so startDrawingLine passes them each time (drawingLineStyles)
      markerStyle: { draggable: true, color: 'red' },
      // Geoman puts both the line being drawn and the finished line it hands
      // over in its "layer pane", overriding any pane passed with the line's
      // own options. Making that the rail pane does two jobs: the finished line
      // is already where it belongs as the track's rail, and the line being
      // drawn sits above the casing and ties of existing track, so it never
      // disappears under them where it meets or crosses it.
      panes: { layerPane: RAILS_PANE }
    })
  }

  // ================== TRACK STYLING ==================

  /**
   * How the line being drawn looks: solid enough to see the player's color
   * against the map, without hiding the terrain the player is pricing.
   */
  const DRAWING_LINE_STYLE = { weight: 4, opacity: 0.9 }

  /**
   * The color the leg out to the cursor turns while it could not be built.
   * Bulma's danger red, darker than the red a player can pick.
   */
  const BLOCKED_LEG_COLOR = '#cc0f35'

  /** Leaflet's own line blue, for a line drawn by a player with no color */
  const UNOWNED_DRAWING_COLOR = '#3388ff'

  /**
   * The Leaflet panes finished track is drawn in, one per piece, lowest first.
   *
   * Track is three lines stacked on the same route: a dark casing, the ties,
   * and the rail in the owner's color. Giving each piece its own pane puts
   * every casing below every set of ties, and every set of ties below every
   * rail, across all sections. With one shared pane, the newest section would
   * be drawn entirely over the older ones, and its casing would cut a dark
   * notch across the rail wherever two sections meet.
   *
   * The panes sit just above Leaflet's overlay pane (z-index 400) and below
   * the town markers (600), so towns stay clickable on top of the track.
   * Geoman draws in the rail pane too (see `setGeomanOptions`).
   */
  const TRACK_PANES = [
    { name: 'trackCasing', zIndex: 410 },
    { name: 'trackTies', zIndex: 420 },
    { name: 'trackRails', zIndex: 430 }
  ]
  const [CASING_PANE, TIES_PANE, RAILS_PANE] = TRACK_PANES.map((pane) => pane.name)

  /**
   * Creates the panes finished track is drawn in, if this map does not have
   * them yet. The panes belong to the map, not to this composable, so a later
   * mount on the same map finds them already there.
   *
   * Each pane holds its own SVG covering the whole map, which would swallow
   * every click meant for a pane below it. So the panes ignore the pointer,
   * and only the lines inside take clicks: Leaflet's CSS turns pointer events
   * back on for any interactive path, which is every track line here.
   */
  function createTrackPanes() {
    TRACK_PANES.forEach(({ name, zIndex }) => {
      if (mapStore.map.getPane(name)) return
      const pane = mapStore.map.createPane(name)
      pane.style.zIndex = zIndex
      pane.style.pointerEvents = 'none'
    })
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
   * Draws a track layer as railway: a rail in the owning player's color over
   * dark ties and a dark casing, so each player's network can be told apart
   * and pale colors still show up. Track whose owner is not a player in the
   * game (a damaged save) has a black rail.
   *
   * The layer itself becomes the rail. The casing and ties are two more lines
   * on the same route, kept on the layer as its `decorations` and each linked
   * back to it, so a click on any of the three finds the same section.
   *
   * @param {Object} layer - A track layer, created in the rail pane
   * @param {number} ownerId - Id of the player who built the track
   */
  function styleTracks(layer, ownerId) {
    const latlngs = layer.getLatLngs()
    layer.setStyle({ color: playerStore.colorOf(ownerId) ?? UNOWNED_TRACK_COLOR, ...RAIL_STYLE })

    layer.decorations = [
      L.polyline(latlngs, { ...CASING_STYLE, pane: CASING_PANE }),
      L.polyline(latlngs, { ...TIES_STYLE, pane: TIES_PANE })
    ]
    layer.decorations.forEach((decoration) => {
      decoration.trackLayer = layer
      decoration.addTo(mapStore.map)
    })
  }

  /**
   * Takes a track layer's casing and ties off the map, leaving the rail (the
   * layer itself) alone. Used before redrawing, and when a section is removed.
   *
   * @param {Object} layer - The track layer whose styling should be cleared
   */
  function removeStyling(layer) {
    layer.decorations?.forEach((decoration) => mapStore.map.removeLayer(decoration))
    layer.decorations = []
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
