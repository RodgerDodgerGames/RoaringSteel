<!--
  AreaSelectMap.vue
  The map of the United States the board is chosen on, during game setup.

  It shows the boards of the grouping being offered — regions of several
  states, or single states (see useBoardChoices.js) — each a shape to click,
  named on hover. The board chosen is filled in the game's red. The state
  lines are drawn faintly over every grouping, so a region's states can be
  made out, and they take no clicks.

  Some groupings have boards that overlap (see config/regions.js), where a
  state is in two regions. The board under the cursor is brought to the top,
  so it shows whole and takes the click; moving into the shared state from
  either board's side picks that board. When the cursor leaves, the chosen
  board goes back on top, so it is never shown partly covered.

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
 * How the boards and state lines are drawn, in the game's Western Line
 * colors: boards on timetable paper with a boxcar red edge, the chosen
 * board filled red, and the state lines in thin coal.
 */
const BOARD_STYLE = {
  color: '#7A2E22',
  weight: 1.5,
  fillColor: '#F1E6CF',
  fillOpacity: 0.35
}
const HOVER_STYLE = { weight: 2.5, fillOpacity: 0.6 }
const SELECTED_STYLE = { color: '#7A2E22', weight: 3, fillColor: '#7A2E22', fillOpacity: 0.5 }
const STATE_LINE_STYLE = {
  color: '#2A211B',
  weight: 0.75,
  opacity: 0.45,
  fill: false,
  interactive: false
}

/** The lower 48 states, which the map opens on */
const LOWER_48 = [
  [24.4, -124.8],
  [49.4, -66.9]
]

const mapContainer = ref(null)
let map = null
let boardsLayer = null
let stateLinesLayer = null

onMounted(() => {
  map = L.map(mapContainer.value, { attributionControl: false })
  map.fitBounds(LOWER_48)
  // L.tileLayer('https://tiles.stadiamaps.com/tiles/stamen_terrain_background/{z}/{x}/{y}{r}.{ext}', {
  //   minZoom: 0,
  //   maxZoom: 18,
  //   ext: 'png'
  // }).addTo(map)
  // The state lines go in a pane of their own, above the boards, so they
  // show over a chosen board's fill
  map.createPane('stateLines').style.zIndex = 450
  map.getPane('stateLines').style.pointerEvents = 'none'
  drawBoards()
  drawStateLines()
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
        layer.on('mouseover', () => {
          layer.bringToFront()
          layer.setStyle({ ...styleFor(feature), ...HOVER_STYLE })
        })
        layer.on('mouseout', () => {
          layer.setStyle(styleFor(feature))
          raiseSelected()
        })
        layer.on('click', () => emit('select', feature))
      }
    }
  ).addTo(map)
}

/**
 * Brings the chosen board to the top of the boards, so where it overlaps
 * another board it is the one seen. Does nothing when no board on offer is
 * chosen.
 */
function raiseSelected() {
  boardsLayer?.eachLayer((layer) => {
    if (boardKey(layer.feature) === props.selectedKey) layer.bringToFront()
  })
}

/** Draws the state lines, once the outlines are in */
function drawStateLines() {
  if (!map || stateLinesLayer || props.stateFeatures.length === 0) return
  stateLinesLayer = L.geoJSON(
    { type: 'FeatureCollection', features: props.stateFeatures },
    { style: () => STATE_LINE_STYLE, pane: 'stateLines' }
  ).addTo(map)
}

// A new grouping redraws the boards; a new choice only restyles them
watch(
  () => props.boards,
  () => {
    drawBoards()
    raiseSelected()
  }
)
watch(() => props.stateFeatures, drawStateLines)
watch(
  () => props.selectedKey,
  () => {
    boardsLayer?.setStyle(styleFor)
    raiseSelected()
  }
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
