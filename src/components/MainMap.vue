<template>
  <div ref="mapContainer" class="map-container"></div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useMap } from '@/composables/useMap'

const props = defineProps({
  towns: {
    type: Array,
    required: true
  }
})

const mapContainer = ref(null)
let map

const { addTownsToMap } = useMap()

onMounted(() => {
  map = new maplibregl.Map({
    container: mapContainer.value,
    style: 'https://demotiles.maplibre.org/style.json',
    center: [-100, 40], // Initial center of the map
    zoom: 3 // Initial zoom level
  })

  map.on('load', () => {
    addTownsToMap(map, props.towns)
  })
})

watch(props.towns, (newTowns) => {
  if (map) {
    addTownsToMap(map, newTowns)
  }
})
</script>

<style scoped>
.map-container {
  width: 100%;
  height: 500px;
}
</style>
