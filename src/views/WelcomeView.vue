<!--
  WelcomeView.vue

  The landing page and entry point for the game. Handles the initial
  game setup flow including player selection and confirmation.

  Flow:
  1. gameButtons - New Game / Load Game options
  2. playerSelect - Player name and color selection
  3. playerConfirm - Review and confirm player selections

  @prop initialPane - The step to open on. A new game started from the
                      Game menu skips the New Game / Load Game buttons and
                      opens on player selection.

  @emits players-confirmed - When players are confirmed and ready to proceed
-->

<script setup>
import { ref } from 'vue'
import PlayerSelect from '@/components/setup/PlayerSelect.vue'
import PlayerConfirm from '@/components/setup/PlayerConfirm.vue'
import LoadGameDialog from '@/components/dialogs/LoadGameDialog.vue'
import { debug } from '@/composables/debug'

const props = defineProps({
  initialPane: {
    type: String,
    default: 'gameButtons'
  }
})

const emit = defineEmits(['players-confirmed', 'game-loaded'])

// which pane should be shown
const activePane = ref(props.initialPane)

// Store selected players for confirmation
const selectedPlayers = ref([])

// Dialog visibility
const showLoadDialog = ref(false)

function newGame() {
  debug.log('new game clicked')
  activePane.value = 'playerSelect'
}

function loadGame() {
  debug.log('load game clicked')
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

// Handle going back from player select to the New Game / Load Game buttons
function handlePlayerSelectBack() {
  activePane.value = 'gameButtons'
}

// Handle going back from confirmation to player select
function handleGoBack() {
  activePane.value = 'playerSelect'
}

// Handle final confirmation
function handleConfirmed() {
  debug.log('Players confirmed and saved to store!')
  // Navigate to area select view
  emit('players-confirmed')
}
</script>

<template>
  <section class="hero is-fullheight">
    <div class="hero-body">
      <div id="welcomeContainer" class="container has-text-centered">
        <h1 class="title roaring-title">Welcome to Roaring Steel</h1>
        <h2 class="subtitle is-3 roaring-subtitle">Your adventure begins here</h2>

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
          <PlayerSelect
            v-if="activePane === 'playerSelect'"
            @done="handlePlayerSelectDone"
            @back="handlePlayerSelectBack"
          />
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
  background-image: url('@/assets/images/Unknown.jpg');
  background-size: cover;
  background-position: center;
}
.roaring-title {
  font-family: var(--font-welcome-title);
  font-size: 5rem;
  color: transparent;
  -webkit-text-stroke: hsl(41, 55%, 88%) 0.4px;
}
/* The night-sky picture is dark in light and dark mode alike, so the
   title and subtitle are always timetable paper */
.roaring-title,
.roaring-subtitle {
  color: var(--timetable-paper);
}
/* The two buttons keep the colors they had before the Western Line
   restyle: Bulma's default cyan for New Game and the old pink for Load
   Game. The palette's own info and link colors (steel blue, denim) all but
   vanish on the blue night sky. Bulma draws an outlined button's border and
   text from --bulma-button-h/s/l, so setting those here recolors only these
   two buttons and leaves is-info and is-link alone everywhere else. */
.button.is-info.is-outlined {
  --bulma-button-h: 198;
  --bulma-button-s: 100%;
  --bulma-button-l: 70%;
}
.button.is-link.is-outlined {
  --bulma-button-h: 350;
  --bulma-button-s: 93%;
  --bulma-button-l: 73%;
}
#welcomeContainer {
  margin-bottom: 30%;
}
</style>
