/**
 * Turn Composable (useTurn.js)
 *
 * Coordinates ending a turn across the player, train and game stores.
 *
 * Ending a turn also clears the finishing player's track building allowance
 * and what their train did this turn, and checks whether they have won (see
 * victory.js) — a win made by building the last link to a city shows up
 * here. Once someone has won, no more turns are played.
 *
 * A player may instead give up their turn to throw in their hand of demand
 * cards for a new one (`discardHand`), as long as they have not yet done
 * anything else with the turn.
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
import { useTrainsStore } from '@/stores/trains'
import { useDemandCardsStore } from '@/stores/demandCards'
import { useVictory } from '@/composables/victory'
import { useGamePersistence } from '@/composables/useGamePersistence'
import { turnAfter } from '@/composables/turnOrder'

export function useTurn() {
  const gameStore = useGameStore()
  const playerStore = usePlayerStore()
  const trainsStore = useTrainsStore()
  const demandCardsStore = useDemandCardsStore()
  const { autoSave } = useGamePersistence()
  const { checkForWinner } = useVictory()

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
   * Advances the game turn when the round ends, and auto-saves then, once a
   * round rather than after every turn, and when the game is won.
   * @returns {boolean} True if the turn was ended successfully.
   */
  function endTurn() {
    if (!playerStore.hasPlayers) {
      console.warn('Cannot end turn: no players in game')
      return false
    }
    if (gameStore.isOver) {
      console.warn('Cannot end turn: the game is over')
      return false
    }

    // Read before anything changes: once the turn moves, these describe the
    // next player's turn instead
    const { endsRound } = upNext.value
    const finishingId = playerStore.activePlayer?.id

    // A win ends the game where it stands: the turn is not passed on
    if (finishingId !== undefined && checkForWinner(finishingId)) {
      autoSave()
      return true
    }

    if (!playerStore.setActivePlayer(nextPlayer.value.id)) return false

    // The build allowance is per turn, so it is cleared as the turn ends
    // rather than when it next comes round — a player who never builds still
    // gets a full budget back, and the counter in the save is always the
    // allowance the player whose turn it is has used. A player who plays
    // twice in a row at the turn of a round gets a fresh allowance for the
    // second turn: it is a turn of its own.
    if (finishingId !== undefined) playerStore.resetTrackSpend(finishingId)
    // Likewise the train's run: the next turn is a full one
    if (finishingId !== undefined) trainsStore.endTurn(finishingId)

    if (endsRound) {
      gameStore.advanceTurn()
      autoSave()
    }
    return true
  }

  /**
   * Whether the active player may throw in their hand: only as the whole of
   * their turn, so not once they have placed or run their train, loaded or
   * delivered anything, or spent any of the turn's allowance.
   */
  const canDiscardHand = computed(() => {
    const id = playerStore.activePlayer?.id
    if (id === undefined || gameStore.isOver) return false
    return !trainsStore.trainOf(id).hasActed && !playerStore.hasSpentThisTurn(id)
  })

  /**
   * Throws in the active player's hand of demand cards for a new one, and
   * ends their turn: Empire Builder's way out of a hand that is no good,
   * which costs the whole turn.
   * @returns {boolean} True if the hand was thrown in and the turn ended
   */
  function discardHand() {
    if (!canDiscardHand.value) return false
    demandCardsStore.discardHand(playerStore.activePlayer.id)
    return endTurn()
  }

  return { nextPlayer, playsAgain, endTurn, canDiscardHand, discardHand }
}
