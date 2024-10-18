<template>
  <div>
    <DrawButton />
    <div ref="mapContainer" class="map-container"></div>
  </div>
</template>

<script setup>
import { onMounted, ref, provide } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useMap } from '@/composables/useMap'
import { useDrawing } from '@/composables/useDrawing'
import DrawButton from '@/components/DrawButton.vue'

const props = defineProps({
  towns: {
    type: Array,
    required: true
  }
})

const mapContainer = ref(null)
const map = ref(null)

const { addTownsToMap } = useMap()
const { initializeDrawing, toggleControls } = useDrawing(map)

// Provide the toggleControls function to the DrawButton component
provide('toggleControls', toggleControls)

onMounted(() => {
  // Initialize the Leaflet map
  map.value = L.map(mapContainer.value).setView([40, -100], 3) // Set center and zoom

  // Add a basemap tile layer (you can use any provider, here is OpenStreetMap)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map.value)

  // Call the function to add towns to the map
  addTownsToMap(map.value, props.towns)

  // Initialize drawing functionality
  initializeDrawing()
})
</script>

<style>
.map-container {
  height: 100vh;
  width: 100%;
}
</style>
