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
const drawingActive = ref(false)
const {
  itemizedCosts,
  totalCost,
  drawButtonMessage,
  onDrawButtonClicked,
  enableRemoveMode,
  enableEditing
} = useBuildTrack(props, grid, drawingActive, formatCurrency)
</script>

<template>
  <div class="panel-block">
    <div class="buttons">
      <button
        :class="[drawingActive ? 'is-success' : 'is-primary', 'button']"
        @click="onDrawButtonClicked"
      >
        {{ drawButtonMessage }}
      </button>
      <button class="button is-danger" @click="enableRemoveMode">Remove</button>
      <button class="button is-info" @click="enableEditing">Edit</button>
    </div>
  </div>
  <div class="panel-block" v-if="itemizedCosts.length">
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

<style scoped>
.buttons {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}
</style>
