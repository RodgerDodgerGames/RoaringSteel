<!--
  MapLegend.vue

  The map's key, floating in its bottom-left corner: what the town shapes
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
import { townIcon } from '@/composables/map/townIcons'
import { legendCommodities } from '@/composables/map/legend'
import { PIN_COLORS } from '@/config/demands'

const { towns } = storeToRefs(useTownsStore())
const playerStore = usePlayerStore()

// Remembered per browser; closed until the player first opens it
const isOpen = useStorage('roaringsteel_map_legend_open', false)

/** The town sizes, largest first, with the names the legend gives them */
const townRows = [
  { size: 'large', label: 'Large town' },
  { size: 'medium', label: 'Medium town' },
  { size: 'small', label: 'Small town' }
].map((row) => ({ ...row, ...townIcon(row.size) }))

/** Leaflet's own line blue, for a sample of track when no one has the turn */
const SAMPLE_TRACK_COLOR = '#3388ff'

/** The track sample is drawn in the color of the player whose turn it is */
const trackColor = computed(
  () => playerStore.colorOf(playerStore.activePlayer?.id) ?? SAMPLE_TRACK_COLOR
)

/** The ring round the halo sample, in the first color a pinned line gets */
const haloSample = `0 0 0 2px #fff, 0 0 0 5px ${PIN_COLORS[0]}`

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
            <img :src="row.url" :width="row.size" :height="row.size" alt="" />
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
            viewBox="0 0 28 14"
            width="28"
            height="14"
            aria-hidden="true"
          >
            <line
              x1="2"
              y1="7"
              x2="26"
              y2="7"
              stroke="#222"
              stroke-width="5"
              stroke-linecap="round"
            />
            <line
              x1="2"
              y1="7"
              x2="26"
              y2="7"
              stroke="#222"
              stroke-width="10"
              stroke-dasharray="1.5 5"
            />
            <line
              x1="2"
              y1="7"
              x2="26"
              y2="7"
              :stroke="trackColor"
              stroke-width="3"
              stroke-linecap="round"
            />
          </svg>
          Track, in its builder's color
        </li>
        <li class="map-legend__row">
          <span class="map-legend__symbol">
            <img
              class="map-legend__halo"
              :src="townRows[2].url"
              :width="townRows[2].size"
              :height="townRows[2].size"
              :style="{ boxShadow: haloSample }"
              alt=""
            />
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
  width: 28px;
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
