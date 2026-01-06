/**
 * Game Persistence Composable (useGamePersistence.js)
 *
 * Handles game save/load functionality including:
 * - Auto-save to localStorage (rotating 3 slots)
 * - File export/import (JSON)
 * - State serialization/deserialization
 * - Save data validation
 *
 * @module composables/useGamePersistence
 */

import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/players'
import { useTownsStore } from '@/stores/towns'
import { useGridStore } from '@/stores/grid'
import { useDemandCardsStore } from '@/stores/demandCards'
import { useMapStore } from '@/stores/map'

const SAVE_VERSION = '1.0.0'
const AUTOSAVE_PREFIX = 'roaringsteel_autosave_'
const AUTOSAVE_INDEX_KEY = 'roaringsteel_autosave_index'
const MAX_AUTOSAVES = 3

export function useGamePersistence() {
  const gameStore = useGameStore()
  const playerStore = usePlayerStore()
  const townsStore = useTownsStore()
  const gridStore = useGridStore()
  const demandCardsStore = useDemandCardsStore()
  const mapStore = useMapStore()

  /**
   * Serializes the current game state into a JSON-safe object.
   * @param {string} name - Optional name for the save
   * @returns {Object} Serialized game state
   */
  function serializeGameState(name = 'Auto-save') {
    return {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      name,
      game: {
        region: gameStore.region,
        turn: gameStore.turn
      },
      players: playerStore.players,
      mapView: {
        zoom: mapStore.mapZoom,
        center: mapStore.mapCenter
      },
      towns: townsStore.towns,
      grid: gridStore.grid,
      demandCards: demandCardsStore.demandCards
    }
  }

  /**
   * Deserializes a save object and restores all store states.
   * @param {Object} data - Saved game data
   * @returns {boolean} True if successful
   */
  function deserializeGameState(data) {
    try {
      // Validate before deserializing
      const validation = validateSaveData(data)
      if (!validation.valid) {
        console.error('Invalid save data:', validation.errors)
        return false
      }

      // Reset all stores first
      gameStore.reset()
      playerStore.reset()
      townsStore.reset()
      gridStore.reset()
      demandCardsStore.reset()
      mapStore.reset()

      // Restore state
      if (data.game) gameStore.setGameState(data.game)
      if (data.players) playerStore.setPlayers(data.players)
      if (data.towns) townsStore.setTowns(data.towns)
      if (data.grid) gridStore.setGrid(data.grid)
      if (data.demandCards) demandCardsStore.setDemandCards(data.demandCards)
      if (data.mapView) mapStore.setMapView(data.mapView)

      console.log('Game state restored successfully')
      return true
    } catch (e) {
      console.error('Error deserializing game state:', e)
      return false
    }
  }

  /**
   * Validates save data structure and required fields.
   * @param {Object} data - Save data to validate
   * @returns {Object} {valid: boolean, errors: Array}
   */
  function validateSaveData(data) {
    const errors = []

    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['Save data must be an object'] }
    }

    if (!data.version) errors.push('Missing version field')
    if (!data.savedAt) errors.push('Missing savedAt field')
    if (!data.game) errors.push('Missing game field')
    if (!data.players) errors.push('Missing players field')

    // Check required nested fields
    if (data.game && !data.game.region) errors.push('Missing game.region')
    if (data.players && !Array.isArray(data.players)) errors.push('players must be an array')

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Auto-saves the current game state to localStorage with rotation.
   * Keeps the last 3 saves in rotating slots.
   */
  function autoSave() {
    try {
      const saveData = serializeGameState('Auto-save')

      // Get current index (0, 1, or 2)
      const currentIndex = parseInt(localStorage.getItem(AUTOSAVE_INDEX_KEY) || '0', 10)

      // Calculate next index (rotate through 0, 1, 2)
      const nextIndex = (currentIndex + 1) % MAX_AUTOSAVES

      // Save to the next slot
      const slotKey = `${AUTOSAVE_PREFIX}${nextIndex}`
      localStorage.setItem(slotKey, JSON.stringify(saveData))

      // Update the index pointer
      localStorage.setItem(AUTOSAVE_INDEX_KEY, nextIndex.toString())

      console.log(`Auto-saved to slot ${nextIndex}`)
      return true
    } catch (e) {
      console.error('Error auto-saving game:', e)
      return false
    }
  }

  /**
   * Gets all available auto-saves from localStorage.
   * @returns {Array} Array of {index, data, metadata} objects, sorted newest first
   */
  function getAutoSaves() {
    const saves = []

    for (let i = 0; i < MAX_AUTOSAVES; i++) {
      const slotKey = `${AUTOSAVE_PREFIX}${i}`
      const saveStr = localStorage.getItem(slotKey)

      if (saveStr) {
        try {
          const data = JSON.parse(saveStr)
          saves.push({
            index: i,
            data,
            metadata: {
              name: data.name,
              savedAt: data.savedAt,
              turn: data.game?.turn || 0,
              playerNames: data.players?.map((p) => p.name) || []
            }
          })
        } catch (e) {
          console.error(`Error parsing save from slot ${i}:`, e)
        }
      }
    }

    // Sort by savedAt, newest first
    saves.sort((a, b) => new Date(b.metadata.savedAt) - new Date(a.metadata.savedAt))

    return saves
  }

  /**
   * Loads a specific auto-save by index.
   * @param {number} index - Auto-save slot index (0-2)
   * @returns {boolean} True if successful
   */
  function loadAutoSave(index) {
    try {
      const slotKey = `${AUTOSAVE_PREFIX}${index}`
      const saveStr = localStorage.getItem(slotKey)

      if (!saveStr) {
        console.error(`No auto-save found at slot ${index}`)
        return false
      }

      const data = JSON.parse(saveStr)
      return deserializeGameState(data)
    } catch (e) {
      console.error(`Error loading auto-save from slot ${index}:`, e)
      return false
    }
  }

  /**
   * Checks if any auto-saves exist.
   * @returns {boolean} True if at least one auto-save exists
   */
  function hasAutoSaves() {
    return getAutoSaves().length > 0
  }

  /**
   * Exports game state to a downloadable JSON file.
   * @param {string} filename - Name for the downloaded file (without .json extension)
   */
  function exportToFile(filename = 'roaring-steel-save') {
    try {
      const saveData = serializeGameState(filename)
      const jsonStr = JSON.stringify(saveData, null, 2)
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)

      // Create download link and trigger it
      const link = document.createElement('a')
      link.href = url
      link.download = `${filename}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Clean up the URL object
      URL.revokeObjectURL(url)

      console.log(`Exported game to ${filename}.json`)
      return true
    } catch (e) {
      console.error('Error exporting game to file:', e)
      return false
    }
  }

  /**
   * Imports game state from a JSON file.
   * @param {File} file - File object from file input
   * @returns {Promise<boolean>} True if successful
   */
  async function importFromFile(file) {
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      return deserializeGameState(data)
    } catch (e) {
      console.error('Error importing game from file:', e)
      return false
    }
  }

  return {
    serializeGameState,
    deserializeGameState,
    validateSaveData,
    autoSave,
    getAutoSaves,
    loadAutoSave,
    hasAutoSaves,
    exportToFile,
    importFromFile
  }
}
