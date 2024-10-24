<template>
  <div id="map" ref="mapContainer" class="map-container"></div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Props to handle GeoJSON and click events
const props = defineProps({
  onStateClick: Function
})

const mapContainer = ref(null)

onMounted(() => {
  const map = L.map(mapContainer.value).setView([37.8, -96], 4)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map)

  // Load GeoJSON (replace with your path)
  fetch('/src/assets/us-states.geojson')
    .then((res) => res.json())
    .then((data) => {
      L.geoJSON(data, {
        style: () => ({
          color: '#3388ff',
          weight: 2,
          fillColor: '#3388ff',
          fillOpacity: 0.2
        }),
        onEachFeature: (feature, layer) => {
          layer.on('click', () => {
            // Emit state name back to the parent
            props.onStateClick(feature.properties.name)
          })
        }
      }).addTo(map)
    })
})
</script>

<style scoped>
.map-container {
  height: 500px;
  width: 100%;
}
</style>
