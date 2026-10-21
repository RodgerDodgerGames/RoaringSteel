/**
 * Game Rules (game.js)
 *
 * The money side of the Empire Builder rules, in one place so the numbers the
 * game is balanced around are not scattered through components.
 *
 * @module config/game
 */

export const gameRules = {
  /** What each player is handed when the game starts. */
  startingCash: 20000,

  /**
   * The most a player may spend on track in one turn.
   *
   * Separate from cash on hand, and the two are checked independently: a rich
   * player is still held to the per-turn allowance, and a poor one cannot
   * spend money they do not have just because the allowance is untouched. It
   * starts equal to `startingCash` only by coincidence — the first turn is the
   * one turn a player could otherwise spend everything at once.
   */
  trackBudgetPerTurn: 20000
}
