/**
 * History Store (history.js)
 *
 * The game's turn history: what every player, person or computer, did on
 * each of their turns, for everyone at the table to read back (see
 * turnHistory.js for the words, and the dock's Turn history section).
 *
 * A turn is built up as it is played, then closed into the history:
 * - the train's part of it — placing, running, loading, delivering,
 *   dropping, and upgrading the train — is recorded as it happens, by the
 *   trains store, the one place those things are done;
 * - throwing in the hand is recorded as it happens, by the turn composable;
 * - the track is read off the board as the turn closes, so a section torn up
 *   again before the turn ended never shows;
 * - the turn closes as it ends (see useTurn.js), or the moment the player
 *   wins (see victory.js), since no turn ends after that.
 *
 * Every turn belongs to a player and a round, named by whoever records or
 * closes it, so nothing is filed under the wrong player even if the turn
 * has passed on. A player never has two turns in one round (see
 * turnOrder.js), so a turn already closed is never closed again.
 *
 * Saved with the game, the turn in progress included, so a game loaded part
 * way through a turn still records the whole of it.
 *
 * @module stores/history
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useGameStore } from '@/stores/game'
import { useTrackStore } from '@/stores/track'
import { useTownsStore } from '@/stores/towns'
import { townsByKey } from '@/composables/townEntry'
import { sectionsBuilt } from '@/composables/turnHistory'

/**
 * Whether a value from a save is an event the history can put into words
 * (see turnHistory.js): an object with a kind, and, for the kinds whose
 * words are worked out from lists and figures, those. Anything else is
 * dropped on loading rather than shown broken.
 * @param {*} event - The value
 * @returns {boolean} True if it is a usable event
 */
function isEvent(event) {
  if (!event || typeof event !== 'object' || typeof event.type !== 'string') return false
  if (event.type === 'build') return Number.isFinite(event.cost) && Array.isArray(event.reached)
  if (event.type === 'move') return event.paid === undefined || Array.isArray(event.paid)
  return true
}

/**
 * Whether a value from a save is a turn the history can use: a round and a
 * player, both whole numbers, and a list of events. Anything else is dropped
 * on loading rather than shown broken.
 * @param {*} turn - The value
 * @returns {boolean} True if it is a usable turn
 */
function isTurn(turn) {
  return (
    !!turn &&
    typeof turn === 'object' &&
    Number.isInteger(turn.round) &&
    Number.isInteger(turn.playerId) &&
    Array.isArray(turn.events)
  )
}

/**
 * A turn from a save, ready to use: null if it is not a turn, otherwise the
 * turn with any events that are not events dropped.
 * @param {*} turn - The value
 * @returns {Object|null} The turn
 */
function savedTurn(turn) {
  return isTurn(turn) ? { ...turn, events: turn.events.filter(isEvent) } : null
}

/** Whether a turn is a given player's, in a given round */
const isTurnOf = (turn, playerId, round) => turn?.playerId === playerId && turn.round === round

export const useHistoryStore = defineStore('history', () => {
  const gameStore = useGameStore()
  const trackStore = useTrackStore()
  const townsStore = useTownsStore()

  // STATE

  /**
   * Every finished turn, the oldest first:
   * { round, playerId, events, won, hadProblem } (see turnHistory.js).
   * `hadProblem` is true when the rules refused something a computer player
   * tried, which should never happen and is worth a look.
   */
  const turns = ref([])

  /**
   * The turn being played, as recorded so far, or null before its player
   * has done anything worth recording: { round, playerId, events, hadProblem }.
   */
  const current = ref(null)

  // ACTIONS

  /**
   * A player's turn in this round as it stands so far, started if it has not
   * been yet. One left over from someone else's turn (or another round) is
   * not theirs, and is replaced.
   * @param {number} playerId - The player
   * @returns {Object} The turn
   */
  function turnInProgress(playerId) {
    const round = gameStore.turn
    if (!isTurnOf(current.value, playerId, round)) {
      current.value = { round, playerId, events: [], hadProblem: false }
    }
    return current.value
  }

  /**
   * Records something a player did on their turn (see turnHistory.js for the
   * kinds of event).
   * @param {number} playerId - The player who did it
   * @param {Object} event - What they did
   */
  function record(playerId, event) {
    turnInProgress(playerId).events.push(event)
  }

  /**
   * Marks a player's turn as one where the rules refused something a
   * computer player tried: the turn in progress, or the turn as closed into
   * the history if it has ended already (thrown in, or won).
   * @param {number} playerId - The player
   * @param {number} round - The round the turn was played in
   */
  function flagProblem(playerId, round) {
    const closed = turns.value.at(-1)
    if (isTurnOf(closed, playerId, round)) {
      closed.hadProblem = true
    } else if (round === gameStore.turn) {
      turnInProgress(playerId).hadProblem = true
    }
  }

  /**
   * Closes a player's turn in this round into the history: what they did,
   * then the track they built (read off the board, so only the track that
   * stayed built), and whether the turn won the game. Called as their turn
   * ends, and when they win. A turn already closed is left as it is.
   * @param {number} playerId - The player whose turn it is
   */
  function closeTurn(playerId) {
    const round = gameStore.turn
    if (isTurnOf(turns.value.at(-1), playerId, round)) return

    const turn = turnInProgress(playerId)
    const builds = sectionsBuilt(
      trackStore.segmentsForOwner(playerId),
      round,
      townsByKey(townsStore.towns)
    )
    turns.value.push({
      round,
      playerId,
      events: [...turn.events, ...builds],
      won: gameStore.winnerId === playerId,
      hadProblem: turn.hadProblem
    })
    current.value = null
  }

  /** Forgets the history, for a new or loaded game */
  function reset() {
    turns.value = []
    current.value = null
  }

  /**
   * Restores the history from a saved game. A save from before there was a
   * history has none, and the game goes on with an empty one; turns and
   * events a save holds that are not turns or events are dropped.
   * @param {Object} [saved] - { turns, current }, as `turns` and `current`
   *   above
   */
  function setHistory(saved) {
    turns.value = Array.isArray(saved?.turns) ? saved.turns.map(savedTurn).filter(Boolean) : []
    current.value = savedTurn(saved?.current)
  }

  return { turns, current, record, flagProblem, closeTurn, reset, setHistory }
})
