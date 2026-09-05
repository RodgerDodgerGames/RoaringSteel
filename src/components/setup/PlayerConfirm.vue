<!--
  PlayerConfirm.vue

  Confirmation screen showing selected players before starting the game.
  When confirmed, commits the store's setup roster to players with starting
  cash and sets the first player's turn.

  @prop {Array} players - The setup roster, for display
  @emits back - User wants to go back and edit players
  @emits confirmed - Players saved to store, ready to proceed
-->

<script setup>
import { ref } from 'vue'
import { usePlayerStore } from '@/stores/players'

defineProps({
  players: {
    type: Array,
    required: true
  }
})

const emit = defineEmits(['back', 'confirmed'])
const playerStore = usePlayerStore()

/** Message shown when the roster could not be turned into players */
const commitError = ref('')

/**
 * Turns the setup roster into the game's players and initiates the first turn.
 * Starting cash is $20,000 per Empire Builder rules.
 */
function confirmPlayers() {
  commitError.value = ''

  if (!playerStore.commitDraftPlayers({ cash: 20000 })) {
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
  <div class="welcome-modal-container container has-background-info-dark p-5 mt-4">
    <h3 class="is-size-3 mb-4">Confirm Players</h3>

    <!-- Commit failure -->
    <div v-if="commitError" class="notification is-warning">
      {{ commitError }}
    </div>

    <!-- Player List -->
    <div class="mb-5">
      <div v-for="(player, index) in players" :key="index" class="mb-3">
        <div class="columns is-vcentered is-mobile">
          <div class="column is-narrow">
            <span class="is-size-5">Player {{ index + 1 }}:</span>
          </div>
          <div class="column">
            <div class="card">
              <div class="card-content" :style="{ backgroundColor: player.color }">
                <div class="is-size-4 has-text-weight-bold has-text-black">{{ player.name }}</div>
              </div>
            </div>
          </div>
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
</style>
