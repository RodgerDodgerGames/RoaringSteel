<!-- src/components/map/MainMap.vue -->
<script setup>
// IMPORTS
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
// composables
import { useTowns } from '@/composables/map/useTowns'
// stores
import { useTownsStore } from '@/stores/towns'
import { useMapStore } from '@/stores/map'

// setup stores
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
