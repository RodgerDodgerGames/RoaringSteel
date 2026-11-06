/**
 * Settings for the board's towns (see stores/towns.js).
 */

/**
 * How a board's towns are split into sizes: major cities ("large"), medium
 * towns and small towns, by population (see townSizes.js).
 *
 * The towns are ranked by population, and the biggest are made major cities
 * and the next ones medium towns, each a share of all the towns on the
 * board. So every board gets a few of each, in proportion to how many towns
 * it has, however lopsided its populations: Wisconsin, with Milwaukee more
 * than twice the size of the next city, gets Milwaukee and Madison as major
 * cities and Green Bay and Appleton as medium towns.
 *
 * Shares are rounded to whole towns. A board with any towns has at least one
 * major city, since a game is won by joining them; one with three or more has
 * at least one medium town too.
 */
export const townSizeConfig = {
  /** The share of a board's towns that are major cities */
  largeShare: 0.08,
  /** The share of a board's towns that are medium towns */
  mediumShare: 0.08
}
