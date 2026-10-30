/**
 * Game Persistence Composable (useGamePersistence.js)
 *
 * Handles game save/load functionality including:
 * - Autosaves, kept in the browser's database (the newest 3; see database.js)
 * - File export/import (JSON)
 * - State serialization/deserialization
 * - Save data validation
 * - Clearing the game away to start a new one
 *
 * An autosave does not hold the grid. The grid is kept once in the
 * browser's database, apart from the saves (see stores/grid.js), and an
 * autosave records only what it was built from: state, bounds, cell size
 * and year of land cover. Loading the autosave finds the grid by those, or
 * builds it again from the same year if this browser no longer has it. An
 * exported file does hold the grid, packed (see cellGrid.js), so it loads
 * anywhere, even offline.
 *
 * Only saves written by this version of the game are loaded. The game is
 * still in development and its saves change shape often; carrying older
 * ones forward is not worth the code.
 *
 * @module composables/useGamePersistence
 */

import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/players'
import { useTownsStore } from '@/stores/towns'
import { useGridStore } from '@/stores/grid'
import { useDemandCardsStore } from '@/stores/demandCards'
import { useMapStore } from '@/stores/map'
import { useTrackStore } from '@/stores/track'
import { useSettingsStore } from '@/stores/settings'
import { useTrainsStore } from '@/stores/trains'
import { useBotsStore } from '@/stores/bots'
import { turnAfter } from '@/composables/turnOrder'
import { packGrid, unpackGrid } from '@/composables/map/cellGrid'
import { addAutoSave, getAutoSave, getAutoSaves as readAutoSaves, plain } from './database'

// 3.0.0: autosaves record where the grid came from instead of holding it.
// Only saves of this version are loaded.
const SAVE_VERSION = '3.0.0'

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
  const botsStore = useBotsStore()

  /**
   * Serializes the current game state into a JSON-safe object.
   * @param {string} name - Optional name for the save
   * @param {Object} [options]
   * @param {boolean} [options.withGrid] - Pack the grid into the save, as a
   *   file needs; an autosave leaves it out (see the top of this file)
   * @returns {Object} Serialized game state
   */
  function serializeGameState(name = 'Auto-save', { withGrid = false } = {}) {
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
      // What the grid was built from, by which a load finds it again (see
      // the grid store's `source`); null before there is a grid
      terrain: gridStore.source,
      // Packed into base64 text (see cellGrid.js), only when asked for
      grid: withGrid && gridStore.grid ? packGrid(gridStore.grid) : null,
      // The undealt deck, the cards played, every player's hand, and the
      // demand lines each player has pinned to the map
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
   *
   * The grid is found first, before anything of the game being replaced is
   * cleared: the save's own grid if it holds one (a file), or else the grid
   * it records it was played on (see the grid store's `gridForSave`). That
   * may mean building the grid again, with the setup progress showing, and
   * that can fail — offline, say. A load that fails there leaves the game
   * being played as it was, and the grid store's `error` says why.
   *
   * @param {Object} data - Saved game data
   * @returns {Promise<boolean>} True if successful
   */
  async function deserializeGameState(data) {
    try {
      // Validate before deserializing
      const validation = validateSaveData(data)
      if (!validation.valid) {
        console.error('Invalid save data:', validation.errors)
        return false
      }

      // Surface non-fatal problems without refusing the load
      validation.warnings.forEach((w) => console.warn('Save data warning:', w))

      let cellGrid = validation.grid
      if (!cellGrid && data.terrain) {
        cellGrid = await gridStore.gridForSave(data.terrain)
        if (!cellGrid) return false
      }

      // Clear the game being replaced
      resetGame()

      // Restore state
      if (data.game) gameStore.setGameState(data.game)
      if (data.players) {
        playerStore.setPlayers(data.players)
        ensureSingleActivePlayer()
      }
      if (data.towns) townsStore.setTowns(data.towns)
      if (cellGrid) gridStore.setGrid(cellGrid, data.terrain)
      // A file's grid is kept like one just built, so this game's autosaves
      // find it here, even offline
      if (validation.grid && data.terrain) await gridStore.keepGrid(data.terrain, validation.grid)
      // A damaged deck does not stop the load — the rest of the game is still
      // playable — but it is logged, since every hand will come up empty
      if (!demandCardsStore.setDeck(data.demandDeck)) {
        console.warn('Save data warning: the demand deck could not be read, so no cards are dealt')
      }
      trackStore.setTrack(data.track)
      trainsStore.setTrains(data.trains)
      if (data.mapView) mapStore.setMapView(data.mapView)
      // A save's settings replace the browser's (the player chose this: a game
      // picks up looking as it was saved)
      settingsStore.applySettings(data.settings)

      console.log('Game state restored successfully')
      return true
    } catch (e) {
      console.error('Error deserializing game state:', e)
      return false
    }
  }

  /**
   * Clears away every part of the game: region, turn, players, towns, grid,
   * demand cards, map view, track, trains, and what the computer players did
   * last. Used before a save is restored, and
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
    botsStore.reset()
  }

  /**
   * Ends the game being played, ready for the setup of a new one.
   *
   * The game is cleared away (see `resetGame`), and the setup roster is filled
   * with this game's people, names and colors, in turn order, and as many
   * computer players as this game had, so the same table can play again
   * without typing everything in a second time. The roster can still be
   * changed before the new game starts. Computer players are named and
   * colored afresh (see `draftRoster` in the player store).
   *
   * A player whose color the roster refuses — one already taken, which only a
   * damaged or hand-edited save could hold — is kept with the first color
   * still free, rather than left out.
   *
   * Saving the old game first, if wanted, is up to the caller: this does not
   * save anything.
   */
  function startNewGame() {
    const people = playerStore.players
      .filter((player) => !player.isBot)
      .map(({ name, color }) => ({ name, color }))
    const botCount = playerStore.players.filter((player) => player.isBot).length
    resetGame()
    people.forEach(
      (draft) =>
        playerStore.addDraftPlayer(draft) ?? playerStore.addDraftPlayer({ name: draft.name })
    )
    playerStore.setDraftBotCount(botCount)
  }

  /**
   * Validates save data structure and required fields.
   *
   * Errors block the load; warnings do not. Inconsistent turn state is a
   * warning because it is repairable — refusing the load would throw away an
   * otherwise good game over a single boolean.
   *
   * A save written by any other version of the game is refused (see the top
   * of this file).
   *
   * The grid a file holds is unpacked here, to see that it can be, and
   * handed back so the load does not unpack it a second time.
   *
   * @param {Object} data - Save data to validate
   * @returns {Object} {valid: boolean, errors: Array, warnings: Array,
   *   grid: the save's own grid, unpacked, or null if it holds none}
   */
  function validateSaveData(data) {
    const errors = []
    const warnings = []

    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['Save data must be an object'], warnings, grid: null }
    }

    if (data.version !== SAVE_VERSION) {
      errors.push(
        `Saved by another version of the game (${data.version ?? 'none'}); only ${SAVE_VERSION} saves load`
      )
    }
    if (!data.savedAt) errors.push('Missing savedAt field')
    if (!data.game) errors.push('Missing game field')
    if (!data.players) errors.push('Missing players field')

    // Check required nested fields
    if (data.game && !data.game.region) errors.push('Missing game.region')
    if (data.players && !Array.isArray(data.players)) errors.push('players must be an array')

    // A file's grid is saved packed (see cellGrid.js)
    const grid = data.grid ? unpackGrid(data.grid) : null
    if (data.grid && !grid) errors.push('grid could not be read')

    // Where an autosave's grid came from, to find it again by
    if (data.terrain != null && !isGridSource(data.terrain)) {
      errors.push('terrain does not say where the grid came from')
    }

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
      warnings,
      grid
    }
  }

  /**
   * Whether a save's `terrain` says enough to find its grid again, or build
   * it: a state, bounds, a cell size and a year (see the grid store's
   * `source`).
   * @param {*} terrain - The save's `terrain`
   * @returns {boolean} True if it does
   */
  function isGridSource(terrain) {
    return (
      typeof terrain === 'object' &&
      typeof terrain.state === 'string' &&
      Array.isArray(terrain.bounds) &&
      terrain.bounds.length === 4 &&
      terrain.bounds.every(Number.isFinite) &&
      Number.isFinite(terrain.cellSize) &&
      terrain.cellSize > 0 &&
      Number.isInteger(terrain.landCoverYear)
    )
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
   * Auto-saves the current game state to the browser's database, which keeps
   * the newest few (see database.js). The grid is left out (see the top of
   * this file), so an autosave is small and quick to write.
   *
   * The game is captured the moment this is called; only the writing waits.
   * A failure is logged rather than thrown: losing one autosave should not
   * stop play.
   *
   * @returns {Promise<boolean>} True if the save was written
   */
  async function autoSave() {
    try {
      const saveData = plain(serializeGameState('Auto-save'))
      const id = await addAutoSave(saveData)
      console.log(`Auto-saved as save ${id}`)
      return true
    } catch (e) {
      console.error('Error auto-saving game:', e)
      return false
    }
  }

  /**
   * Gets every autosave, newest first, with what the Load dialog shows of it.
   * @returns {Promise<Array>} Array of {id, data, metadata} objects; empty if
   *   the database cannot be read
   */
  async function getAutoSaves() {
    try {
      const saves = await readAutoSaves()
      return saves.map((data) => ({
        id: data.id,
        data,
        metadata: {
          name: data.name,
          savedAt: data.savedAt,
          turn: data.game?.turn || 0,
          playerNames: data.players?.map((p) => p.name) || []
        }
      }))
    } catch (e) {
      console.error('Error reading auto-saves:', e)
      return []
    }
  }

  /**
   * Loads an autosave.
   * @param {number} id - The autosave's id (from `getAutoSaves`)
   * @returns {Promise<boolean>} True if successful
   */
  async function loadAutoSave(id) {
    try {
      const data = await getAutoSave(id)
      if (!data) {
        console.error(`No auto-save found with id ${id}`)
        return false
      }
      return await deserializeGameState(data)
    } catch (e) {
      console.error(`Error loading auto-save ${id}:`, e)
      return false
    }
  }

  /**
   * Exports game state to a downloadable JSON file.
   * @param {string} filename - Name for the downloaded file (without .json extension)
   */
  function exportToFile(filename = 'roaring-steel-save') {
    try {
      const saveData = serializeGameState(filename, { withGrid: true })
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
   *
   * A file holds its own grid (see `exportToFile`). One that only says where
   * its grid came from, as an autosave does, is refused rather than built
   * again: the Load dialog shows that build only for autosaves.
   *
   * @param {File} file - File object from file input
   * @returns {Promise<boolean>} True if successful
   */
  async function importFromFile(file) {
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (data?.terrain && !data.grid) {
        console.error('Invalid save file: it does not hold its grid')
        return false
      }
      return await deserializeGameState(data)
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
    exportToFile,
    importFromFile,
    startNewGame
  }
}
