<script setup>
// IMPORTS
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import * as turf from '@turf/turf'

// import components
import AreaSelect from '@/views/AreaSelect.vue'

// import stores
import { useGameStore } from '@/stores/game'
import { useTownsStore } from '@/stores/towns'

// setup stores
const townsStore = useTownsStore()
const gameStore = useGameStore()

// import composables
import { useGridCostGenerator } from '@/composables/setup/useGridCostGenerator'

// STATE

// setup refs
const { state } = storeToRefs(gameStore)

// Handle play game button click
async function handlePlayGameClick() {
  console.log('handlePlayGameClick', state.value)
  if (state.value) {
    // run setup towns after the state is selected
    await townsStore.setupTowns(state.value.properties.STATE)
    // run cost grid setup
    const { grid, isGridGenerated, generateGrid } = useGridCostGenerator()
    // generate grid using the selected state bounds
    const bounds = turf.bbox(state.value)
    const cellSize = 10000
    await generateGrid(bounds, cellSize)
    console.log('Grid generated', grid.value, isGridGenerated.value)
  }
}
</script>

<template>
  <div id="app">
    <!-- Main Content Section -->
    <section class="section">
      <div class="container">
        <AreaSelect @play-game="handlePlayGameClick" />
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Additional styles for your app can go here */
</style>
