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

/**
 * Which industries a board plays with, and how they are shared among its
 * towns (see townIndustries.js).
 *
 * A board plays with a share of its town count in industries, between the
 * floor and the ceiling: Massachusetts, with 9 towns, gets the floor of 10;
 * Iowa, with 23, gets 17; New England, with 30, gets 23; and a board of 40
 * towns or more gets the ceiling of 30. Fewer if the board's towns have no
 * room for more, or its jobs are in fewer industries.
 */
export const townIndustryConfig = {
  /** Industries per town on the board, before the floor and ceiling */
  industriesPerTown: 0.75,
  /** The fewest industries a board plays with, if its towns have room */
  minIndustries: 10,
  /** The most industries a board plays with */
  maxIndustries: 30,
  /**
   * The smallest share of the board's jobs an industry can have and still be
   * chosen: below it, it is too small a business to build a railroad for
   */
  minJobShare: 0.001,
  /** The most things a town makes, its Tourism included */
  maxPerTown: 3,
  /**
   * The largest share of the board's towns an industry can go to, however
   * much of the board's jobs it has
   */
  maxTownShare: 0.2
}
