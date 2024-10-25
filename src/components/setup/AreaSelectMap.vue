<template>
  <div id="map" ref="mapContainer" class="map-container"></div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'

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
  fetch('/data/us-states.geojson')
    .then((res) => res.json())
    .then((data) => {
      L.geoJSON(data, {
        style: () => ({
          color: '#000',
          weight: 2,
          fillColor: '#000',
          fillOpacity: 0.2
        }),
        onEachFeature: (feature, layer) => {
          // Bind hover tooltip to show state name
          layer.bindTooltip(feature.properties.NAME, {
            permanent: false, // only show on hover
            direction: 'top',
            className: 'state-tooltip' // for custom styling if needed
          })

          // Click event: Notify parent of the selected state
          layer.on('click', () => {
            props.onStateClick(feature)
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

.state-tooltip {
  font-weight: bold;
  background: #fff;
  border: 1px solid #ddd;
  padding: 4px;
}
</style>
