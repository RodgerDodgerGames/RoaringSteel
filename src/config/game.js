/**
 * Game Rules (game.js)
 *
 * The money side of the Empire Builder rules, in one place so the numbers the
 * game is balanced around are not scattered through components.
 *
 * Empire Builder counts money in millions. Here one million is $1,000, so the
 * board game's figures carry straight over: its $20 million building
 * allowance is $20,000 here, its $250 million to win is $250,000.
 *
 * @module config/game
 */

export const gameRules = {
  /** What each player is handed when the game starts: $40 million in Empire Builder. */
  startingCash: 40000,

  /**
   * The most a player may spend on track in one turn.
   *
   * Separate from cash on hand, and the two are checked independently: a rich
   * player is still held to the per-turn allowance, and a poor one cannot
   * spend money they do not have just because the allowance is untouched.
   *
   * Upgrading a train is paid for out of the same allowance (see trains.js),
   * so a turn's money goes on track or on the train, as in Empire Builder.
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
  },

  /**
   * How track may meet track already built. As in Empire Builder, where lines
   * may cross at a milepost but never share the way between two, new track
   * may cross built track but not run alongside it.
   *
   * New track is "beside" built track wherever it is within `nearKm` of it —
   * half a grid cell, the width of the band a line runs down the middle
   * of. It may be beside built track for at most `maxBesideKm` at a stretch. Crossing
   * square on takes about 10 km of that (5 km each side); the stretch grows
   * as the angle flattens, so 20 km lets a line cross at anything steeper
   * than about 30°, and stops it running along, or weaving along, a line.
   */
  trackSpacing: {
    nearKm: 5,
    maxBesideKm: 20
  },

  /**
   * What a player pays another for running on their track: Empire Builder's
   * $4 million, paid to each owner whose track the train used, once per turn
   * however much of that owner's track it ran on.
   */
  trackUseFee: 4000,

  /**
   * How a game is won (see victory.js). The first player to have both this
   * much cash and a network joining enough of the region's major cities wins
   * at once.
   *
   * Empire Builder asks for $250 million and six of its seven major cities.
   * A region here has however many major cities its census data gives it, so
   * the six-of-seven is kept as a share: `majorCityShare` of them, rounded up
   * (all of them up to six, six of seven, seven of eight, nine of ten).
   */
  victory: {
    cash: 250000,
    majorCityShare: 6 / 7
  },

  /**
   * What a demand pays (see payoffs.js). As in Empire Builder, a delivery
   * pays more the further the commodity has to travel: here, so much per
   * kilometer as the crow flies from the nearest town that produces it to
   * the destination, rounded to the nearest thousand.
   *
   * $100 per km is about the board game's rate — roughly a million per
   * milepost — and pays a little more than building track the same distance
   * costs (an ordinary 10 km cell is about $630), so a first delivery on a
   * new line roughly pays for the line, and every later one on it is profit.
   * `minimum` keeps a delivery between neighbors worth making.
   */
  payoffs: {
    perKm: 100,
    roundTo: 1000,
    minimum: 3000
  }
}
