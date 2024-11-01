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

  // ACTIONS

  // set new state
  const setState = (newState) => {
    console.log('setting new state', newState)
    state.value = newState
  }

  // set main map
  const setMainMap = (newMainMap) => {
    mainMap.value = newMainMap
  }

  // set towns layer
  const setTownsLayer = (newTownsLayer) => {
    townsLayer.value = newTownsLayer
  }

  return {
    // STATE
    state,
    mainMap,
    townsLayer,
    // ACTIONS
    setState,
    setMainMap,
    setTownsLayer
  }
})
