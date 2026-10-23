<!--
  PlayerCard.vue

  The head of the player dock: whose turn it is and how much cash they have.
  Everything below it in the dock is about this player, so this is the first
  thing read.

  The player's color is shown as a thick stripe rather than as the card's
  background, so the name stays readable whatever color was picked — black
  text on a dark blue or purple was unreadable.

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
  <div v-if="activePlayer" class="player-card" :style="{ '--player-color': activePlayer.color }">
    <div class="player-card__who">
      <span class="caps-label">Your turn</span>
      <span class="player-card__name">{{ activePlayer.name }}</span>
    </div>
    <div class="player-card__cash">
      <span class="caps-label">Cash</span>
      <span class="player-card__amount">{{ formatCurrency(activePlayer.cash) }}</span>
    </div>
  </div>
</template>

<style scoped>
.player-card {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1rem 0.8rem;
  border-left: 0.5rem solid var(--player-color);
  border-bottom: 1px solid var(--bulma-border-weak);
  background: var(--bulma-scheme-main);
}

.player-card__who,
.player-card__cash {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.player-card__cash {
  align-items: flex-end;
}

.player-card__name {
  overflow: hidden;
  font-size: 1.4rem;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--bulma-text-strong);
}

.player-card__amount {
  font-size: 1.4rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  color: var(--bulma-text-strong);
}
</style>
