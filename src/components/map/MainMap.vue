<script setup>
// IMPORTS
import { storeToRefs } from 'pinia'
import { onMounted, ref } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
// composables
import { useTowns } from '@/composables/map/useTowns'
// stores
import { useTownsStore } from '@/stores/towns'
import { useGameStore } from '@/stores/game'

// STATE

// setup stores
const gameStore = useGameStore()
const townsStore = useTownsStore()
// get towns from store
const { towns } = storeToRefs(townsStore)

const mapContainer = ref(null)
const map = ref(null)

const { addTownsToMap, townsLayer } = useTowns()

onMounted(() => {
  map.value = L.map(mapContainer.value).setView([40, -100], 3)

  // add map to store
  gameStore.setMainMap(map)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map.value)

  if (map.value) {
    // add towns to map
    addTownsToMap(map, towns)
    // add townsLayer to store
    gameStore.setTownsLayer(townsLayer)
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
