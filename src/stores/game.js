// game store
// stores information related to the game state

import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useGameStore = defineStore('gameStore', () => {
  // STATE

  // selected states (from area select)
  const state = ref(null)

  // ACTIONS

  // set new state
  const setState = (newState) => {
    state.value = newState
  }

  return {
    // STATE
    state,
    // ACTIONS
    setState
  }
})
