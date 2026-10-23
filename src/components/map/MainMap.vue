<!--
  MainMap.vue

  The primary game map component built on Leaflet. Displays:
  - Stamen terrain background tiles
  - Everything outside the region being played grayed out (regionMask.js)
  - The grid cells counted as water shaded blue (waterMask.js)
  - Town markers with size-based icons
  - Each town's commodity icons, in the Plan view
  - Interactive popups for town information

  Integrates with:
  - mapStore: Stores map instance and view state
  - townsStore: Provides town data for markers
  - useTowns composable: Handles marker rendering
  - useMapView composable: Puts the map in the Plan or Build view chosen in
    the top bar (the game opens in Plan, showing the whole region)

  The map instance is made globally available via the map store
  so other components (like useBuildTrack) can access it.

  The map fills whatever box its parent gives it, and follows that box as it
  changes size (the demand strip below it collapsing, the window resizing).
-->

<script setup>
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, ref } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTowns } from '@/composables/map/useTowns'
import { useMapView } from '@/composables/map/useMapView'
import { useTownsStore } from '@/stores/towns'
import { useMapStore } from '@/stores/map'
import { useRegionMask } from '@/composables/map/regionMask'
import { useWaterMask } from '@/composables/map/waterMask'

const townsStore = useTownsStore()
const mapStore = useMapStore()
// get towns from store
const { towns } = storeToRefs(townsStore)
const { map } = storeToRefs(mapStore)

const mapContainer = ref(null)
const { addTownsToMap, townsLayer } = useTowns()
const mapView = useMapView()
const regionMask = useRegionMask()
const waterMask = useWaterMask()

onMounted(() => {
  // No starting view: useMapView gives the map its view below
  map.value = L.map(mapContainer.value)

  // add map to store
  mapStore.setMap(map.value)

  L.tileLayer('https://tiles.stadiamaps.com/tiles/stamen_terrain_background/{z}/{x}/{y}{r}.{ext}', {
    minZoom: 0,
    maxZoom: 18,
    attribution:
      '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://www.stamen.com/" target="_blank">Stamen Design</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    ext: 'png'
  }).addTo(map.value)

  // The commodity icons' license (CC BY) asks for a credit
  map.value.attributionControl.addAttribution(
    'Icons &copy; <a href="https://game-icons.net" target="_blank">game-icons.net</a> (CC BY 3.0)'
  )

  // Into the Plan view (or whichever the store holds) before the towns go on
  mapView.attach(map.value)

  if (map.value) {
    // The edge of the board: track may not be built in the gray
    regionMask.attach(map.value)
    // Water inside it, which track crosses only on a bridge
    waterMask.attach(map.value)
    // add towns to map
    addTownsToMap(map, towns)
    // add townsLayer to store
    mapStore.setTownsLayer(townsLayer.value)
  }
})

// The map goes when the game screen does (a new game, say). Leaflet keeps
// listening to the window until a map is removed, so one left behind would
// keep working on a container that is gone. The store lets go of it too, so
// nothing reaches the old map before the next game's is made. useTowns,
// called above, takes its layers off first: its own unmount hook was
// registered before this one.
onUnmounted(() => {
  map.value?.remove()
  mapStore.setMap(null)
  mapStore.setTownsLayer(null)
})

// Leaflet measures its container once and only re-measures when told. Without
// this, growing the container (e.g. collapsing the demand strip) leaves a gray
// band of unloaded tiles, and clicks land at the wrong coordinates. The Plan
// view is then refitted so the region still fills the new size.
useResizeObserver(mapContainer, () => {
  map.value?.invalidateSize()
  mapView.refit()
})
</script>

<template>
  <div ref="mapContainer" class="game-map"></div>
</template>

<style scoped>
.game-map {
  height: 100%;
  width: 100%;
}
</style>
