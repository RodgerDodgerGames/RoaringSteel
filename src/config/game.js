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
  trackBudgetPerTurn: 20000,

  /**
   * How many rounds open the game with building only — Empire Builder's
   * "switchback start". Trains do not run in these rounds: each player just
   * lays track (or upgrades their train) with that turn's allowance. The
   * rounds alternate direction, first player to last and then back again,
   * so the order is fair on the way out and the way back (see turnOrder.js).
   */
  buildingRounds: 2,

  /**
   * Bridges: what it costs to carry track over water, and how far it may go.
   *
   * A grid cell is water when its land cover is open water (see water.js).
   * Track crossing water pays for a bridge instead of the cell's own cost,
   * and each water cell in a row costs more than the one before — the first
   * `costPerCell`, the second twice that, and so on — because a long bridge
   * is a far bigger job than a short one. A crossing of more than
   * `maxCells` water cells in a row cannot be built at all.
   *
   * For scale: an ordinary land cell costs about $630 (the middle of a real
   * Maryland grid), and a turn's building allowance is $20,000.
   */
  bridges: {
    costPerCell: 5000,
    maxCells: 2
  }
}
