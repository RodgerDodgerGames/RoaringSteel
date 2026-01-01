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
import { ref } from 'vue'

export const useMapStore = defineStore('map', () => {
  // STATE

  /** Leaflet map instance reference */
  const map = ref(null)

  /** Current map zoom level */
  const mapZoom = ref(3)

  /** Current map center coordinates [lat, lng] */
  const mapCenter = ref([40, -100])

  /** Leaflet LayerGroup containing town markers */
  const townsLayer = ref(null)

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
    setTownsLayer
  }
})
