<!--
  WelcomeView.vue

  The landing page and entry point for the game, and the first step of
  setting up a new game: choosing the players.

  Flow:
  1. gameButtons - New Game / Load Game options
  2. playerSelect - Player name and color selection

  A new game then goes on to choosing the board (AreaSelectView), and then
  to the Confirm Setup page (SetupConfirmView).

  @prop initialPane - The step to open on. A new game started from the
                      Game menu, or a player coming back from a later setup
                      step to change the players, skips the New Game /
                      Load Game buttons and opens on player selection.

  @emits players-chosen - When the players pass validation, to go on to
                          choosing the board
-->

<script setup>
import { ref } from 'vue'
import PlayerSelect from '@/components/setup/PlayerSelect.vue'
import LoadGameDialog from '@/components/dialogs/LoadGameDialog.vue'
import AboutButton from '@/components/AboutButton.vue'
import { debug } from '@/composables/debug'

const props = defineProps({
  initialPane: {
    type: String,
    default: 'gameButtons'
  }
})

const emit = defineEmits(['players-chosen', 'game-loaded'])

// which pane should be shown
const activePane = ref(props.initialPane)

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

// Handle when player selection is done. The roster stays in the player
// store as draft players; it is committed on the Confirm Setup page.
function handlePlayerSelectDone() {
  emit('players-chosen')
}

// Handle going back from player select to the New Game / Load Game buttons
function handlePlayerSelectBack() {
  activePane.value = 'gameButtons'
}
</script>

<template>
  <section class="hero is-fullheight">
    <div class="hero-body">
      <div id="welcomeContainer" class="container has-text-centered">
        <h1 class="title roaring-title">Welcome to Roaring Steel</h1>
        <h2 class="subtitle is-3 mb-6 roaring-subtitle">Your adventure begins here</h2>

        <!-- conditionally show user interactioncontent here -->

        <!-- Game buttons -->
        <div
          v-if="activePane === 'gameButtons'"
          class="buttons are-large mt-6 is-flex is-justify-content-center"
        >
          <button class="button is-info is-outlined mr-6" @click="newGame">New Game</button>
          <button class="button is-link is-outlined mr-6" @click="loadGame">Load Game</button>
          <!-- About button: what the game is, and its credits -->
          <AboutButton class="is-outlined is-light" />
        </div>

        <!-- Add player form -->
        <keep-alive>
          <PlayerSelect
            v-if="activePane === 'playerSelect'"
            @done="handlePlayerSelectDone"
            @back="handlePlayerSelectBack"
          />
        </keep-alive>
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
