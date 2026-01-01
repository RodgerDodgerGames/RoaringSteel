<!--
  MainMap.vue

  The primary game map component built on Leaflet. Displays:
  - Stamen terrain background tiles
  - Town markers with size-based icons
  - Interactive popups for town information

  Integrates with:
  - mapStore: Stores map instance and view state
  - townsStore: Provides town data for markers
  - useTowns composable: Handles marker rendering

  The map instance is made globally available via the map store
  so other components (like useBuildTrack) can access it.
-->

<script setup>
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTowns } from '@/composables/map/useTowns'
import { useTownsStore } from '@/stores/towns'
import { useMapStore } from '@/stores/map'

const townsStore = useTownsStore()
const mapStore = useMapStore()
// get towns from store
const { towns } = storeToRefs(townsStore)
const { map, mapZoom, mapCenter } = storeToRefs(mapStore)

const mapContainer = ref(null)
const { addTownsToMap, townsLayer } = useTowns()

onMounted(() => {
  map.value = L.map(mapContainer.value).setView(mapCenter.value, mapZoom.value)

  // add map to store
  mapStore.setMap(map.value)

  L.tileLayer('https://tiles.stadiamaps.com/tiles/stamen_terrain_background/{z}/{x}/{y}{r}.{ext}', {
    minZoom: 0,
    maxZoom: 18,
    attribution:
      '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://www.stamen.com/" target="_blank">Stamen Design</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    ext: 'png'
  }).addTo(map.value)

  if (map.value) {
    // add towns to map
    addTownsToMap(map, towns)
    // add townsLayer to store
    mapStore.setTownsLayer(townsLayer)
  }
})

// Watchers to keep the store updated with map state changes
watch(mapZoom, (newZoom) => {
  if (map.value) {
    map.value.setZoom(newZoom)
  }
})

watch(mapCenter, (newCenter) => {
  if (map.value) {
    map.value.setView(newCenter)
  }
})
</script>

<template>
  <div>
    <div ref="mapContainer" class="map-container"></div>
  </div>
</template>

<style>
.map-container {
  height: 100vh;
  width: 100%;
}
</style>
