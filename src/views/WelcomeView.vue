<!--
  WelcomeView.vue

  The landing page and entry point for the game. Handles the initial
  game setup flow including player selection and confirmation.

  Flow:
  1. gameButtons - New Game / Load Game options
  2. playerSelect - Player name and color selection
  3. playerConfirm - Review and confirm player selections

  @emits players-confirmed - When players are confirmed and ready to proceed
-->

<script setup>
import { ref } from 'vue'
import PlayerSelect from '@/components/setup/PlayerSelect.vue'
import PlayerConfirm from '@/components/setup/PlayerConfirm.vue'
import LoadGameDialog from '@/components/dialogs/LoadGameDialog.vue'

const emit = defineEmits(['players-confirmed', 'game-loaded'])

// which pane should be shown
const activePane = ref('gameButtons')

// Store selected players for confirmation
const selectedPlayers = ref([])

// Dialog visibility
const showLoadDialog = ref(false)

function newGame() {
  console.log('new game clicked')
  activePane.value = 'playerSelect'
}

function loadGame() {
  console.log('load game clicked')
  showLoadDialog.value = true
}

function handleLoadDialogClose() {
  showLoadDialog.value = false
}

function handleGameLoaded() {
  showLoadDialog.value = false
  emit('game-loaded')
}

// Handle when player selection is done
function handlePlayerSelectDone(players) {
  selectedPlayers.value = players
  activePane.value = 'playerConfirm'
}

// Handle going back from confirmation to player select
function handleGoBack() {
  activePane.value = 'playerSelect'
}

// Handle final confirmation
function handleConfirmed() {
  console.log('Players confirmed and saved to store!')
  // Navigate to area select view
  emit('players-confirmed')
}
</script>

<template>
  <section class="hero is-fullheight">
    <div class="hero-body">
      <div id="welcomeContainer" class="container has-text-centered">
        <h1 class="title roaring-title">Welcome to Roaring Steel</h1>
        <h2 class="subtitle is-3">Your adventure begins here</h2>

        <!-- conditionally show user interactioncontent here -->

        <!-- Game buttons -->
        <div
          v-if="activePane === 'gameButtons'"
          class="buttons are-large mt-6 is-flex is-justify-content-center"
        >
          <button class="button is-info is-outlined mr-6" @click="newGame">New Game</button>
          <button class="button is-link is-outlined" @click="loadGame">Load Game</button>
        </div>

        <!-- Add player form -->
        <keep-alive>
          <PlayerSelect v-if="activePane === 'playerSelect'" @done="handlePlayerSelectDone" />
        </keep-alive>

        <!-- Player confirmation -->
        <PlayerConfirm
          v-if="activePane === 'playerConfirm'"
          :players="selectedPlayers"
          @back="handleGoBack"
          @confirmed="handleConfirmed"
        />
      </div>
    </div>

    <!-- Load Game Dialog -->
    <LoadGameDialog
      v-if="showLoadDialog"
      @close="handleLoadDialogClose"
      @game-loaded="handleGameLoaded"
    />
  </section>
</template>

<style scoped>
/* Additional styling for the welcome screen */
.hero {
  background-image: url('src/assets/images/Unknown.jpg');
  background-size: cover;
  background-position: center;
}
.roaring-title {
  font-family: 'Saddlebag';
  font-size: 4rem;
}
#welcomeContainer {
  margin-bottom: 30%;
}
</style>
