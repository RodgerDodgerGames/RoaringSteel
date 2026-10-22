/**
 * Turn Composable (useTurn.js)
 *
 * Coordinates ending a turn across the player and game stores.
 *
 * Ending a turn also clears the finishing player's track building allowance.
 *
 * Who plays next follows the switchback start (see turnOrder.js): the two
 * opening building rounds run first-to-last and then back, and every round
 * after runs first-to-last. The game turn counter advances when a round
 * ends, so one "turn" is a full round of the table.
 *
 * @module composables/useTurn
 */

import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/players'
import { useGamePersistence } from '@/composables/useGamePersistence'
import { turnAfter } from '@/composables/turnOrder'

export function useTurn() {
  const gameStore = useGameStore()
  const playerStore = usePlayerStore()
  const { autoSave } = useGamePersistence()

  /**
   * What ending the active player's turn would do: who plays next, and
   * whether the round ends. Null with no players.
   *
   * Both `nextPlayer` and `endTurn` read this one value, so anything that
   * names who is up next (the End Turn button) cannot disagree with what
   * happens.
   */
  const upNext = computed(() => {
    // -1 when nobody holds the turn, which turnAfter understands
    const activePlace = playerStore.players.indexOf(playerStore.activePlayer)
    return turnAfter(activePlace, playerStore.players.length, gameStore.turn)
  })

  /** The player who gets the turn when the active player ends theirs */
  const nextPlayer = computed(() =>
    upNext.value ? playerStore.players[upNext.value.nextPlace] : undefined
  )

  /**
   * Whether the active player plays the next turn too. Happens at the turn
   * of each building round (and on every turn of a solo game), and is
   * pointed out so "Next up" naming the active player does not read as a
   * mistake.
   */
  const playsAgain = computed(
    () => !!nextPlayer.value && nextPlayer.value === playerStore.activePlayer
  )

  /**
   * Ends the active player's turn and passes play to the next player.
   * Advances the game turn when the round ends, then auto-saves.
   * @returns {boolean} True if the turn was ended successfully.
   */
  function endTurn() {
    if (!playerStore.hasPlayers) {
      console.warn('Cannot end turn: no players in game')
      return false
    }

    // Read before anything changes: once the turn moves, these describe the
    // next player's turn instead
    const { endsRound } = upNext.value
    const finishingId = playerStore.activePlayer?.id

    if (!playerStore.setActivePlayer(nextPlayer.value.id)) return false

    // The build allowance is per turn, so it is cleared as the turn ends
    // rather than when it next comes round — a player who never builds still
    // gets a full budget back, and the counter in the save is always the
    // allowance the player whose turn it is has used. A player who plays
    // twice in a row at the turn of a round gets a fresh allowance for the
    // second turn: it is a turn of its own.
    if (finishingId !== undefined) playerStore.resetTrackSpend(finishingId)

    if (endsRound) gameStore.advanceTurn()

    autoSave()
    return true
  }

  return { nextPlayer, playsAgain, endTurn }
}
