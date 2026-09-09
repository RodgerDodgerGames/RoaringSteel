<!--
  DrawButtons.vue

  Track building control panel with drawing tools and cost display.
  Provides buttons to start/stop building and to remove track built this turn.
  Shows itemized costs for each track section, the running total, and what the
  active player has left to spend.

  @prop map - Leaflet map instance
  @prop towns - Towns layer for track connections
-->
<script setup>
import { useGridStore } from '@/stores/grid'
import { useMapStore } from '@/stores/map'
import { storeToRefs } from 'pinia'
import { formatCurrency } from '@/composables/utils'
import useBuildTrack from '@/composables/map/useBuildTrack' // Import the composable

// Define props for map and towns
const props = defineProps({
  map: {
    type: Object,
    required: true
  },
  towns: {
    type: Object,
    required: true
  }
})

// Store references for reactive state and grid data
const gridStore = useGridStore()
const { grid } = storeToRefs(gridStore)

// get isDrawingActive from map store
const mapStore = useMapStore()
const { isDrawingActive } = storeToRefs(mapStore)

// Setup state and computed properties
const {
  itemizedCosts,
  totalCost,
  pendingCost,
  availableToSpend,
  isOverBudget,
  buildError,
  hasTrackBeenDrawn,
  startDrawingLine,
  enableRemoveMode,
  cancelDrawing
} = useBuildTrack(props, grid, formatCurrency)
</script>

<template>
  <h4 class="title is-4">Building</h4>
  <!-- draw and cancel buttons -->
  <div class="block">
    <!-- draw button -->
    <button v-if="!isDrawingActive" class="button is-primary" @click="startDrawingLine">
      Start Building
    </button>

    <!-- save and cancel buttons -->
    <button v-else class="button is-danger" @click="cancelDrawing">Stop Building</button>
  </div>

  <!-- remove button -->
  <div class="block">
    <div v-if="hasTrackBeenDrawn" class="buttons">
      <button class="button is-danger" @click="enableRemoveMode">Remove</button>
      <div class="is-size-5">sections of track you have built this turn</div>
    </div>
  </div>

  <hr class="my-3" />

  <!-- what is left to spend, and why a section was turned away -->
  <div class="block">
    <div class="is-flex is-justify-content-space-between">
      <span>Available to build</span>
      <span class="has-text-weight-bold">{{ formatCurrency(availableToSpend) }}</span>
    </div>

    <p v-if="isOverBudget" class="notification is-warning is-light mt-2 p-2">
      This section costs {{ formatCurrency(pendingCost) }} — more than the
      {{ formatCurrency(availableToSpend) }} you have to spend. It cannot be built.
    </p>

    <p v-else-if="buildError" class="notification is-danger is-light mt-2 p-2">
      {{ buildError }}
    </p>
  </div>

  <!-- itemized costs and total cost -->
  <div class="block" v-if="itemizedCosts.length">
    <h4 class="title is-4">Track Costs</h4>
    <div class="mt-2">
      <div
        v-for="(cost, index) in itemizedCosts"
        :key="index"
        class="is-flex is-justify-content-space-between"
      >
        <span>Section {{ index + 1 }}</span>
        <span>{{ formatCurrency(cost) }}</span>
      </div>
      <hr class="mt-3 mb-3" />
      <div class="is-flex is-justify-content-space-between has-text-weight-bold">
        Total Cost: {{ formatCurrency(totalCost) }}
      </div>
    </div>
  </div>
</template>

<style scoped></style>
