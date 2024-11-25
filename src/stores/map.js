// src/stores/map.js
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useMapStore = defineStore('map', () => {
  // State
  const map = ref(null)
  const mapZoom = ref(null)
  const mapCenter = ref([])
  const isDrawingActive = ref(false)

  // Actions
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

  return {
    map,
    mapZoom,
    mapCenter,
    isDrawingActive,
    setMap,
    setMapZoom,
    setMapCenter,
    setIsDrawingActive
  }
})
