/**
 * Bot Runner (useBotRunner.js)
 *
 * Plays the computer players' turns as they come round, at a pace the
 * people at the table can follow. When a computer player's turn comes:
 * 1. a moment's wait (`THINK_DELAY_MS`), so the screen can show whose turn
 *    it is before the work of the turn holds the browser up;
 * 2. the whole turn is played at once (see useBot.js). What it did goes
 *    into the turn history like anyone's turn (see the history store), and,
 *    in debug mode, is printed to the console with the reasoning behind it
 *    (see botTurnLog.js);
 * 3. a pause (`BOT_PAUSE_MS`), so the map can be taken in;
 * 4. the turn is ended, and the next player is up — another computer
 *    player's turn starts over at step 1.
 *
 * Used by the game screen, for as long as it is up. Every wait checks,
 * when it is over, that the game is still the one it was waiting on: a game
 * loaded or started meanwhile has different players, and the wait is dropped
 * rather than playing or ending a turn in it.
 *
 * A computer player's turn that goes wrong in a way nobody foresaw (the code
 * throws) is not allowed to stop the game: it is logged, marked as a
 * problem in the turn history, and the turn is ended as it stands.
 *
 * @module composables/bot/useBotRunner
 */

import { watch, onScopeDispose } from 'vue'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/players'
import { useHistoryStore } from '@/stores/history'
import { useTurn } from '@/composables/useTurn'
import { useBot } from './useBot'
import { logBotTurn } from './botTurnLog'

/** How long a computer player's finished turn stays up before play moves on, in ms */
export const BOT_PAUSE_MS = 1000

/** How long before a computer player starts its turn, in ms */
export const THINK_DELAY_MS = 50

export function useBotRunner() {
  const gameStore = useGameStore()
  const playerStore = usePlayerStore()
  const historyStore = useHistoryStore()
  const { endTurn } = useTurn()
  const { playTurn } = useBot()

  /** The one wait in progress, if any */
  let timer = null

  function cancel() {
    clearTimeout(timer)
    timer = null
  }

  /**
   * Whether a player still holds the turn in a game that is still on. The
   * player object is compared, not the id: a loaded game has new player
   * objects, even where the ids are the same.
   */
  const stillTheirTurn = (player) => playerStore.activePlayer === player && !gameStore.isOver

  /**
   * Starts the active player's turn going, if they are a computer player.
   * Safe to call at any time; it replaces any wait already in progress.
   */
  function schedule() {
    cancel()
    const player = playerStore.activePlayer
    if (!player?.isBot || gameStore.isOver) return
    timer = setTimeout(() => takeTurn(player), THINK_DELAY_MS)
  }

  /**
   * Plays a computer player's turn, and ends it after the pause.
   * @param {Object} player - The computer player
   */
  function takeTurn(player) {
    timer = null
    if (!stillTheirTurn(player)) return schedule()

    const round = gameStore.turn
    const isBuildingRound = gameStore.isBuildingRound
    let report
    try {
      report = playTurn(player.id)
    } catch (error) {
      console.error(`Computer player ${player.name} could not finish their turn:`, error)
      report = { events: [], errors: [{ action: 'turn', error: String(error) }], endedTurn: false }
    }
    // In debug mode, the turn and the reasoning behind it, in the console
    logBotTurn({ name: player.name, round, isBuildingRound, report })
    // The turn's own record is kept as it plays (see the history store);
    // all the runner adds is whether anything went wrong
    if (report.errors.length) historyStore.flagProblem(player.id, round)

    // Throwing in the hand ends the turn by itself
    if (report.endedTurn) return schedule()

    timer = setTimeout(() => {
      timer = null
      if (stillTheirTurn(player)) endTurn()
      schedule()
    }, BOT_PAUSE_MS)
  }

  // A new player's turn, or a game loaded with different players. The same
  // player playing twice running (the turn of a building round) does not
  // change who is active, so ending a turn schedules the next one itself too.
  watch(() => playerStore.activePlayer, schedule, { immediate: true })
  onScopeDispose(cancel)
}
