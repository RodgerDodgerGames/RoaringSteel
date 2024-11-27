<template>
  <div>
    <h4 class="title is-4">Select Players</h4>
    <div class="field is-horizontal">
      <div class="field-label is-normal">
        <label class="label">Number of Players</label>
      </div>
      <div class="field-body">
        <div class="field">
          <div class="control">
            <input class="input" type="number" v-model.number="numPlayers" />
          </div>
        </div>
      </div>
    </div>

    <div v-for="n in numPlayers" :key="n" class="field is-horizontal">
      <div class="field-label is-normal">
        <label class="label">Player {{ n }}</label>
      </div>
      <div class="field-body">
        <div class="field">
          <div class="control">
            <input class="input" type="text" v-model="playerNames[n - 1]" />
          </div>
        </div>
      </div>
    </div>

    <div class="field is-grouped">
      <div class="control">
        <button class="button is-primary" @click="addPlayers">Add Players</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { usePlayerStore } from '@/stores/players'

const playerStore = usePlayerStore()
const numPlayers = ref(1)
const playerNames = ref([])

function addPlayers() {
  playerStore.addPlayers(playerNames.value)
}
</script>
