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

  return {
    // STATE
    region,
    turn,
    // ACTIONS
    setRegion,
    advanceTurn
  }
})
