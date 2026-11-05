/**
 * Board Scale (board.js)
 *
 * How far trains run on a board of a given size. The numbers here are the
 * ones to tune after playtesting; the arithmetic that uses them is in
 * composables/boardScale.js.
 *
 * A board's size is the square root of its area, in km: the side of a square
 * of the same area. Colorado's 269,600 km² make a board 519 km across; a long,
 * thin state of the same area counts the same.
 *
 * @module config/board
 */

export const boardConfig = {
  /**
   * How many turns a speed-9 train takes to cross a board of a given size,
   * as anchor points. Smaller boards are quicker to cross than big ones, but
   * not in proportion: a board twice the size takes fewer than twice the
   * turns, so a small region makes a shorter game and a big one a longer one
   * without either going to extremes.
   *
   * Sizes between two anchors follow a smooth curve through them (straight
   * on a log–log plot); sizes beyond the first or last anchor carry on the
   * curve of the nearest two. Add, move or remove anchors freely: at least
   * two are needed, in any order.
   */
  turnsToCross: [
    // A small board: about Massachusetts, or a slice of New England
    { sizeKm: 250, turns: 6 },
    // Colorado
    { sizeKm: 519, turns: 10 },
    // A square board as long on each side as California
    { sizeKm: 1240, turns: 15 }
  ],

  /**
   * The train speed the anchors above are counted at: Empire Builder's
   * Freight, which moves 9 mileposts a turn. A board's speed unit is the
   * distance a train of this speed covers in a turn, divided by it.
   */
  referenceSpeed: 9,

  /**
   * The board size used when a game has no region to measure (a damaged
   * save), so its trains still run and its track can still be priced.
   */
  fallbackSizeKm: 519
}
