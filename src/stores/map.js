/**
 * Map Store (map.js)
 *
 * Manages Leaflet map state and references. Provides centralized access
 * to the map instance, view settings, and layer references.
 *
 * Used by:
 * - MainMap.vue for map initialization
 * - useBuildTrack.js for drawing operations
 * - useTowns.js for town marker management
 *
 * @module stores/map
 */

import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

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

  /** Current map zoom level */
  const mapZoom = ref(3)

  /** Current map center coordinates [lat, lng] */
  const mapCenter = ref([40, -100])

  /** Leaflet LayerGroup containing town markers */
  const townsLayer = shallowRef(null)

  /** Flag indicating if track drawing mode is active */
  const isDrawingActive = ref(false)

  // ACTIONS

  /** @param {Object} newMap - Leaflet map instance */
  const setMap = (newMap) => {
    map.value = newMap
  }

  /** @param {number} zoom - Zoom level (1-18) */
  const setMapZoom = (zoom) => {
    mapZoom.value = zoom
  }

  /** @param {Array<number>} center - [latitude, longitude] */
  const setMapCenter = (center) => {
    mapCenter.value = center
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
   * Resets the map store to initial state.
   * Note: Only resets serializable state (zoom/center), not Leaflet instances.
   */
  const reset = () => {
    mapZoom.value = 3
    mapCenter.value = [40, -100]
    isDrawingActive.value = false
    // Note: map and townsLayer are Leaflet instances and should not be reset here
  }

  /**
   * Sets the map view state (used for loading saved games).
   * @param {Object} viewState - Object with zoom and center properties
   */
  const setMapView = (viewState) => {
    if (viewState.zoom !== undefined) mapZoom.value = viewState.zoom
    if (viewState.center) mapCenter.value = viewState.center
  }

  return {
    // state
    map,
    mapZoom,
    mapCenter,
    townsLayer,
    isDrawingActive,
    // actions
    setMap,
    setMapZoom,
    setMapCenter,
    setIsDrawingActive,
    setTownsLayer,
    reset,
    setMapView
  }
})
