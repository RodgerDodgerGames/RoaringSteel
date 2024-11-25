// players store
// keep track of player data like current turn, turn order, etc.
// player names, cash,

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const usePlayerStore = defineStore('playerStore', () => {
  // State

  // Example player structure:
  // { id: 1, name: 'Player 1', cash: 1000, isTurn: false, position: 0 }

  const players = ref([]) // Array of player objects

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
