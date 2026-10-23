<!--
  MapLegend.vue

  The map's key, floating in its bottom-left corner: what the town icons
  mean, what track looks like, what the ring round a town or icon means, and
  which commodity each icon stands for.

  Folded down to a "Legend" button until the player opens it, so it only
  covers the map when it is wanted. Whether it is open is remembered in the
  browser, like the folds of the game screen's other sections; it is not
  part of a saved game.

  Only the commodities produced on this map are listed (see legend.js), so
  the list stays short enough to scan.
-->

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useStorage } from '@vueuse/core'
import { useTownsStore } from '@/stores/towns'
import { usePlayerStore } from '@/stores/players'
import { TOWN_ICONS, townIconHtml } from '@/composables/map/townIcons'
import { legendCommodities } from '@/composables/map/legend'
import { haloShadow } from '@/composables/map/useTowns'
import {
  UNOWNED_TRACK_COLOR,
  RAIL_STYLE,
  CASING_STYLE,
  TIES_STYLE
} from '@/composables/map/trackStyles'
import { PIN_COLORS } from '@/config/demands'

const { towns } = storeToRefs(useTownsStore())
const playerStore = usePlayerStore()

// Remembered per browser; closed until the player first opens it
const isOpen = useStorage('roaringsteel_map_legend_open', false)

/**
 * The town sizes, largest first, with the names the legend gives them. Each
 * is drawn with the map's own markup, shape and building, as the Build view
 * shows it; the Plan view's bare shapes are the same shapes.
 */
const townRows = [
  { size: 'large', label: 'Large town' },
  { size: 'medium', label: 'Medium town' },
  { size: 'small', label: 'Small town' }
].map((row) => ({ ...row, icon: TOWN_ICONS[row.size], html: townIconHtml(row.size) }))

/**
 * The track sample is drawn in the color of the player whose turn it is,
 * or black, as the map draws track with no owner, when no one has the turn
 */
const trackColor = computed(
  () => playerStore.colorOf(playerStore.activePlayer?.id) ?? UNOWNED_TRACK_COLOR
)

/**
 * Where the track sample's lines run, in the sample's own px. The ends are
 * inset by half the casing's width, so its round caps are not cut off.
 */
const SAMPLE_LENGTH = 36
const sampleEnds = {
  x1: CASING_STYLE.weight / 2,
  x2: SAMPLE_LENGTH - CASING_STYLE.weight / 2,
  y1: TIES_STYLE.weight / 2,
  y2: TIES_STYLE.weight / 2
}

/** The halo sample: a small town ringed in the first color a pinned line gets */
const haloSample = {
  icon: TOWN_ICONS.small,
  html: townIconHtml('small'),
  shadow: haloShadow([PIN_COLORS[0]])
}

const commodities = computed(() => legendCommodities(towns.value))
</script>

<template>
  <div class="map-legend">
    <button
      class="button is-small map-legend__toggle"
      :aria-expanded="isOpen"
      aria-controls="map-legend-panel"
      @click="isOpen = !isOpen"
    >
      <span class="icon"><i class="fas fa-circle-info" aria-hidden="true"></i></span>
      <span>Legend</span>
    </button>

    <div v-show="isOpen" id="map-legend-panel" class="box map-legend__panel">
      <h3 class="map-legend__heading">Towns</h3>
      <ul>
        <li v-for="row in townRows" :key="row.size" class="map-legend__row">
          <span class="map-legend__symbol">
            <!-- v-html is safe: the markup is built from fixed shapes and image URLs -->
            <span
              class="map-legend__town"
              :style="{ width: `${row.icon.size}px`, height: `${row.icon.size}px` }"
              v-html="row.html"
            ></span>
          </span>
          {{ row.label }}
        </li>
      </ul>

      <h3 class="map-legend__heading">On the map</h3>
      <ul>
        <li class="map-legend__row">
          <!-- A short piece of track, drawn the way the map draws it: a dark
               casing and ties under a rail in the builder's color -->
          <svg
            class="map-legend__symbol"
            :width="SAMPLE_LENGTH"
            :height="TIES_STYLE.weight"
            aria-hidden="true"
          >
            <line
              v-bind="sampleEnds"
              :stroke="CASING_STYLE.color"
              :stroke-width="CASING_STYLE.weight"
              stroke-linecap="round"
            />
            <line
              v-bind="sampleEnds"
              :stroke="TIES_STYLE.color"
              :stroke-width="TIES_STYLE.weight"
              :stroke-dasharray="TIES_STYLE.dashArray"
            />
            <line
              v-bind="sampleEnds"
              :stroke="trackColor"
              :stroke-width="RAIL_STYLE.weight"
              stroke-linecap="round"
            />
          </svg>
          Track, in its builder's color
        </li>
        <li class="map-legend__row">
          <span class="map-legend__symbol">
            <!-- v-html is safe: the markup is built from fixed shapes and image URLs -->
            <span
              class="map-legend__town map-legend__halo"
              :style="{
                width: `${haloSample.icon.size}px`,
                height: `${haloSample.icon.size}px`,
                boxShadow: haloSample.shadow
              }"
              v-html="haloSample.html"
            ></span>
          </span>
          A demand line you have pinned or are pointing at
        </li>
      </ul>

      <h3 class="map-legend__heading">Commodities</h3>
      <p v-if="commodities.length === 0" class="is-size-7 has-text-grey">
        No town on this map produces anything.
      </p>
      <ul v-else>
        <li
          v-for="commodity in commodities"
          :key="commodity.industry"
          class="map-legend__row"
          :title="commodity.name"
        >
          <span class="map-legend__symbol">
            <img class="map-legend__commodity" :src="commodity.iconUrl" alt="" />
          </span>
          <span class="map-legend__name">{{ commodity.name }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
/*
  Bottom-left of the map, clear of the credits (bottom right), above
  Leaflet's panes and controls. The panel opens upward from the button and
  stops short of the zoom buttons in the top-left corner (6rem leaves room
  for them and the gap below); a long commodity list scrolls inside it.
*/
.map-legend {
  position: absolute;
  bottom: 0.75rem;
  left: 0.75rem;
  z-index: 1000;
  display: flex;
  flex-direction: column-reverse;
  align-items: flex-start;
  gap: 0.5rem;
  max-height: calc(100% - 6rem);
}

.map-legend__toggle {
  flex: none;
  box-shadow: var(--bulma-shadow);
}

.map-legend__panel {
  width: 16rem;
  min-height: 0;
  overflow-y: auto;
  margin-bottom: 0;
  padding: 0.75rem;
  font-size: 0.85rem;
}

/* Small capitals, like the titles of the game screen's other sections */
.map-legend__heading {
  margin: 0.75rem 0 0.25rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--bulma-text-weak);
}

.map-legend__heading:first-child {
  margin-top: 0;
}

.map-legend__row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.15rem 0;
}

/* Every symbol gets the same width, so the names line up */
.map-legend__symbol {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
}

/*
  A town drawn as the map draws it: the box is its shape, and its building
  is placed from the box's corner and rises above it, so the box is lowered
  to leave room for the building inside the row
*/
.map-legend__town {
  position: relative;
  flex: none;
  margin-top: 10px;
}

.map-legend__halo {
  border-radius: 50%;
}

/* Drawn as the map draws them: white on a dark rounded square */
.map-legend__commodity {
  width: 18px;
  height: 18px;
  border-radius: 4px;
}

.map-legend__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
