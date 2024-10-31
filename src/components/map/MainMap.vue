<script setup>
// IMPORTS
import { storeToRefs } from 'pinia'
import { onMounted, ref } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
// composables
import { useTowns } from '@/composables/map/useTowns'
import { useTrack } from '@/composables/map/useTrack'
// stores
import { useTownsStore } from '@/stores/towns'

// STATE

// get towns from store
const townsStore = useTownsStore()
const { towns } = storeToRefs(townsStore)

const mapContainer = ref(null)
const map = ref(null)

const { addTownsToMap, townsLayer } = useTowns()
const { initializeTracking, toggleControls, controlsVisible, drawingActive } = useTrack(map)

onMounted(() => {
  map.value = L.map(mapContainer.value).setView([40, -100], 3)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map.value)

  if (map.value) {
    addTownsToMap(map, towns)
    initializeTracking(townsLayer)
  }
})
</script>

<template>
  <div>
    <!-- Pass the necessary props to DrawButton -->
    <DrawButton
      :controls-visible="controlsVisible"
      :drawing-active="drawingActive"
      @toggle-drawing="toggleControls"
    />
    <div ref="mapContainer" class="map-container"></div>
  </div>
</template>

<style>
.map-container {
  height: 100vh;
  width: 100%;
}
</style>
