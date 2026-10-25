/**
 * Game Store (game.js)
 *
 * Manages global game state including the selected playing region,
 * current turn number, and — once someone has won — the winner. This is the
 * central state for game progression.
 *
 * @module stores/game
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as turnOrder from '@/composables/turnOrder'

export const useGameStore = defineStore('gameStore', () => {
  // STATE

  /** The selected geographic region (GeoJSON FeatureCollection) */
  const region = ref(null)

  /** Current game turn number (starts at 0) */
  const turn = ref(0)

  /**
   * The id of the player who has won, or null while the game is still on.
   * Once set, the game is over: no more turns are played (see victory.js).
   */
  const winnerId = ref(null)

  // GETTERS

  /**
   * Whether this is one of the opening rounds, when players only build track
   * (the switchback start). Trains do not run until these are over.
   */
  const isBuildingRound = computed(() => turnOrder.isBuildingRound(turn.value))

  /** Whether someone has won, so the game is over */
  const isOver = computed(() => winnerId.value !== null)

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
   * Ends the game with a winner.
   * @param {number} playerId - The player who has won
   */
  function declareWinner(playerId) {
    winnerId.value = playerId
  }

  /**
   * Resets the game state to initial values.
   */
  function reset() {
    region.value = null
    turn.value = 0
    winnerId.value = null
  }

  /**
   * Sets the complete game state (used for loading saved games).
   * @param {Object} state - Game state object with region and turn, and the
   *   winner's id once the game is over (saves from before games could be
   *   won have none)
   */
  function setGameState(state) {
    if (state.region) region.value = state.region
    if (state.turn !== undefined) turn.value = state.turn
    winnerId.value = Number.isInteger(state.winnerId) ? state.winnerId : null
  }

  return {
    // STATE
    region,
    turn,
    winnerId,
    // GETTERS
    isBuildingRound,
    isOver,
    // ACTIONS
    setRegion,
    advanceTurn,
    declareWinner,
    reset,
    setGameState
  }
})
