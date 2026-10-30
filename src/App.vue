<script setup>
// IMPORTS
import { ref, computed, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import * as turf from '@turf/turf'

// import components
import AreaSelectView from '@/views/AreaSelectView.vue'
import GameView from './views/GameView.vue'
import WelcomeView from './views/WelcomeView.vue'
import GridProgressModal from './components/setup/GridProgressModal.vue'

// import stores
import { useGameStore } from '@/stores/game'
import { useTownsStore } from '@/stores/towns'
import { useGridStore } from '@/stores/grid'
import { useDemandCardsStore } from '@/stores/demandCards'
import { usePlayerStore } from '@/stores/players'

// import config
import { gridConfig } from '@/config/grid'

// import composables
import { useGamePersistence } from '@/composables/useGamePersistence'
import { keepStorage } from '@/composables/database'

// setup stores
const townsStore = useTownsStore()
const gameStore = useGameStore()
const gridStore = useGridStore()
const demandCardsStore = useDemandCardsStore()
const playerStore = usePlayerStore()

// setup composables
const { autoSave, startNewGame } = useGamePersistence()

// STATE

// which view should be shown (start with welcome)
const currentView = ref('welcome')

// which step the welcome view opens on (see WelcomeView's initialPane)
const welcomePane = ref('gameButtons')

// Props for the view showing; only the welcome view takes any
const viewProps = computed(() =>
  currentView.value === 'welcome' ? { initialPane: welcomePane.value } : {}
)

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

  // Ask the browser to keep the saves and grids. Not waited for: Firefox
  // asks the player, and setup should not sit behind the question.
  keepStorage()

  try {
    // run setup towns after the region is selected
    await townsStore.setupTowns(region.value.properties.STATE)
    // Leave the modal up on failure, as for the grid below: it shows the
    // error and offers a retry
    if (townsStore.error) return
    // build the demand deck, then deal every player their opening hand in
    // turn order — the players were confirmed before the region was picked
    demandCardsStore.generateDemandCards()
    demandCardsStore.dealHands(playerStore.players.map((player) => player.id))
    // run cost grid setup
    // generate grid using the selected region bounds
    const bounds = turf.bbox(region.value)
    const generated = await gridStore.generateGrid(
      region.value.properties.STATE,
      bounds,
      gridConfig.cellSize,
      townsStore.dataWindow.middle
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

/**
 * The player gave up the game in progress for a new one, from the Game menu
 * (having saved it first, if they wanted to). Goes straight to choosing the
 * players, with this game's players filled in.
 *
 * The game screen is taken down before the game is cleared: cleared while
 * the map and dock were still up, they would be left showing a game that no
 * longer exists.
 */
async function handleNewGame() {
  currentView.value = null
  await nextTick()
  startNewGame()
  welcomePane.value = 'playerSelect'
  currentView.value = 'welcome'
}

// Player asked to retry after a failed town or grid setup
function handleSetupRetry() {
  // Drop the error first so the modal shows progress again straight away,
  // rather than sitting on the old message through the town setup fetch.
  townsStore.clearError()
  gridStore.clearError()
  handlePlayGameClick()
}

// Player backed out of a failed town or grid setup
function handleSetupCancel() {
  townsStore.clearError()
  gridStore.reset()
  isSettingUpGame.value = false
}
</script>

<template>
  <div id="app">
    <!-- Main Content Section. The game view brings its own top bar. -->
    <component
      :is="viewComponents[currentView]"
      v-if="currentView"
      v-bind="viewProps"
      @players-confirmed="handlePlayersConfirmed"
      @game-loaded="handleGameLoaded"
      @play-game="handlePlayGameClick"
      @new-game="handleNewGame"
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
