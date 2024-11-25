<script setup>
// IMPORTS
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import * as turf from '@turf/turf'

// import components
import AreaSelect from '@/views/AreaSelect.vue'
import GameView from './views/GameView.vue'
import NavHeader from './components/NavHeader.vue'

// import stores
import { useGameStore } from '@/stores/game'
import { useTownsStore } from '@/stores/towns'
import { useGridStore } from '@/stores/grid'
import { useDemandCardsStore } from '@/stores/demandCards'

// import config
import { gridConfig } from '@/config/grid'

// setup stores
const townsStore = useTownsStore()
const gameStore = useGameStore()
const gridStore = useGridStore()
const demandCardsStore = useDemandCardsStore()

// import composables

// STATE

// which view should be shown
const currentView = ref('areaSelect')

// region where game is being played
const { region } = storeToRefs(gameStore)

// METHODS

// Handle play game button click
async function handlePlayGameClick() {
  console.log('handlePlayGameClick', region.value)
  if (region.value) {
    // run setup towns after the region is selected
    await townsStore.setupTowns(region.value.properties.STATE)
    // generate demand cards
    demandCardsStore.generateDemandCards()
    // run cost grid setup
    // generate grid using the selected region bounds
    const bounds = turf.bbox(region.value)
    await gridStore.generateGrid(region.value.properties.STATE, bounds, gridConfig.cellSize)
    // once grid is generated, set view to game
    currentView.value = 'game'
  }
}
</script>

<template>
  <div id="app">
    <!-- Header Section -->
    <NavHeader />
    <!-- Main Content Section -->
    <section class="section">
      <AreaSelect v-if="currentView === 'areaSelect'" @play-game="handlePlayGameClick" />
      <GameView v-if="currentView === 'game'" />
    </section>
  </div>
</template>

<style scoped>
/* Additional styles for your app can go here */
</style>
