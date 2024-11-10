// game store
// stores information related to the game state

import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useGameStore = defineStore('gameStore', () => {
  // STATE

  // selected states (from area select)
  const state = ref(null)

  // main leaflet map
  const mainMap = ref(null)

  // townsLayer
  const townsLayer = ref(null)

  // game turn
  const turn = ref(0)

  // ACTIONS

  // set new state
  function setState(newState) {
    console.log('setting new state', newState)
    state.value = newState
  }

  // set main map
  function setMainMap(newMainMap) {
    mainMap.value = newMainMap
  }

  // set towns layer
  function setTownsLayer(newTownsLayer) {
    townsLayer.value = newTownsLayer
  }

  // advance the game turn
  function advanceTurn() {
    turn.value++
  }

  return {
    // STATE
    state,
    mainMap,
    townsLayer,
    // ACTIONS
    setState,
    setMainMap,
    setTownsLayer,
    advanceTurn
  }
})
