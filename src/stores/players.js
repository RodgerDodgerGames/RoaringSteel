/**
 * Player Store (players.js)
 *
 * Manages player data and turn order for the game.
 * Handles player creation, updates, removal, and turn cycling.
 *
 * Player Object Structure:
 * {
 *   id: number,        // Unique player ID (1-indexed)
 *   name: string,      // Player display name
 *   cash: number,      // Current money (starts at 0 or specified amount)
 *   isTurn: boolean,   // True if it's this player's turn
 *   color: string,     // Player's chosen color
 *   position: number   // Board position (for future use)
 * }
 *
 * @module stores/players
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const usePlayerStore = defineStore('playerStore', () => {
  // STATE

  /** Array of player objects in turn order */
  const players = ref([])

  // Getters
  /**
   * Get the currently active player.
   * @returns {Object} The active player object.
   */
  const activePlayer = computed(() => players.value.find((player) => player.isTurn))

  // Actions
  /**
   * Add a new player to the game.
   * @param {{name: string, cash?: number}} player The player to add.
   */
  function addPlayer(player) {
    players.value.push({
      id: players.value.length + 1,
      name: player.name,
      cash: player.cash || 0,
      isTurn: false,
      color: player.color,
      position: 0
    })
  }

  /**
   * Update an existing player.
   * @param {number} id The ID of the player to update.
   * @param {Object} updates The updates to apply to the player.
   */
  function updatePlayer(id, updates) {
    const player = players.value.find((p) => p.id === id)
    if (player) {
      Object.assign(player, updates)
    }
  }

  /**
   * Remove a player from the game.
   * @param {number} id The ID of the player to remove.
   */
  function removePlayer(id) {
    players.value = players.value.filter((player) => player.id !== id)
  }

  /**
   * End the current player's turn and switch to the next one.
   */
  function nextTurn() {
    const currentTurnIndex = players.value.findIndex((p) => p.isTurn)
    if (currentTurnIndex >= 0) {
      players.value[currentTurnIndex].isTurn = false
    }
    const nextIndex = (currentTurnIndex + 1) % players.value.length
    players.value[nextIndex].isTurn = true
  }

  return {
    // state
    players,
    // getters
    activePlayer,
    // actions
    addPlayer,
    updatePlayer,
    removePlayer,
    nextTurn
  }
})
