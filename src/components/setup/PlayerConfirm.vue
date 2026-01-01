<!--
  PlayerConfirm.vue

  Confirmation screen showing selected players before starting the game.
  When confirmed, saves players to the Pinia store with starting cash
  and sets the first player's turn.

  @prop {Array} players - Array of player objects from PlayerSelect
  @emits back - User wants to go back and edit players
  @emits confirmed - Players saved to store, ready to proceed
-->

<script setup>
import { usePlayerStore } from '@/stores/players'

const props = defineProps({
  players: {
    type: Array,
    required: true
  }
})

const emit = defineEmits(['back', 'confirmed'])
const playerStore = usePlayerStore()

/**
 * Saves players to the store with starting cash and initiates the first turn.
 * Starting cash is $20,000 per Empire Builder rules.
 */
function confirmPlayers() {
  // Remove all existing players using the store's removePlayer action
  const existingPlayerIds = playerStore.players.map((p) => p.id)
  existingPlayerIds.forEach((id) => {
    playerStore.removePlayer(id)
  })

  // Add all players to the store
  props.players.forEach((player) => {
    playerStore.addPlayer({
      name: player.name,
      color: player.color,
      cash: 20000 // Starting cash for Empire Builder
    })
  })

  // Set the first player's turn
  if (playerStore.players.length > 0) {
    playerStore.players[0].isTurn = true
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
