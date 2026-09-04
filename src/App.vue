<script setup>
// IMPORTS
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import * as turf from '@turf/turf'

// import components
import AreaSelectView from '@/views/AreaSelectView.vue'
import GameView from './views/GameView.vue'
import WelcomeView from './views/WelcomeView.vue'
import NavHeader from './components/NavHeader.vue'
import GridProgressModal from './components/setup/GridProgressModal.vue'

// import stores
import { useGameStore } from '@/stores/game'
import { useTownsStore } from '@/stores/towns'
import { useGridStore } from '@/stores/grid'
import { useDemandCardsStore } from '@/stores/demandCards'

// import config
import { gridConfig } from '@/config/grid'

// import composables
import { useGamePersistence } from '@/composables/useGamePersistence'

// setup stores
const townsStore = useTownsStore()
const gameStore = useGameStore()
const gridStore = useGridStore()
const demandCardsStore = useDemandCardsStore()

// setup composables
const { autoSave } = useGamePersistence()

// STATE

// which view should be shown (start with welcome)
const currentView = ref('welcome')

// track if game setup is in progress
const isSettingUpGame = ref(false)

// region where game is being played
const { region } = storeToRefs(gameStore)

// show progress modal when setting up game and grid is being generated
const showProgressModal = computed(() => {
  return isSettingUpGame.value && gridStore.currentPhase !== ''
})

// View Map
const viewComponents = {
  welcome: WelcomeView,
  areaSelect: AreaSelectView,
  game: GameView
}

// METHODS

// Handle players confirmed event from WelcomeView
function handlePlayersConfirmed() {
  console.log('Players confirmed, navigating to area select')
  currentView.value = 'areaSelect'
}

// Handle game loaded event from WelcomeView
function handleGameLoaded() {
  console.log('Game loaded, navigating to game view')
  currentView.value = 'game'
}

// Handle play game button click
async function handlePlayGameClick() {
  if (region.value) {
    isSettingUpGame.value = true

    // run setup towns after the region is selected
    await townsStore.setupTowns(region.value.properties.STATE)
    // generate demand cards
    demandCardsStore.generateDemandCards()
    // run cost grid setup
    // generate grid using the selected region bounds
    const bounds = turf.bbox(region.value)
    await gridStore.generateGrid(region.value.properties.STATE, bounds, gridConfig.cellSize)

    isSettingUpGame.value = false
    // once grid is generated, set view to game
    currentView.value = 'game'
    // auto-save after setup completes
    autoSave()
  }
}
</script>

<template>
  <div id="app">
    <!-- Header Section -->
    <NavHeader v-if="currentView === 'game'" />
    <!-- Main Content Section -->
    <component
      :is="viewComponents[currentView]"
      @players-confirmed="handlePlayersConfirmed"
      @game-loaded="handleGameLoaded"
      @play-game="handlePlayGameClick"
    />
    <!-- Grid Progress Modal -->
    <GridProgressModal :is-active="showProgressModal" />
  </div>
</template>

<style scoped>
/* Additional styles for your app can go here */
</style>
