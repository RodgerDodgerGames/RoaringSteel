/**
 * Turn Order (turnOrder.js)
 *
 * Who plays after whom, and when a round is over.
 *
 * Empire Builder opens with a "switchback start": rounds of building only
 * (`gameRules.buildingRounds`, two in the rules), alternating direction. The
 * first runs from the first player to the last. The second runs back the
 * other way, so the last player builds twice in a row and the first player
 * closes the opening. Normal rounds then run first to last as usual,
 * starting with the first player — who therefore also takes two turns in a
 * row, the last building turn and the first normal one. That is the rule as
 * printed: "players will take normal turns, starting with the first player".
 *
 * Players are referred to by their place in turn order (0 is the first
 * player), and rounds count from 0, as the game store does.
 *
 * Pure functions over plain numbers, so the rules can be tested without
 * any stores.
 *
 * @module composables/turnOrder
 */

import { gameRules } from '@/config/game'

/**
 * Whether a round is one of the opening, building-only rounds.
 * @param {number} round - The round, counting from 0
 * @returns {boolean} True for a building round
 */
export function isBuildingRound(round) {
  return round < gameRules.buildingRounds
}

/**
 * The places in turn order, in the order they play in a round. Building
 * rounds alternate direction, starting forward; every later round is forward.
 * @param {number} round - The round, counting from 0
 * @param {number} playerCount - How many players are in the game
 * @returns {Array<number>} Places in turn order, first to play first
 */
function playOrder(round, playerCount) {
  const forward = Array.from({ length: playerCount }, (_, place) => place)
  const runsBackward = isBuildingRound(round) && round % 2 === 1
  return runsBackward ? forward.reverse() : forward
}

/**
 * Who plays after the active player, and whether their turn ends the round.
 *
 * With nobody holding the turn (a game not yet started), the round's first
 * player is next, and no round has ended.
 *
 * @param {number} activePlace - The active player's place in turn order, or
 *   -1 when nobody holds the turn
 * @param {number} playerCount - How many players are in the game
 * @param {number} round - The round being played, counting from 0
 * @returns {{nextPlace: number, endsRound: boolean}|null} The next player's
 *   place, and whether the round is over once the active player finishes;
 *   null with no players
 */
export function turnAfter(activePlace, playerCount, round) {
  if (playerCount === 0) return null

  const order = playOrder(round, playerCount)
  const position = order.indexOf(activePlace)

  if (position === -1) return { nextPlace: order[0], endsRound: false }
  if (position < order.length - 1) return { nextPlace: order[position + 1], endsRound: false }

  // The last to play this round: the next round's first player is up
  return { nextPlace: playOrder(round + 1, playerCount)[0], endsRound: true }
}
