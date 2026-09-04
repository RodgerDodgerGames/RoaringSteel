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

  /** Loading state for async operations */
  const isLoading = ref(false)

  /** Error state for failed operations */
  const error = ref(null)

  // Getters
  /**
   * Get the currently active player.
   * @returns {Object} The active player object.
   */
  const activePlayer = computed(() => players.value.find((player) => player.isTurn))

  /**
   * Check if there are any players in the game.
   * @returns {boolean} True if players exist.
   */
  const hasPlayers = computed(() => players.value.length > 0)

  // Actions
  /**
   * Add a new player to the game.
   * @param {{name: string, color: string, cash?: number}} player The player to add.
   * @returns {boolean} True if player was added successfully.
   */
  function addPlayer(player) {
    error.value = null

    // Validate player object
    if (!player || typeof player !== 'object') {
      error.value = 'Invalid player object'
      return false
    }

    // Validate required fields
    if (!player.name || typeof player.name !== 'string') {
      error.value = 'Player must have a valid name'
      return false
    }

    if (!player.color || typeof player.color !== 'string') {
      error.value = 'Player must have a valid color'
      return false
    }

    // Validate name is not empty
    if (player.name.trim().length === 0) {
      error.value = 'Player name cannot be empty'
      return false
    }

    // Check for duplicate names
    const duplicateName = players.value.some(
      (p) => p.name.toLowerCase() === player.name.toLowerCase()
    )
    if (duplicateName) {
      error.value = `Player "${player.name}" already exists`
      return false
    }

    try {
      players.value.push({
        id: players.value.length + 1,
        name: player.name,
        cash: player.cash || 0,
        isTurn: false,
        color: player.color,
        position: 0
      })
      return true
    } catch (e) {
      error.value = `Failed to add player: ${e.message}`
      return false
    }
  }

  /**
   * Update an existing player.
   * @param {number} id The ID of the player to update.
   * @param {Object} updates The updates to apply to the player.
   * @returns {boolean} True if player was updated successfully.
   */
  function updatePlayer(id, updates) {
    error.value = null

    // Validate id
    if (!id || typeof id !== 'number') {
      error.value = 'Invalid player ID'
      return false
    }

    // Validate updates
    if (!updates || typeof updates !== 'object') {
      error.value = 'Invalid updates object'
      return false
    }

    const player = players.value.find((p) => p.id === id)
    if (!player) {
      error.value = `Player with ID ${id} not found`
      return false
    }

    try {
      // Validate name if being updated
      if (updates.name !== undefined) {
        if (typeof updates.name !== 'string' || updates.name.trim().length === 0) {
          error.value = 'Player name must be a non-empty string'
          return false
        }

        // Check for duplicate names (excluding self)
        const duplicateName = players.value.some(
          (p) => p.id !== id && p.name.toLowerCase() === updates.name.toLowerCase()
        )
        if (duplicateName) {
          error.value = `Player "${updates.name}" already exists`
          return false
        }
      }

      Object.assign(player, updates)
      return true
    } catch (e) {
      error.value = `Failed to update player: ${e.message}`
      return false
    }
  }

  /**
   * Remove a player from the game.
   * @param {number} id The ID of the player to remove.
   * @returns {boolean} True if player was removed successfully.
   */
  function removePlayer(id) {
    error.value = null

    // Validate id
    if (!id || typeof id !== 'number') {
      error.value = 'Invalid player ID'
      return false
    }

    const playerExists = players.value.some((p) => p.id === id)
    if (!playerExists) {
      error.value = `Player with ID ${id} not found`
      return false
    }

    try {
      players.value = players.value.filter((player) => player.id !== id)
      return true
    } catch (e) {
      error.value = `Failed to remove player: ${e.message}`
      return false
    }
  }

  /**
   * Begin the game by giving the first player in turn order the turn.
   * Any turn already assigned is cleared, so this is safe to call more than once.
   * @returns {boolean} True if the first turn was assigned successfully.
   */
  function startGame() {
    error.value = null

    if (players.value.length === 0) {
      error.value = 'No players in game'
      return false
    }

    players.value.forEach((player, index) => {
      player.isTurn = index === 0
    })
    return true
  }

  /**
   * Give one specific player the turn, clearing it from everyone else.
   * Used when restoring a save and when repairing inconsistent turn state.
   * @param {number} id The ID of the player who should have the turn.
   * @returns {boolean} True if the turn was assigned successfully.
   */
  function setActivePlayer(id) {
    error.value = null

    const target = players.value.find((p) => p.id === id)
    if (!target) {
      error.value = `Player with ID ${id} not found`
      return false
    }

    players.value.forEach((player) => {
      player.isTurn = player.id === id
    })
    return true
  }

  /**
   * End the current player's turn and switch to the next one.
   * @returns {boolean} True if turn was advanced successfully.
   */
  function nextTurn() {
    error.value = null

    if (players.value.length === 0) {
      error.value = 'No players in game'
      return false
    }

    try {
      const currentTurnIndex = players.value.findIndex((p) => p.isTurn)
      if (currentTurnIndex >= 0) {
        players.value[currentTurnIndex].isTurn = false
      }
      const nextIndex = (currentTurnIndex + 1) % players.value.length
      players.value[nextIndex].isTurn = true
      return true
    } catch (e) {
      error.value = `Failed to advance turn: ${e.message}`
      return false
    }
  }

  /**
   * Clear all players and errors from the store.
   */
  function reset() {
    players.value = []
    error.value = null
    isLoading.value = false
  }

  /**
   * Sets the complete players array (used for loading saved games).
   * @param {Array} playersArray - Array of player objects
   */
  function setPlayers(playersArray) {
    if (Array.isArray(playersArray)) {
      players.value = playersArray
    }
  }

  return {
    // state
    players,
    isLoading,
    error,
    // getters
    activePlayer,
    hasPlayers,
    // actions
    addPlayer,
    updatePlayer,
    removePlayer,
    startGame,
    setActivePlayer,
    nextTurn,
    reset,
    setPlayers
  }
})
