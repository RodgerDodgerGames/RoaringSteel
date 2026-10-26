/**
 * Game Persistence Composable (useGamePersistence.js)
 *
 * Handles game save/load functionality including:
 * - Auto-save to localStorage (rotating 3 slots, LZ-compressed)
 * - File export/import (JSON, uncompressed for compatibility)
 * - State serialization/deserialization
 * - Save data validation
 * - Clearing the game away to start a new one
 *
 * @module composables/useGamePersistence
 */

import LZString from 'lz-string'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/players'
import { useTownsStore } from '@/stores/towns'
import { useGridStore } from '@/stores/grid'
import { useDemandCardsStore } from '@/stores/demandCards'
import { useMapStore } from '@/stores/map'
import { useTrackStore } from '@/stores/track'
import { useSettingsStore } from '@/stores/settings'
import { useTrainsStore } from '@/stores/trains'
import { turnAfter } from '@/composables/turnOrder'

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
  const trackStore = useTrackStore()
  const settingsStore = useSettingsStore()
  const trainsStore = useTrainsStore()

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
        turn: gameStore.turn,
        // Null while the game is still on
        winnerId: gameStore.winnerId
      },
      players: playerStore.players,
      mapView: {
        zoom: mapStore.mapZoom,
        center: mapStore.mapCenter
      },
      towns: townsStore.towns,
      grid: gridStore.grid,
      // The undealt deck, the cards played, every player's hand, and the
      // demand lines each player has pinned to the map. Saves from before
      // hands existed held only the deck, under `demandCards`.
      demandDeck: {
        drawPile: demandCardsStore.drawPile,
        discardPile: demandCardsStore.discardPile,
        hands: demandCardsStore.hands,
        pins: demandCardsStore.pins
      },
      track: trackStore.segments,
      // Every player's train: its kind, loads, where it is, and what it has
      // done this turn
      trains: trainsStore.trains,
      // The player's display settings at the time of saving. Copied, so the
      // snapshot doesn't follow later changes to the live settings.
      settings: { ...settingsStore.settings }
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

      // Clear the game being replaced first
      resetGame()

      // Surface non-fatal problems without refusing the load
      validation.warnings.forEach((w) => console.warn('Save data warning:', w))

      // Restore state
      if (data.game) gameStore.setGameState(data.game)
      if (data.players) {
        playerStore.setPlayers(data.players)
        ensureSingleActivePlayer()
      }
      if (data.towns) townsStore.setTowns(data.towns)
      if (data.grid) gridStore.setGrid(data.grid)
      restoreDemandDeck(data)
      // Saves written before track was persisted have no `track` field; that is
      // a game with no track, not a broken save
      if (data.track) trackStore.setTrack(data.track)
      // Saves from before trains have none; each player then gets a new one,
      // not yet placed, the first time it is needed
      trainsStore.setTrains(data.trains)
      if (data.mapView) mapStore.setMapView(data.mapView)
      // A save's settings replace the browser's (the player chose this: a game
      // picks up looking as it was saved). Settings are not reset above, so a
      // save from before settings existed leaves the player's own in place.
      if (data.settings) settingsStore.applySettings(data.settings)

      console.log('Game state restored successfully')
      return true
    } catch (e) {
      console.error('Error deserializing game state:', e)
      return false
    }
  }

  /**
   * Clears away every part of the game: region, turn, players, towns, grid,
   * demand cards, map view, track and trains. Used before a save is restored, and
   * when the game is given up for a new one.
   *
   * The player's settings are not part of this: they belong to the person at
   * the browser rather than to any one game, so they carry over.
   */
  function resetGame() {
    gameStore.reset()
    playerStore.reset()
    townsStore.reset()
    gridStore.reset()
    demandCardsStore.reset()
    mapStore.reset()
    trackStore.reset()
    trainsStore.reset()
  }

  /**
   * Ends the game being played, ready for the setup of a new one.
   *
   * The game is cleared away (see `resetGame`), and the setup roster is filled
   * with this game's players, names and colors, in turn order, so the same
   * people can play again without typing everything in a second time. The
   * roster can still be changed before the new game starts.
   *
   * A player whose color the roster refuses — one already taken, which only a
   * damaged or hand-edited save could hold — is kept with the first color
   * still free, rather than left out.
   *
   * Saving the old game first, if wanted, is up to the caller: this does not
   * save anything.
   */
  function startNewGame() {
    const roster = playerStore.players.map(({ name, color }) => ({ name, color }))
    resetGame()
    roster.forEach(
      (draft) =>
        playerStore.addDraftPlayer(draft) ?? playerStore.addDraftPlayer({ name: draft.name })
    )
  }

  /**
   * Restores the demand deck and hands, from whichever format the save uses.
   *
   * A current save is restored exactly as it was written, short hands and
   * all, so saving and loading never changes who holds what.
   *
   * A save written before hands existed carries only the deck, as a bare list
   * under `demandCards`. Its players are dealt their hands here, so an old
   * game picks up with hands like a new one. Players are restored before this
   * runs, so the deal follows their turn order.
   *
   * A damaged deck does not stop the load — the rest of the game is still
   * playable — but it is logged, since every hand will come up empty.
   *
   * A save from before trains ran has its demands priced afresh, by today's
   * payoff rule.
   *
   * @param {Object} data - Saved game data
   */
  function restoreDemandDeck(data) {
    const isOldSave = !data.demandDeck
    const deck = isOldSave ? { drawPile: data.demandCards } : data.demandDeck
    // A save from before demand cards existed at all has neither field
    if (isOldSave && !data.demandCards) return

    if (!demandCardsStore.setDeck(deck)) {
      console.warn('Save data warning: the demand deck could not be read, so no cards are dealt')
      return
    }

    if (isOldSave) {
      demandCardsStore.dealHands(playerStore.players.map((player) => player.id))
    }

    // Saves from before trains ran were dealt cards priced by an older rule
    // that paid far too little to ever win; they are priced afresh. Towns are
    // restored before this runs, so every destination can be found.
    if (!data.trains) demandCardsStore.repriceDemands()
  }

  /**
   * Validates save data structure and required fields.
   *
   * Errors block the load; warnings do not. Inconsistent turn state is a
   * warning because it is repairable — refusing the load would throw away an
   * otherwise good game over a single boolean.
   *
   * @param {Object} data - Save data to validate
   * @returns {Object} {valid: boolean, errors: Array, warnings: Array}
   */
  function validateSaveData(data) {
    const errors = []
    const warnings = []

    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['Save data must be an object'], warnings }
    }

    if (!data.version) errors.push('Missing version field')
    if (!data.savedAt) errors.push('Missing savedAt field')
    if (!data.game) errors.push('Missing game field')
    if (!data.players) errors.push('Missing players field')

    // Check required nested fields
    if (data.game && !data.game.region) errors.push('Missing game.region')
    if (data.players && !Array.isArray(data.players)) errors.push('players must be an array')

    // Exactly one player should hold the turn, so the right player resumes play
    if (Array.isArray(data.players) && data.players.length > 0) {
      const activeCount = data.players.filter((p) => p.isTurn).length
      if (activeCount !== 1) {
        warnings.push(`Expected 1 active player, found ${activeCount}`)
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * Repairs turn state after a restore so exactly one player is active.
   * Falls back to the earliest player already flagged, or, when the save
   * recorded nobody, the player who starts the round the save is in. That is
   * usually the first player, but the second building round is played from
   * the last player back (see turnOrder.js).
   */
  function ensureSingleActivePlayer() {
    const players = playerStore.players
    if (players.length === 0) return

    const firstActive = players.find((p) => p.isTurn)
    const activeCount = players.filter((p) => p.isTurn).length
    if (activeCount === 1) return

    if (firstActive) {
      console.warn(`Repairing turn state: resuming play with ${firstActive.name}`)
      playerStore.setActivePlayer(firstActive.id)
    } else {
      // Game state is restored before players, so this is the saved round
      const opener = players[turnAfter(-1, players.length, gameStore.turn).nextPlace]
      console.warn(`Save recorded no active player: resuming play with ${opener.name}`)
      playerStore.setActivePlayer(opener.id)
    }
  }

  /**
   * Auto-saves the current game state to localStorage with rotation.
   * Keeps the last 3 saves in rotating slots.
   * Uses LZ-String compression to reduce storage size by ~60-80%.
   */
  function autoSave() {
    try {
      const saveData = serializeGameState('Auto-save')
      const jsonString = JSON.stringify(saveData)

      // Get current index (0, 1, or 2)
      const currentIndex = parseInt(localStorage.getItem(AUTOSAVE_INDEX_KEY) || '0', 10)

      // Calculate next index (rotate through 0, 1, 2)
      const nextIndex = (currentIndex + 1) % MAX_AUTOSAVES

      // Compress and save to the next slot
      const slotKey = `${AUTOSAVE_PREFIX}${nextIndex}`
      const compressed = LZString.compress(jsonString)
      localStorage.setItem(slotKey, compressed)

      // Update the index pointer
      localStorage.setItem(AUTOSAVE_INDEX_KEY, nextIndex.toString())

      const originalSize = new Blob([jsonString]).size
      const compressedSize = new Blob([compressed]).size
      const savings = ((1 - compressedSize / originalSize) * 100).toFixed(1)

      console.log(
        `Auto-saved to slot ${nextIndex} (${(originalSize / 1024).toFixed(1)}KB → ${(compressedSize / 1024).toFixed(1)}KB, ${savings}% reduction)`
      )
      return true
    } catch (e) {
      console.error('Error auto-saving game:', e)
      return false
    }
  }

  /**
   * Gets all available auto-saves from localStorage.
   * Decompresses LZ-compressed saves.
   * @returns {Array} Array of {index, data, metadata} objects, sorted newest first
   */
  function getAutoSaves() {
    const saves = []

    for (let i = 0; i < MAX_AUTOSAVES; i++) {
      const slotKey = `${AUTOSAVE_PREFIX}${i}`
      const compressed = localStorage.getItem(slotKey)

      if (compressed) {
        try {
          // Decompress and parse
          const jsonString = LZString.decompress(compressed)
          if (!jsonString) {
            console.error(`Error decompressing save from slot ${i}`)
            continue
          }

          const data = JSON.parse(jsonString)
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
   * Decompresses LZ-compressed save data.
   * @param {number} index - Auto-save slot index (0-2)
   * @returns {boolean} True if successful
   */
  function loadAutoSave(index) {
    try {
      const slotKey = `${AUTOSAVE_PREFIX}${index}`
      const compressed = localStorage.getItem(slotKey)

      if (!compressed) {
        console.error(`No auto-save found at slot ${index}`)
        return false
      }

      // Decompress and parse
      const jsonString = LZString.decompress(compressed)
      if (!jsonString) {
        console.error(`Error decompressing save from slot ${index}`)
        return false
      }

      const data = JSON.parse(jsonString)
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
    importFromFile,
    startNewGame
  }
}
