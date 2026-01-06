/**
 * Game Store (game.js)
 *
 * Manages global game state including the selected playing region
 * and current turn number. This is the central state for game progression.
 *
 * @module stores/game
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useGameStore = defineStore('gameStore', () => {
  // STATE

  /** The selected geographic region (GeoJSON FeatureCollection) */
  const region = ref(null)

  /** Current game turn number (starts at 0) */
  const turn = ref(0)

  // ACTIONS

  /**
   * Sets the playing region for the game.
   * @param {Object} newRegion - GeoJSON FeatureCollection defining the play area
   */
  function setRegion(newRegion) {
    console.log('setting new region', newRegion)
    region.value = newRegion
  }

  /**
   * Advances the game to the next turn.
   * Called after all players have completed their actions for the current turn.
   */
  function advanceTurn() {
    turn.value++
  }

  /**
   * Resets the game state to initial values.
   */
  function reset() {
    region.value = null
    turn.value = 0
  }

  /**
   * Sets the complete game state (used for loading saved games).
   * @param {Object} state - Game state object with region and turn
   */
  function setGameState(state) {
    if (state.region) region.value = state.region
    if (state.turn !== undefined) turn.value = state.turn
  }

  return {
    // STATE
    region,
    turn,
    // ACTIONS
    setRegion,
    advanceTurn,
    reset,
    setGameState
  }
})
