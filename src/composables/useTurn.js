/**
 * Turn Composable (useTurn.js)
 *
 * Coordinates ending a turn across the player, train and game stores.
 *
 * Ending a turn also clears the finishing player's track building allowance
 * and what their train did this turn, and checks whether they have won (see
 * victory.js) — a win made by building the last link to a city shows up
 * here. Once someone has won, no more turns are played. The finished turn
 * goes into the turn history (see the history store) as play moves on; a
 * winning turn has gone in already, as the win was declared.
 *
 * A player may instead give up their turn to throw in their hand of demand
 * cards for a new one (`discardHand`), as long as they have not yet done
 * anything else with the turn.
 *
 * A person cannot end a turn they have done nothing with (`canEndTurn`): they
 * move or build first, or throw in their hand. Computer players are not held
 * to it — they end their turns through `endTurn` directly, and one with
 * nothing worth doing must still pass play on rather than stall the game.
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
import { useTrainStopStore } from '@/stores/trainStop'
import { useHistoryStore } from '@/stores/history'
import { useVictory } from '@/composables/victory'
import { useGamePersistence } from '@/composables/useGamePersistence'
import { turnAfter } from '@/composables/turnOrder'

/**
 * @param {Object} [options]
 * @param {Object} [options.buildTrack] - The game view's build-track
 *   instance (see useBuildTrack), for a caller that ends a person's turn:
 *   its line in progress counts as a use of the turn and is built before
 *   the turn ends (see `canEndTurn` and `finishTurn`). Left out by computer
 *   players and anything else that has no map.
 */
export function useTurn({ buildTrack = null } = {}) {
  const gameStore = useGameStore()
  const playerStore = usePlayerStore()
  const trainsStore = useTrainsStore()
  const demandCardsStore = useDemandCardsStore()
  const trainStopStore = useTrainStopStore()
  const historyStore = useHistoryStore()
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

    // Closed before the round moves on: the history files the turn under
    // the round it was played in, and reads that round's track off the board
    if (finishingId !== undefined) historyStore.closeTurn(finishingId)

    // The build allowance is per turn, so it is cleared as the turn ends
    // rather than when it next comes round — a player who never builds still
    // gets a full budget back, and the counter in the save is always the
    // allowance the player whose turn it is has used. A player who plays
    // twice in a row at the turn of a round gets a fresh allowance for the
    // second turn: it is a turn of its own.
    if (finishingId !== undefined) playerStore.resetTrackSpend(finishingId)
    // Likewise the train's run: the next turn is a full one
    if (finishingId !== undefined) trainsStore.endTurn(finishingId)
    // And the stop card and the report of the train's last move with it
    trainStopStore.reset()

    if (endsRound) {
      gameStore.advanceTurn()
      autoSave()
    }
    return true
  }

  /**
   * Whether there is a turn to play at all: someone holds it and the game
   * is not over. Both ways of spending a turn (ending it, throwing in the
   * hand) need this.
   */
  const canPlayTurn = computed(
    () => playerStore.hasPlayers && !!playerStore.activePlayer && !gameStore.isOver
  )

  /**
   * Whether the active player has done anything with their turn yet: placed
   * or run their train, loaded, delivered or dropped anything (the train's
   * `hasActed`), or spent any of the turn's allowance on track or an upgrade.
   * Spending counts even if torn-up track has since refunded it — the turn
   * was used. False with nobody holding the turn.
   *
   * Throwing in the hand needs this to be false; ending the turn needs it
   * true.
   */
  const hasUsedTurn = computed(() => {
    const id = playerStore.activePlayer?.id
    if (id === undefined) return false
    return trainsStore.trainOf(id).hasActed || playerStore.hasSpentThisTurn(id)
  })

  /**
   * Whether the active player may throw in their hand: only as the whole of
   * their turn, so not once they have used it (see `hasUsedTurn`).
   */
  const canDiscardHand = computed(() => canPlayTurn.value && !hasUsedTurn.value)

  /**
   * Whether a person may end the turn (the End turn button): only once they
   * have used it (see `hasUsedTurn`), so a turn is not passed by an idle
   * click. The other way to spend a turn, throwing in the hand, ends it by
   * itself.
   *
   * A line being drawn with something to build counts too (the build
   * track's `hasLineToBuild`): ending the turn builds it first (see
   * `finishTurn`), which is a use of the turn.
   *
   * Not checked by `endTurn`, which computer players call directly.
   */
  const canEndTurn = computed(
    () => canPlayTurn.value && (hasUsedTurn.value || !!buildTrack?.hasLineToBuild.value)
  )

  /**
   * Ends a person's turn, from the End turn button.
   *
   * A line still being drawn is built first, as far as it can be, as Stop
   * building would. It has to be built before the turn ends, while the turn
   * is still the drawing player's; after, it would be thrown away. If it
   * could not be built whole, the turn stays open: the notice saying why
   * would otherwise be cleared as the turn passed, and the player would
   * never learn part of their line is missing. They end the turn again once
   * they have read it.
   *
   * Then the turn ends only if it has been used (see `canEndTurn`), checked
   * after the line is built: a line Geoman drops instead of building leaves
   * the turn as unused as it was.
   *
   * @returns {boolean} True if the turn ended
   */
  function finishTurn() {
    if (buildTrack?.stopDrawing() === false) return false
    if (!canEndTurn.value) return false
    return endTurn()
  }

  /**
   * Throws in the active player's hand of demand cards for a new one, and
   * ends their turn: Empire Builder's way out of a hand that is no good,
   * which costs the whole turn.
   * @returns {boolean} True if the hand was thrown in and the turn ended
   */
  function discardHand() {
    if (!canDiscardHand.value) return false
    const playerId = playerStore.activePlayer.id
    demandCardsStore.discardHand(playerId)
    historyStore.record(playerId, { type: 'discard' })
    return endTurn()
  }

  return {
    nextPlayer,
    playsAgain,
    endTurn,
    canEndTurn,
    finishTurn,
    canDiscardHand,
    discardHand
  }
}
