/**
 * Victory (victory.js)
 *
 * How a game is won. As in Empire Builder, the first player to have both
 * enough cash and a network joining enough of the major cities wins, and
 * the game ends there and then (see `gameRules.victory`).
 *
 * The cities have to be joined by the player's own track, all on one
 * connected piece of it (see `majorCitiesJoined` in network.js).
 *
 * Checked whenever a player's cash goes up mid-turn (a delivery) and as each
 * turn ends, which catches a win made by building the last link.
 *
 * The network is built here from the track and towns rather than taken from
 * the trains store, because that store checks for a winner after each
 * delivery, and the two would otherwise each import the other.
 *
 * @module composables/victory
 */

import { computed } from 'vue'
import { gameRules } from '@/config/game'
import { buildNetwork, majorCitiesJoined } from '@/composables/network'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/players'
import { useTownsStore } from '@/stores/towns'
import { useTrackStore } from '@/stores/track'

/**
 * How many major cities a player must join to win, out of however many the
 * region has: Empire Builder's six of seven, kept as a share and rounded up.
 * @param {number} majorCityCount - How many major cities the region has
 * @returns {number} How many must be joined
 */
export function majorCitiesNeeded(majorCityCount) {
  return Math.ceil(majorCityCount * gameRules.victory.majorCityShare)
}

export function useVictory() {
  const gameStore = useGameStore()
  const playerStore = usePlayerStore()
  const townsStore = useTownsStore()
  const trackStore = useTrackStore()

  /** The track as a network, to see which cities it joins (see network.js) */
  const network = computed(() => buildNetwork(trackStore.segments, townsStore.towns))

  /**
   * How close a player is to winning: their cash against what is needed,
   * and the major cities their track joins against what is needed.
   * @param {number} playerId - The player
   * @returns {{cash: number, cashNeeded: number, citiesJoined: number,
   *   citiesNeeded: number, hasWon: boolean}} Their progress
   */
  function progress(playerId) {
    const cash = playerStore.players.find((p) => p.id === playerId)?.cash ?? 0
    const majorCities = townsStore.towns.filter((town) => town.size === 'large').length
    const citiesNeeded = majorCitiesNeeded(majorCities)
    const citiesJoined = majorCitiesJoined(network.value, playerId)
    const cashNeeded = gameRules.victory.cash
    return {
      cash,
      cashNeeded,
      citiesJoined,
      citiesNeeded,
      hasWon: cash >= cashNeeded && citiesJoined >= citiesNeeded
    }
  }

  /**
   * Ends the game if a player has won.
   * @param {number} playerId - The player to check
   * @returns {boolean} True if they have won (now, or already)
   */
  function checkForWinner(playerId) {
    if (gameStore.winnerId !== null) return gameStore.winnerId === playerId
    if (!progress(playerId).hasWon) return false
    gameStore.declareWinner(playerId)
    return true
  }

  return { progress, checkForWinner }
}
