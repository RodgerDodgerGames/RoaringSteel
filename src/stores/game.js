// game store
// stores information related to the game state

import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useGameStore = defineStore('gameStore', () => {
  // STATE

  // selected states (from area select)
  const region = ref(null)

  // game turn
  const turn = ref(0)

  // ACTIONS

  // set new state
  function setRegion(newRegion) {
    console.log('setting new region', newRegion)
    region.value = newRegion
  }

  // advance the game turn
  function advanceTurn() {
    turn.value++
  }

  return {
    // STATE
    region,
    turn,
    // ACTIONS
    setRegion,
    advanceTurn
  }
})
