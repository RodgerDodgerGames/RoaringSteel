/**
 * Bot Kinds (botKinds.js)
 *
 * The kinds of computer player a game can have. Each plays the same turn
 * (see composables/bot/useBot.js) and differs only in how it lays out track:
 * - Standard: searches the grid for the cheapest line to a town, winding
 *   round dear ground (see botPathfinder.js).
 * - Fast: builds straight to the town, paying whatever the ground costs, and
 *   searches only where a straight line breaks a build rule (see
 *   botStraightLine.js). Quicker to work out, and shorter for its train.
 *
 * Each kind has the label its toggle shows on the setup screen, and the name
 * its players are given, followed by a number ("Bot 1", "Fast Bot 2").
 *
 * @module config/botKinds
 */

export const BOT_KINDS = Object.freeze({
  standard: Object.freeze({ label: 'Standard', name: 'Bot' }),
  fast: Object.freeze({ label: 'Fast', name: 'Fast Bot' })
})

/** The kind a computer player is unless told otherwise */
export const DEFAULT_BOT_KIND = 'standard'

/**
 * A kind of computer player, or the default for anything that is not one —
 * a save from before there were kinds, or a damaged one.
 * @param {*} kind - What was given
 * @returns {string} A key of BOT_KINDS
 */
export function botKindOr(kind) {
  return Object.hasOwn(BOT_KINDS, kind) ? kind : DEFAULT_BOT_KIND
}
