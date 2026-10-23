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
