<!--
  GameOverDialog.vue

  Shown when someone wins: who won, and where every player finished — their
  cash and the major cities their track joins — winner first, then by cash.

  @emits close    - The players want to look at the board as it ended
  @emits new-game - The players want to start a new game
-->

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/players'
import { useVictory } from '@/composables/victory'
import { formatCurrency } from '@/composables/utils'

const emit = defineEmits(['close', 'new-game'])

const { winnerId } = storeToRefs(useGameStore())
const playerStore = usePlayerStore()
const { progress } = useVictory()

/** Every player with where they finished, winner first, then by cash */
const standings = computed(() =>
  playerStore.players
    .map((player) => ({ player, ...progress(player.id) }))
    .sort(
      (a, b) =>
        Number(b.player.id === winnerId.value) - Number(a.player.id === winnerId.value) ||
        b.cash - a.cash
    )
)

const winner = computed(() => playerStore.players.find((p) => p.id === winnerId.value))
</script>

<template>
  <div class="modal is-active">
    <div class="modal-background" @click="emit('close')"></div>
    <div class="modal-card">
      <header class="modal-card-head">
        <p class="modal-card-title">{{ winner?.name ?? 'Someone' }} has won!</p>
        <button class="delete" aria-label="Close" @click="emit('close')"></button>
      </header>
      <section class="modal-card-body">
        <table class="table is-fullwidth">
          <thead>
            <tr>
              <th>Player</th>
              <th class="has-text-right">Cash</th>
              <th class="has-text-right">Major cities joined</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in standings" :key="row.player.id">
              <td>
                <span class="game-over__swatch" :style="{ background: row.player.color }"></span>
                {{ row.player.name }}
              </td>
              <td class="has-text-right">{{ formatCurrency(row.cash) }}</td>
              <td class="has-text-right">{{ row.citiesJoined }} of {{ row.citiesNeeded }}</td>
            </tr>
          </tbody>
        </table>
      </section>
      <footer class="modal-card-foot buttons">
        <button class="button is-primary" @click="emit('new-game')">New game</button>
        <button class="button" @click="emit('close')">Look at the board</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.game-over__swatch {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
  margin-right: 0.4rem;
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--bulma-border);
}

/* Above the top bar (1100) and the map's controls */
.modal {
  z-index: 1200;
}
</style>
