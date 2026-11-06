/**
 * Game Store (game.js)
 *
 * Manages global game state including the selected playing region,
 * current turn number, and — once someone has won — the winner. This is the
 * central state for game progression.
 *
 * It also holds the settings this game is played by (`gameSettings`), taken
 * from the player's settings as the game starts and fixed from then on, and
 * which help banners the players have dismissed in this game.
 *
 * @module stores/game
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as turnOrder from '@/composables/turnOrder'
import { boardScaleFor } from '@/composables/boardScale'
import { gameSettingsFrom } from '@/stores/settings'

/**
 * The rules a game saved before game settings existed was played by: track
 * had to start in a major city then. Such a save goes on by them, rather
 * than changing the rules part way through a game.
 */
const RULES_BEFORE_GAME_SETTINGS = Object.freeze({ requireMajorCityStart: true })

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

  /**
   * The game settings this game is played by (see GAME_SETTINGS in the
   * settings store), such as whether track must start in a major city.
   * Copied from the player's settings when the game starts, saved with the
   * game, and not changed during play.
   */
  const gameSettings = ref(gameSettingsFrom({}))

  /**
   * The help banners dismissed for the rest of this game, by name (see
   * useHelpScreens.js). Saved with the game.
   */
  const dismissedHelp = ref([])

  // GETTERS

  /**
   * Whether this is one of the opening rounds, when players only build track
   * (the switchback start). Trains do not run until these are over.
   */
  const isBuildingRound = computed(() => turnOrder.isBuildingRound(turn.value))

  /** Whether someone has won, so the game is over */
  const isOver = computed(() => winnerId.value !== null)

  /**
   * The distances the game is played at, from the region's size: the board's
   * size, the turns a Freight takes to cross it, and its speed unit — how far
   * a train runs, and what track is priced and deliveries paid, per point of
   * speed (see boardScale.js). Worked out from the region, never saved, so a
   * change to the scale settings reaches saved games too.
   */
  const boardScale = computed(() => boardScaleFor(region.value))

  // ACTIONS

  /**
   * Sets the playing region for the game.
   * @param {Object} newRegion - GeoJSON FeatureCollection defining the play area
   */
  function setRegion(newRegion) {
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
   * Fixes the settings this game is played by, as it starts.
   * @param {Object} settings - The player's settings (only the game settings
   *   are taken; see `gameSettingsFrom`)
   */
  function setGameSettings(settings) {
    gameSettings.value = gameSettingsFrom(settings)
  }

  /**
   * Hides a help banner for the rest of this game.
   * @param {string} name - The banner's name
   */
  function dismissHelp(name) {
    if (!dismissedHelp.value.includes(name)) dismissedHelp.value.push(name)
  }

  /**
   * Resets the game state to initial values.
   */
  function reset() {
    region.value = null
    turn.value = 0
    winnerId.value = null
    gameSettings.value = gameSettingsFrom({})
    dismissedHelp.value = []
  }

  /**
   * Sets the complete game state (used for loading saved games).
   * @param {Object} state - Game state object with region and turn, the
   *   winner's id once the game is over (saves from before games could be
   *   won have none), the settings the game is played by, and the help
   *   banners dismissed. A save from before game settings existed goes on
   *   by the rules it was played by (RULES_BEFORE_GAME_SETTINGS); one from
   *   before banners could be dismissed shows them all.
   */
  function setGameState(state) {
    if (state.region) region.value = state.region
    if (state.turn !== undefined) turn.value = state.turn
    winnerId.value = Number.isInteger(state.winnerId) ? state.winnerId : null
    gameSettings.value = gameSettingsFrom(state.settings ?? RULES_BEFORE_GAME_SETTINGS)
    dismissedHelp.value = Array.isArray(state.dismissedHelp)
      ? state.dismissedHelp.filter((name) => typeof name === 'string')
      : []
  }

  return {
    // STATE
    region,
    turn,
    winnerId,
    gameSettings,
    dismissedHelp,
    // GETTERS
    isBuildingRound,
    isOver,
    boardScale,
    // ACTIONS
    setRegion,
    advanceTurn,
    declareWinner,
    setGameSettings,
    dismissHelp,
    reset,
    setGameState
  }
})
