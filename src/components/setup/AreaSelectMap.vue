<!--
  AreaSelectMap.vue

  Interactive US map for state selection during game setup.
  Displays all US states as clickable polygons with hover tooltips.
  When a state is clicked, it is highlighted and the selection is
  emitted to the parent component.

  @emits state-click - GeoJSON feature object of the selected state
-->

<template>
  <div id="map" ref="mapContainer" class="map-container"></div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// define emit
const emit = defineEmits(['state-click'])

const mapContainer = ref(null)
let selectedLayer = null // Track the currently highlighted layer

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
            permanent: false,
            direction: 'top',
            className: 'state-tooltip'
          })

          // Click event: Highlight selected layer and emit event to parent
          layer.on('click', () => {
            highlightFeature(layer) // Highlight the selected layer
            stateClickHandler(feature) // Handle click event
          })
        }
      }).addTo(map)
    })
})

// Function to highlight the selected layer
function highlightFeature(layer) {
  // Reset style of previously selected layer
  if (selectedLayer) {
    selectedLayer.setStyle({
      color: '#000',
      weight: 2,
      fillColor: '#000',
      fillOpacity: 0.2
    })
  }

  // Style the newly selected layer
  layer.setStyle({
    color: '#00f',
    weight: 3,
    fillColor: '#00f',
    fillOpacity: 0.5
  })

  selectedLayer = layer // Update the selected layer reference
}

// Handle state click event and emit to parent
function stateClickHandler(selectedState) {
  console.log('Selected state:', selectedState.properties.NAME)
  emit('state-click', selectedState)
}
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
