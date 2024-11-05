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

  L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles &copy; Esri &mdash; Source: US National Park Service',
      maxZoom: 8
    }
  ).addTo(map.value)

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

.town-tooltip {
  background: none !important; /* Removes background */
  border: none !important; /* Removes border */
  box-shadow: none !important; /* Removes shadow */
  padding: 0 !important; /* Removes padding */
  font-size: 12px;
  font-weight: bold;
  text-shadow: 0px 0px 3px #ffffff;
}
</style>
