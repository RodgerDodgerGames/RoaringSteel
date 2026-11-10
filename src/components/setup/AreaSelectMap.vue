<!--
  AreaSelectMap.vue
  The map of the United States the board is chosen on, during game setup.

  It shows the boards of the grouping being offered — single states, or
  regions of several (see useBoardChoices.js) — each a shape to click, named
  on hover. The board chosen is filled in the game's red. The state lines
  are drawn faintly over every grouping, so a region's states can be made
  out, and they take no clicks.

  The basemap is the same terrain background the game is played on, without
  place names, so the boards' outlines are the clearest thing on it.

  Its credits are in the About dialog, which the Credits link in the corner
  opens, in place of Leaflet's credit line.

  @prop boards - The boards to choose from (GeoJSON features)
  @prop stateFeatures - Every state's outline, for the state lines
  @prop selectedKey - The key of the board chosen (see `boardKey`), or null
  @emits select - A board was clicked; given its feature
-->
<template>
  <!-- The wrapper holds the map and the Credits link laid over its corner -->
  <div class="map-frame">
    <div ref="mapContainer" class="map-container"></div>
    <MapCreditsLink />
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import MapCreditsLink from '@/components/map/MapCreditsLink.vue'
import { boardKey } from '@/composables/setup/boards'

const props = defineProps({
  boards: { type: Array, required: true },
  stateFeatures: { type: Array, required: true },
  selectedKey: { type: String, default: null }
})

const emit = defineEmits(['select'])

/**
 * How the boards are drawn, in the game's Western Line
 * colors: boards on timetable paper with a boxcar red edge, the chosen
 * board filled red, and the state lines in thin coal.
 */
const BOARD_STYLE = {
  color: '#7A2E22',
  weight: 1.5,
  fillColor: '#F1E6CF',
  fillOpacity: 0.15
}
const HOVER_STYLE = { weight: 2.5, fillOpacity: 0.6 }
const SELECTED_STYLE = { color: '#7A2E22', weight: 3, fillColor: '#7A2E22', fillOpacity: 0.5 }

/** The lower 48 states, which the map opens on */
const LOWER_48 = [
  [24.4, -124.8],
  [49.4, -66.9]
]

const mapContainer = ref(null)
let map = null
let boardsLayer = null

onMounted(() => {
  map = L.map(mapContainer.value, { attributionControl: false })
  map.fitBounds(LOWER_48)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.{ext}', {
    minZoom: 0,
    maxZoom: 18,
    ext: 'png'
  }).addTo(map)
  drawBoards()
})

onBeforeUnmount(() => {
  map?.remove()
  map = null
})

/**
 * The style a board is drawn in: chosen or not.
 * @param {Object} feature - The board
 * @returns {Object} Leaflet path style
 */
function styleFor(feature) {
  return boardKey(feature) === props.selectedKey
    ? { ...BOARD_STYLE, ...SELECTED_STYLE }
    : BOARD_STYLE
}

/** Draws the boards on offer, replacing any drawn before */
function drawBoards() {
  if (!map) return
  boardsLayer?.remove()
  boardsLayer = L.geoJSON(
    { type: 'FeatureCollection', features: props.boards },
    {
      style: styleFor,
      onEachFeature: (feature, layer) => {
        layer.bindTooltip(feature.properties.NAME, {
          sticky: true,
          direction: 'top',
          className: 'board-tooltip'
        })
        layer.on('mouseover', () => layer.setStyle({ ...styleFor(feature), ...HOVER_STYLE }))
        layer.on('mouseout', () => layer.setStyle(styleFor(feature)))
        layer.on('click', () => emit('select', feature))
      }
    }
  ).addTo(map)
}

// A new grouping redraws the boards; a new choice only restyles them
watch(() => props.boards, drawBoards)
watch(
  () => props.selectedKey,
  () => boardsLayer?.setStyle(styleFor)
)
</script>

<style scoped>
.map-frame {
  position: relative;
}

/* As tall as the window leaves room for under the panel, but never so short
   that a small state cannot be picked out */
.map-container {
  height: calc(100vh - 14rem);
  min-height: 360px;
  width: 100%;
}

/* A clicked board is marked by its fill; the browser's focus box round the
   shape would only add a stray rectangle */
.map-container :deep(.leaflet-interactive:focus) {
  outline: none;
}
</style>

<style>
/* The board's name, as it follows the cursor */
.board-tooltip {
  font-family: var(--font-label);
  font-size: 0.85rem;
}
</style>
