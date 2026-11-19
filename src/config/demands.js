/**
 * Settings for the demand cards (see stores/demandCards.js).
 */

/**
 * The colors pinned demand lines are drawn in, on the cards and on the map,
 * in the order they are handed out. Bright and well apart from one another,
 * so each pinned line's towns can be told from the others' at a glance. How
 * many there are is also the most lines a player may pin at once.
 */
export const PIN_COLORS = Object.freeze([
  '#FFB300', // amber
  '#E040FB', // magenta
  '#00B8D4', // cyan
  '#64DD17', // lime
  '#FF3D00' // vermilion
])

/**
 * How the demand deck is made up (see demandDeck.js). Every card's three
 * demands go to three different towns, and no pair of town and commodity is
 * on two cards, so the deck is also never bigger than a third of the pairs
 * the board has.
 */
export const demandDeckConfig = {
  /** Cards per town on the board, at most */
  cardsPerTown: 6,
  /**
   * The pools of payoffs a card's three demands are drawn from, one demand
   * from each (see demandDeck.js), so every card offers a cheap, short haul
   * to start on, one in the middle, and one from the dear end.
   *
   * Each pool is a band of every demand the board has, ranked by payoff:
   * `from` and `to` are shares of the demands ranked below, so the bottom
   * pool, from 0 to 0.4, is the 40% that pay least. The bands overlap, so a
   * demand near a boundary may be drawn as either pool's. Ranked on each
   * board's own payoffs, so a mountain board's bottom pool pays more than a
   * flat board's.
   */
  pools: [
    { from: 0, to: 0.4 },
    { from: 0.3, to: 0.7 },
    { from: 0.6, to: 1 }
  ]
}
