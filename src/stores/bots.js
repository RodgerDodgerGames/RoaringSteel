/**
 * Bots Store (bots.js)
 *
 * What the computer players have been doing, for the people at the table to
 * read: each computer player's last turn, in a sentence (see `describeTurn`
 * in bot/useBot.js). Computer players plan afresh every turn from the board
 * itself, so this is all they keep, and it is not saved with the game.
 *
 * @module stores/bots
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useBotsStore = defineStore('bots', () => {
  /**
   * Each computer player's last turn, the latest first, at most one each:
   * { playerId, round, summary, hadProblem }. `hadProblem` is true when the
   * rules refused something the computer player tried, which should never
   * happen and is worth a look.
   */
  const reports = ref([])

  /**
   * Records a computer player's turn, in place of their last one.
   * @param {{playerId: number, round: number, summary: string,
   *   hadProblem: boolean}} report - The turn
   */
  function addReport(report) {
    reports.value = [report, ...reports.value.filter((r) => r.playerId !== report.playerId)]
  }

  /** Forgets every report, for a new or loaded game */
  function reset() {
    reports.value = []
  }

  return { reports, addReport, reset }
})
