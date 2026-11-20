/**
 * Map Store (map.js)
 *
 * Manages Leaflet map state and references. Provides centralized access
 * to the map instance, view settings, and layer references.
 *
 * The map is seen in one of two views, Plan or Build (see
 * composables/map/mapViews.js). The view is chosen in the top bar and
 * applied to the map by useMapView. Each person has their own: as a turn
 * passes, the map goes to the view the next person left it in (`passView`).
 *
 * Used by:
 * - MainMap.vue for map initialization
 * - useMapView.js for switching between the Plan and Build views
 * - useBuildTrack.js for drawing operations
 * - useTowns.js for town marker management
 *
 * @module stores/map
 */

import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { BUILD_VIEW, MAP_VIEWS, PLAN_VIEW } from '@/composables/map/mapViews'

export const useMapStore = defineStore('map', () => {
  // STATE

  // The map and the towns layer are Leaflet objects, so they are held in
  // shallowRefs: reading them back gives the object itself, not a Vue proxy.
  // Leaflet keys each event listener on the object that added it. Geoman
  // switches its own tools off through the raw object, so anything switched
  // on through a proxy left its listeners behind. The drawing cursor did this
  // when a line was finished by double-click, and the zoom that followed threw
  // on a marker that was no longer on the map. Nothing inside a Leaflet object
  // needs watching, so deep reactivity buys nothing here.

  /** Leaflet map instance reference */
  const map = shallowRef(null)

  /**
   * Which view the map is in: PLAN_VIEW or BUILD_VIEW. Every game opens in
   * the Plan view, new or loaded, so players see the whole board first.
   */
  const viewMode = ref(PLAN_VIEW)

  /**
   * Zoom the Build view was last left at, so switching back returns there.
   * Null until the player first opens the Build view. Saved with the game.
   */
  const mapZoom = ref(null)

  /**
   * Center [lat, lng] the Build view was last left at. Null until the player
   * first opens the Build view. Saved with the game.
   */
  const mapCenter = ref(null)

  /**
   * A point [lat, lng] the Build view is to open over next time it opens,
   * instead of where it was last left: set when a town is clicked in the
   * Plan view, and used up as the Build view opens. Not saved.
   */
  const buildFocus = ref(null)

  /**
   * The view each person left the map in as their last turn ended, kept for
   * them while others play, so their next turn picks up where they were:
   * { [playerId]: { view, zoom, center } }, where `view` is PLAN_VIEW or
   * BUILD_VIEW and `zoom` and `center` are their Build view position (null
   * if they had not opened the Build view yet). Computer players have no
   * entry: they never look at the map. Saved with the game.
   *
   * `viewMode`, `mapZoom` and `mapCenter` above are what is on screen now,
   * for whoever holds the turn; this is everyone else's.
   */
  const playerViews = ref({})

  /**
   * Counts the times the map has been handed to a player's view (see
   * `passView`). A change of `viewMode` moves the map by itself, but a hand
   * from one person in the Build view to another in the Build view leaves
   * `viewMode` as it was, and the map would stay over the first person's
   * spot. useMapView watches this as well, so the map moves either way.
   */
  const viewHandoffs = ref(0)

  /** Leaflet LayerGroup containing town markers */
  const townsLayer = shallowRef(null)

  /** Flag indicating if track drawing mode is active */
  const isDrawingActive = ref(false)

  /**
   * While the player is choosing a town on the map — where to place or send
   * their train — what to do with the town they click: { prompt, onPick,
   * onPickPoint }, where `prompt` says what clicking does and `onPick` is
   * handed the town. `onPickPoint`, when there is one, is handed the node key
   * of a point on the track clicked instead, and the points the train can
   * stop at are marked while it is set (see trackStopMarkers.js).
   * Null the rest of the time, when clicking a town opens its popup.
   * Held shallowly: it carries a function, which has nothing to watch inside.
   */
  const townPicker = shallowRef(null)

  // ACTIONS

  /** @param {Object} newMap - Leaflet map instance */
  const setMap = (newMap) => {
    map.value = newMap
  }

  /**
   * Switches the map to the Plan or Build view. Anything else is refused, so
   * a typo cannot leave the map in a view nothing knows how to show.
   * @param {string} mode - PLAN_VIEW or BUILD_VIEW
   * @returns {boolean} True if the view was set
   */
  const setViewMode = (mode) => {
    if (!MAP_VIEWS.includes(mode)) {
      console.warn(`Unknown map view: ${mode}`)
      return false
    }
    viewMode.value = mode
    // A point the Build view was to open over is for the switch that set it;
    // going back to the Plan view drops it, so it cannot surface later
    if (mode === PLAN_VIEW) buildFocus.value = null
    return true
  }

  /**
   * Switches to the Build view over a point, such as a town clicked in the
   * Plan view (see `buildFocus`).
   * @param {Array<number>} center - [lat, lng] to open over
   */
  const showInBuildView = (center) => {
    buildFocus.value = center
    setViewMode(BUILD_VIEW)
  }

  /** Forgets the point the Build view was to open over, once it has */
  const clearBuildFocus = () => {
    buildFocus.value = null
  }

  /**
   * Hands the map from the player whose turn ended to the player whose turn
   * begins.
   *
   * The finishing player's view is kept for them (see `playerViews`). The
   * next player gets the view they left at the end of their own last turn,
   * Build position and all. Someone with nothing kept yet (they have not
   * ended a turn, or the save is from before views were kept) gets the Plan
   * view, and their Build view opens at its first opening, not over another
   * player's spot.
   *
   * A computer player's turn is shown in the Plan view, so the table watches
   * it build and run across the whole board. Computer players keep no view
   * of their own, and the Build position is left alone through their turns:
   * a person handed the turn after them gets their own back regardless.
   *
   * The same player playing again (the turn of a building round, or a solo
   * game) is handed their own view back, so nothing changes for them.
   *
   * @param {Object|null} fromPlayer - The player whose turn ended, if any
   * @param {Object|null} toPlayer - The player whose turn begins
   */
  const passView = (fromPlayer, toPlayer) => {
    if (fromPlayer && !fromPlayer.isBot) {
      playerViews.value = {
        ...playerViews.value,
        [fromPlayer.id]: { view: viewMode.value, zoom: mapZoom.value, center: mapCenter.value }
      }
    }

    let view = PLAN_VIEW
    if (toPlayer && !toPlayer.isBot) {
      const kept = playerViews.value[toPlayer.id]
      if (kept) view = kept.view
      mapZoom.value = kept?.zoom ?? null
      mapCenter.value = kept?.center ?? null
    }

    // A point the Build view was to open over belonged to the last turn
    buildFocus.value = null
    // Set after the position, so a switch into the Build view opens over it.
    // A change of view moves the map by itself; the same view needs the nudge
    if (viewMode.value === view) viewHandoffs.value++
    else viewMode.value = view
  }

  /**
   * Puts back each person's kept view from a saved game (see `playerViews`).
   * A save from before views were kept has none, and everyone starts from
   * the Plan view.
   *
   * Each view is checked as it comes in, and one that cannot be shown (a
   * damaged or hand-edited save) is dropped, so that person starts from the
   * Plan view too. It is checked here, not when the turn reaches them: by
   * then the turn is half handed over, and a position the map cannot go to
   * would throw partway through, leaving the finished turn never filed.
   * @param {Object} [views] - The save's `mapView.players`
   */
  const setPlayerViews = (views) => {
    const readable = views && typeof views === 'object' && !Array.isArray(views)
    playerViews.value = readable
      ? Object.fromEntries(Object.entries(views).filter(([, kept]) => isShowableView(kept)))
      : {}
  }

  /**
   * Whether a kept view is one the map can be put in: a view it knows, and a
   * Build position that is either not there yet (null) or a whole one, a
   * zoom and a [lat, lng] center.
   * @param {*} kept - One player's entry from a save
   * @returns {boolean} True if the map can show it
   */
  function isShowableView(kept) {
    if (!kept || typeof kept !== 'object' || !MAP_VIEWS.includes(kept.view)) return false
    const zoomOk = kept.zoom == null || Number.isFinite(kept.zoom)
    const centerOk =
      kept.center == null ||
      (Array.isArray(kept.center) && kept.center.length === 2 && kept.center.every(Number.isFinite))
    return zoomOk && centerOk
  }

  /** @param {boolean} status - Whether drawing mode is active */
  const setIsDrawingActive = (status) => {
    isDrawingActive.value = status
  }

  /**
   * Starts or stops choosing a town on the map (see `townPicker`).
   * @param {{prompt: string, onPick: Function, onPickPoint?: Function}|null}
   *   picker - What a click on a town (or a point on the track) does, or null
   *   to go back to opening a town's popup
   */
  const setTownPicker = (picker) => {
    townPicker.value = picker
  }

  /** @param {Object} newTownsLayer - Leaflet LayerGroup with town markers */
  const setTownsLayer = (newTownsLayer) => {
    townsLayer.value = newTownsLayer
  }

  /**
   * Resets the map store to initial state: the Plan view, with no Build view
   * position yet, and no player's view kept.
   * Note: Only resets serializable state, not Leaflet instances.
   */
  const reset = () => {
    viewMode.value = PLAN_VIEW
    mapZoom.value = null
    mapCenter.value = null
    buildFocus.value = null
    playerViews.value = {}
    isDrawingActive.value = false
    townPicker.value = null
    // Note: map and townsLayer are Leaflet instances and should not be reset here
  }

  /**
   * Records where the Build view is: kept up to date as the player moves
   * around it, and restored from a saved game.
   * @param {Object} viewState - Object with zoom and center properties
   */
  const setMapView = (viewState) => {
    if (viewState.zoom !== undefined) mapZoom.value = viewState.zoom
    if (viewState.center) mapCenter.value = viewState.center
  }

  return {
    // state
    map,
    viewMode,
    mapZoom,
    mapCenter,
    buildFocus,
    playerViews,
    viewHandoffs,
    townsLayer,
    isDrawingActive,
    townPicker,
    // actions
    setMap,
    setViewMode,
    showInBuildView,
    clearBuildFocus,
    passView,
    setPlayerViews,
    setIsDrawingActive,
    setTownPicker,
    setTownsLayer,
    reset,
    setMapView
  }
})
