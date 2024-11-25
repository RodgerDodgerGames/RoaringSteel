// src/stores/map.js
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useMapStore = defineStore('map', () => {
  ///////////////////////////////////////////////////////////////
  // STATE

  // map stuff
  const map = ref(null)
  const mapZoom = ref(3)
  const mapCenter = ref([40, -100])
  const townsLayer = ref(null)

  // drawing
  const isDrawingActive = ref(false)

  ///////////////////////////////////////////////////////////////
  // ACTIONS

  const setMap = (newMap) => {
    map.value = newMap
  }

  const setMapZoom = (zoom) => {
    mapZoom.value = zoom
  }

  const setMapCenter = (center) => {
    mapCenter.value = center
  }

  const setIsDrawingActive = (status) => {
    isDrawingActive.value = status
  }

  // update towns layer
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
