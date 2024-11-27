<script setup>
// IMPORTS
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import * as turf from '@turf/turf'

// import components
import AreaSelectView from '@/views/AreaSelectView.vue'
import GameView from './views/GameView.vue'
import WelcomeView from './views/WelcomeView.vue'
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

// STATE

// which view should be shown (start with welcome)
const currentView = ref('welcome')

// region where game is being played
const { region } = storeToRefs(gameStore)

// View Map
const viewComponents = {
  welcome: WelcomeView,
  areaSelect: AreaSelectView,
  game: GameView
}

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
    <NavHeader v-if="currentView === 'game'" />
    <!-- Main Content Section -->
    <component :is="viewComponents[currentView]" @play-game="handlePlayGameClick" />
  </div>
</template>

<style scoped>
/* Additional styles for your app can go here */
</style>
