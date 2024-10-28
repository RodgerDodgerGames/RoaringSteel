<script setup>
// IMPORTS
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import * as turf from '@turf/turf'

// import components
import AreaSelect from '@/views/AreaSelect.vue'
import GameView from './views/GameView.vue'

// import stores
import { useGameStore } from '@/stores/game'
import { useTownsStore } from '@/stores/towns'
import { useGridStore } from '@/stores/grid'

// setup stores
const townsStore = useTownsStore()
const gameStore = useGameStore()
const gridStore = useGridStore()

// import composables

// STATE

// which view should be shown
const currentView = ref('areaSelect')

// state where game is being played
const { state } = storeToRefs(gameStore)

// METHODS

// Handle play game button click
async function handlePlayGameClick() {
  console.log('handlePlayGameClick', state.value)
  if (state.value) {
    // run setup towns after the state is selected
    await townsStore.setupTowns(state.value.properties.STATE)
    // run cost grid setup
    // generate grid using the selected state bounds
    const bounds = turf.bbox(state.value)
    const cellSize = 10000
    await gridStore.generateGrid(bounds, cellSize)
    // once grid is generated, set view to game
    currentView.value = 'game'
  }
}
</script>

<template>
  <div id="app">
    <!-- Main Content Section -->
    <section class="section">
      <div class="container">
        <AreaSelect v-if="currentView === 'areaSelect'" @play-game="handlePlayGameClick" />
        <GameView v-if="currentView === 'game'" />
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Additional styles for your app can go here */
</style>
