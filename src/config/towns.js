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
  largeShare: 0.11,
  /** The share of a board's towns that are medium towns */
  mediumShare: 0.22
}

/**
 * How many players may build into a small or medium town, by how many
 * players the game has, bots included (see townLimits.js). Major cities have
 * no limit. Used only with the game setting "Limit how many players may build
 * into a town" on.
 *
 * Each row holds from its `players` up to the next row's: the row for 6 is
 * also the row for 7, and the last row is for 8 players or more. A game with
 * fewer players than the first row (a solo game) uses the first row. A medium
 * town always takes one player more than a small town.
 */
export const townBuilderLimits = Object.freeze([
  Object.freeze({ players: 2, small: 1, medium: 2 }),
  Object.freeze({ players: 3, small: 2, medium: 3 }),
  Object.freeze({ players: 4, small: 2, medium: 3 }),
  Object.freeze({ players: 5, small: 3, medium: 4 }),
  Object.freeze({ players: 6, small: 3, medium: 4 }),
  Object.freeze({ players: 8, small: 4, medium: 5 })
])

/**
 * How far apart a board's towns must be (see townSpacing.js), in speed units
 * (see boardScale.js), so the rule is the same on every board: 4 speed units
 * is about 22 km on a board Minnesota's size and 35 km on the Rockies.
 *
 * Census areas are drawn by where people commute, not by how a board looks,
 * so in thickly settled country they crowd together. Measured on saved
 * boards (2026-11-19), BosWash and the South Atlantic states had about
 * three times the towns per area of Minnesota or the Rockies, some as close
 * as 1.6 speed units. With both distances at 4, no two towns on a board are
 * closer than 4 speed units (#167).
 */
export const townSpacingConfig = {
  /**
   * Major and medium cities closer together than this are made one town,
   * as Raleigh and Durham become Raleigh-Durham
   */
  mergeUnits: 4,
  /**
   * A small town closer than this to a town kept ahead of it is left off
   * the board
   */
  gapUnits: 4
}

/**
 * How a board's industries are given to its towns (see townIndustries.js).
 *
 * A town's industries are scored by their "extra jobs": its jobs in an
 * industry minus what an average town with the same total jobs would have.
 * Pairs of town and industry are given out from the most extra jobs down,
 * within the limits below; then the town shapes are held to the limits on
 * three-industry, two-industry and empty towns. The shares were set so a
 * board looks something like Empire Builder's own, where most cities make
 * one or two things, a few make three, and some make none.
 */
export const townIndustryConfig = {
  /**
   * The smallest an industry's extra jobs can be, as a share of the town's
   * jobs, for the town to make it: below it, the industry is too small a
   * part of the town to build a railroad for
   */
  minExtraShare: 0.005,
  /** The most things a town makes, its Tourism included */
  maxPerTown: 3,
  /**
   * The largest share of the board's towns an industry can go to (always at
   * least one town), rounded down
   */
  maxTownShare: 0.12,
  /** The largest share of the board's towns that make three things, rounded down */
  maxThreeShare: 0.08,
  /** The largest share of the board's towns that make two things, rounded down */
  maxTwoShare: 0.4,
  /** The smallest share of the board's towns that make nothing, rounded up */
  minNoneShare: 0.14,
  /**
   * How many times their counted jobs the farm and fishing industries are
   * taken to have. The jobs data counts only jobs on a payroll, and most
   * farmers and fishermen work for themselves, so these industries look
   * far smaller in it than they are. The government's full count of farm
   * work, owners included, is about three times the payroll count; many of
   * those owners farm part time, so the multiplier is set a little lower.
   */
  undercountMultiplier: 2.5,
  /**
   * The industries the multiplier applies to, by NAICS code: crops (1111-
   * 1119), animals (1121-1129) and fish (114). Not the farm, ranch and
   * timber crews (1151-1153), who are mostly hired and on a payroll, nor
   * logging (113).
   */
  undercountIndustries: [1111, 1112, 1113, 1114, 1119, 1121, 1122, 1123, 1124, 1125, 1129, 114]
}
