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

// track if the setup flow owns the screen (covers the modal, including the
// error state after a failed attempt)
const isSettingUpGame = ref(false)

// track if an attempt is actually in flight, so a second click cannot start a
// concurrent run against the same stores
const isSetupRunning = ref(false)

// region where game is being played
const { region } = storeToRefs(gameStore)

// Cover the whole setup flow, not just grid generation. Town and demand card
// setup runs first and fetches a state's worth of census data, which used to
// happen behind an unchanged screen with the Play Game button still live.
const showProgressModal = computed(() => isSettingUpGame.value)

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
  if (!region.value || isSetupRunning.value) return

  isSettingUpGame.value = true
  isSetupRunning.value = true

  try {
    // run setup towns after the region is selected
    await townsStore.setupTowns(region.value.properties.STATE)
    // generate demand cards
    demandCardsStore.generateDemandCards()
    // run cost grid setup
    // generate grid using the selected region bounds
    const bounds = turf.bbox(region.value)
    const generated = await gridStore.generateGrid(
      region.value.properties.STATE,
      bounds,
      gridConfig.cellSize
    )

    // Leave the modal up on failure so it can show the error and offer a retry.
    // Entering the game view here would drop the player onto an empty map.
    if (!generated) return

    isSettingUpGame.value = false
    // once grid is generated, set view to game
    currentView.value = 'game'
    // auto-save after setup completes
    autoSave()
  } finally {
    isSetupRunning.value = false
  }
}

// Player asked to retry after a failed grid setup
function handleSetupRetry() {
  // Drop the error first so the modal shows progress again straight away,
  // rather than sitting on the old message through the town setup fetch.
  gridStore.clearError()
  handlePlayGameClick()
}

// Player backed out of a failed grid setup
function handleSetupCancel() {
  gridStore.reset()
  isSettingUpGame.value = false
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
    <GridProgressModal
      :is-active="showProgressModal"
      @retry="handleSetupRetry"
      @cancel="handleSetupCancel"
    />
  </div>
</template>

<style scoped>
/* Additional styles for your app can go here */
</style>
