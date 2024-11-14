<!-- DrawButtons.vue -->
<script setup>
import { ref } from 'vue'
import { useGridStore } from '@/stores/grid'
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

// Setup state and computed properties
const isDrawingActive = ref(false)
const {
  itemizedCosts,
  totalCost,
  hasTrackBeenDrawn,
  startDrawingLine,
  enableRemoveMode,
  cancelDrawing,
  enableEditing
} = useBuildTrack(props, grid, isDrawingActive, formatCurrency)
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

  <!-- edit and remove buttons -->
  <div class="block">
    <div v-if="hasTrackBeenDrawn" class="buttons">
      <button class="button is-danger" @click="enableRemoveMode">Remove</button>
      -OR-
      <button class="button is-info" @click="enableEditing">Edit</button>
      <div class="is-size-5">sections of track you have built this turn</div>
    </div>
  </div>

  <hr class="my-3" />

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
