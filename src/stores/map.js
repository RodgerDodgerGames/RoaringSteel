/**
 * Map Store (map.js)
 *
 * Manages Leaflet map state and references. Provides centralized access
 * to the map instance, view settings, and layer references.
 *
 * The map is seen in one of two views, Plan or Build (see
 * composables/map/mapViews.js). The view is chosen in the top bar and
 * applied to the map by useMapView.
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
import { MAP_VIEWS, PLAN_VIEW } from '@/composables/map/mapViews'

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

  /** Leaflet LayerGroup containing town markers */
  const townsLayer = shallowRef(null)

  /** Flag indicating if track drawing mode is active */
  const isDrawingActive = ref(false)

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
    return true
  }

  /** @param {boolean} status - Whether drawing mode is active */
  const setIsDrawingActive = (status) => {
    isDrawingActive.value = status
  }

  /** @param {Object} newTownsLayer - Leaflet LayerGroup with town markers */
  const setTownsLayer = (newTownsLayer) => {
    townsLayer.value = newTownsLayer
  }

  /**
   * Resets the map store to initial state: the Plan view, with no Build view
   * position yet.
   * Note: Only resets serializable state, not Leaflet instances.
   */
  const reset = () => {
    viewMode.value = PLAN_VIEW
    mapZoom.value = null
    mapCenter.value = null
    isDrawingActive.value = false
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
    townsLayer,
    isDrawingActive,
    // actions
    setMap,
    setViewMode,
    setIsDrawingActive,
    setTownsLayer,
    reset,
    setMapView
  }
})
