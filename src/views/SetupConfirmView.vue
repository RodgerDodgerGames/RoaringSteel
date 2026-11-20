<!--
  SetupConfirmView.vue

  The Confirm Setup page, the last step of setting up a new game, after the
  players and the board have been chosen: the players, the board and the
  settings, to look over before the game is set up.

  The settings are here because some of them change how the game is played
  from its first turn. The game settings come first; the display settings
  follow below them. They are edited straight into the player's settings
  (there is no Save here: Play Game is the confirmation), and the game takes
  its copy of the game settings when it is set up (see the game store's
  `gameSettings`).

  "Edit players" and "Change board" go back to those steps. Everything chosen
  is kept on the way: the players are draft players in the player store and
  the board is the game store's region, so coming back here shows them as
  they were left.

  "Play Game" commits the setup roster to players with starting cash, gives
  the first player the turn, and asks for the game to be set up (towns, grid
  and demand cards; see App.vue). The players are committed here, not when
  they are chosen, so a trip back to change them commits nothing early.

  On screens wider than a phone the players and the settings sit side by
  side; on a phone the settings follow the players.

  @emits edit-players - The player wants to go back and change the players
  @emits change-board - The player wants to go back and change the board
  @emits play-game - The players are committed; set the game up
-->

<script setup>
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '@/stores/players'
import { useGameStore } from '@/stores/game'
import { useSettingsStore } from '@/stores/settings'
import GameSettings from '@/components/settings/GameSettings.vue'
import DisplaySettings from '@/components/settings/DisplaySettings.vue'
import { gameRules } from '@/config/game'
import { boardLabel } from '@/composables/setup/boards'

const emit = defineEmits(['edit-players', 'change-board', 'play-game'])
const playerStore = usePlayerStore()
const gameStore = useGameStore()
const { settings } = storeToRefs(useSettingsStore())

/** The setup roster, for display: the people, then the computer players */
const { draftRoster: players } = storeToRefs(playerStore)

/** What the page says about the board chosen */
const board = computed(() => boardLabel(gameStore.region) ?? 'No board chosen')

/** Message shown when the roster could not be turned into players */
const commitError = ref('')

/**
 * Turns the setup roster into the game's players, gives the first player in
 * turn order the turn, and asks for the game to be set up. Starting cash
 * comes from the game rules.
 */
function playGame() {
  commitError.value = ''

  if (!playerStore.commitDraftPlayers({ cash: gameRules.startingCash })) {
    commitError.value = playerStore.error || 'Could not start the game with these players.'
    return
  }

  if (!playerStore.startGame()) {
    commitError.value = playerStore.error || 'Could not start the game with these players.'
    return
  }

  emit('play-game')
}
</script>

<template>
  <div class="section">
    <div class="container">
      <h2 class="title is-4 mb-3">Confirm Setup</h2>
      <p class="has-text-weight-bold mb-5">{{ board }}</p>

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
          <div class="box">
            <h4 class="caps-label mb-3">Game settings</h4>
            <GameSettings v-model="settings" />

            <h4 class="caps-label mt-5 mb-3">Display settings</h4>
            <DisplaySettings v-model="settings" />
          </div>
        </div>
      </div>

      <!-- Action Buttons. Play Game needs a board; the flow always has one by
           now, but the page should not offer a game it cannot set up. -->
      <div class="buttons is-centered">
        <button class="button is-warning is-light" @click="emit('edit-players')">
          Edit players
        </button>
        <button class="button is-warning is-light" @click="emit('change-board')">
          Change board
        </button>
        <button class="button is-primary" :disabled="!gameStore.region" @click="playGame">
          Play Game
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card-content {
  padding: 0.75rem;
}
</style>
