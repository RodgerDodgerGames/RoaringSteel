<!-- src/components/setup/PlayerConfirm.vue -->
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

// Handle confirmation - save players to store and emit event
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
  <div id="playerConfirmContainer" class="container has-background-info-dark p-5 mt-4">
    <h3 class="is-size-3 mb-4">Confirm Players</h3>

    <!-- Player List -->
    <div class="mb-5">
      <div v-for="(player, index) in players" :key="index" class="mb-3">
        <div class="columns is-vcentered is-mobile">
          <div class="column is-narrow">
            <span class="subtitle">Player {{ index + 1 }}:</span>
          </div>
          <div class="column">
            <div class="card">
              <div class="card-content" :style="{ backgroundColor: player.color }">
                <div class="title has-text-black">{{ player.name }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="buttons is-centered">
      <button @click="goBack" class="button is-warning">Go Back</button>
      <button @click="confirmPlayers" class="button is-success">Continue</button>
    </div>
  </div>
</template>

<style scoped>
#playerConfirmContainer {
  max-width: 70%;
  border-radius: 20px;
  margin-top: 15vh;
}

.player-list {
  max-height: 400px;
  overflow-y: auto;
}

.player-card {
  transition: transform 0.2s;
}

.player-card:hover {
  transform: translateX(5px);
}

.player-color-indicator {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 3px solid #fff;
}
</style>
