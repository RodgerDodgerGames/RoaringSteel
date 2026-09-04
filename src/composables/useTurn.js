/**
 * Turn Composable (useTurn.js)
 *
 * Coordinates ending a turn across the player and game stores.
 *
 * Turn order is player add-order. Ending a turn passes play to the next
 * player; the game turn counter only advances once play wraps back around
 * to the first player, so one "turn" is a full round of the table.
 *
 * @module composables/useTurn
 */

import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/players'
import { useGamePersistence } from '@/composables/useGamePersistence'

export function useTurn() {
  const gameStore = useGameStore()
  const playerStore = usePlayerStore()
  const { autoSave } = useGamePersistence()

  /**
   * Ends the active player's turn and passes play to the next player.
   * Advances the game turn when play wraps back to the first player,
   * then auto-saves.
   * @returns {boolean} True if the turn was ended successfully.
   */
  function endTurn() {
    if (!playerStore.hasPlayers) {
      console.warn('Cannot end turn: no players in game')
      return false
    }

    // Capture who is finishing before the store moves the turn on.
    const finishingIndex = playerStore.players.findIndex((p) => p.isTurn)
    const lastIndex = playerStore.players.length - 1

    if (!playerStore.nextTurn()) return false

    // A full round is complete when the last player in order just finished.
    if (finishingIndex === lastIndex) {
      gameStore.advanceTurn()
    }

    autoSave()
    return true
  }

  return { endTurn }
}
