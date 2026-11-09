<!--
  PlayerConfirm.vue

  The Confirm Setup screen: the players chosen, and the settings, to look
  over before the game is set up. When confirmed, commits the store's setup
  roster to players with starting cash and sets the first player's turn.

  The settings are here because some of them change how the game is played
  from its first turn. The game settings come first; the display settings
  follow below them. They are edited straight into the player's settings
  (there is no Save here: Continue is the confirmation), and the game takes
  its copy of the game settings when it is set up (see the game store's
  `gameSettings`).

  On screens wider than a phone the players and the settings sit side by
  side; on a phone the settings follow the players.

  @prop {Array} players - The setup roster, for display: the people, then
                          the computer players (see `draftRoster`)
  @emits back - User wants to go back and edit players
  @emits confirmed - Players saved to store, ready to proceed
-->

<script setup>
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '@/stores/players'
import { useSettingsStore } from '@/stores/settings'
import GameSettings from '@/components/settings/GameSettings.vue'
import DisplaySettings from '@/components/settings/DisplaySettings.vue'
import { gameRules } from '@/config/game'

defineProps({
  players: {
    type: Array,
    required: true
  }
})

const emit = defineEmits(['back', 'confirmed'])
const playerStore = usePlayerStore()
const { settings } = storeToRefs(useSettingsStore())

/** Message shown when the roster could not be turned into players */
const commitError = ref('')

/**
 * Turns the setup roster into the game's players and initiates the first turn.
 * Starting cash comes from the game rules.
 */
function confirmPlayers() {
  commitError.value = ''

  if (!playerStore.commitDraftPlayers({ cash: gameRules.startingCash })) {
    commitError.value = playerStore.error || 'Could not start the game with these players.'
    return
  }

  // Give the first player in turn order the turn
  if (!playerStore.startGame()) {
    commitError.value = playerStore.error || 'Could not start the game with these players.'
    return
  }

  emit('confirmed')
}

// Handle going back to edit
function goBack() {
  emit('back')
}
</script>

<template>
  <div class="welcome-modal-container container has-background-info-dark has-text-light p-5 mt-4">
    <h3 class="is-size-3 mb-4">Confirm Setup</h3>

    <!-- Commit failure -->
    <div v-if="commitError" class="notification is-warning">
      {{ commitError }}
    </div>

    <!-- Side by side from tablet width up; stacked on a phone -->
    <div class="columns is-tablet mb-5">
      <!-- Player List -->
      <div class="column">
        <h4 class="caps-label mb-3">Players</h4>
        <div v-for="(player, index) in players" :key="index" class="mb-3">
          <div class="columns is-vcentered is-mobile">
            <div class="column is-narrow">
              <span class="is-size-5">Player {{ index + 1 }}:</span>
            </div>
            <div class="column">
              <div class="card">
                <div class="card-content" :style="{ backgroundColor: player.color }">
                  <div class="is-size-4 has-text-weight-bold has-text-black">
                    <span v-if="player.isBot" class="icon mr-2" aria-hidden="true">
                      <i class="fas fa-robot"></i>
                    </span>
                    {{ player.name }}
                    <span v-if="player.isBot" class="is-size-6 has-text-weight-normal">
                      (computer player)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Settings: the game settings first, the display settings below -->
      <div class="column">
        <div class="box confirm-setup__settings">
          <h4 class="caps-label mb-3">Game settings</h4>
          <GameSettings v-model="settings" />

          <h4 class="caps-label mt-5 mb-3">Display settings</h4>
          <DisplaySettings v-model="settings" />
        </div>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="buttons is-centered">
      <button @click="goBack" class="button is-warning is-light">Go Back</button>
      <button @click="confirmPlayers" class="button is-primary">Continue</button>
    </div>
  </div>
</template>

<style scoped>
.card-content {
  padding: 0.75rem;
}

/* The settings are a panel of their own, in the page's colors, so their
   labels and help text read as they do in the Settings dialog */
.confirm-setup__settings {
  text-align: left;
}
</style>
