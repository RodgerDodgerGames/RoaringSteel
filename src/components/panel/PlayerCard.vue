<!--
  PlayerCard.vue

  Identity card for the player whose turn it is, shown above the side panel
  tabs so it stays visible no matter which tab is open.

  Shows the active player's name and cash on hand, on their chosen color.
  Renders nothing until a player holds the turn, so it stays out of the way
  during setup.
-->

<script setup>
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '@/stores/players'
import { formatCurrency } from '@/composables/utils'

const playerStore = usePlayerStore()
const { activePlayer } = storeToRefs(playerStore)
</script>

<template>
  <div v-if="activePlayer" class="card player-card mb-3">
    <div class="card-content" :style="{ backgroundColor: activePlayer.color }">
      <div class="is-flex is-align-items-center is-justify-content-space-between">
        <span class="is-size-5 has-text-weight-bold has-text-black">{{ activePlayer.name }}</span>
        <span class="is-size-5 has-text-black">{{ formatCurrency(activePlayer.cash) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card-content {
  padding: 0.75rem 1rem;
}
</style>
