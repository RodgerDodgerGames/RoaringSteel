// players store
// keep track of player data like current turn, turn order, etc.
// player names, cash,

import { defineStore } from 'pinia'
import { ref } from 'vue'

export const usePlayerStore = defineStore('playerStore', () => {
  const players = ref([])

  function addPlayer(player) {
    players.value.push(player)
  }

  return { players, addPlayer }
})
