/**
 * Start Rule (startRule.js)
 *
 * Where a player's track may start. A section of track always may start on
 * the player's own track (at an end or bend of it, see trackBuilder.js).
 * Away from it — the very first section, or a new piece of network on its
 * own — it starts in a town:
 * - with the game setting "Require track network to start in Major City"
 *   on, only in a major city, as in Empire Builder;
 * - with it off (the default), in any town.
 *
 * The setting is fixed for the game when it starts (the game store's
 * `gameSettings`), and computer players are held to it the same way.
 *
 * Pure functions over plain data, so the rule can be tested without stores.
 *
 * @module composables/startRule
 */

/**
 * The towns a player's track may start in, away from their own track.
 * @param {Array<Object>} towns - Every town on the board
 * @param {boolean} requireMajorCity - Whether track must start in a major city
 * @returns {Array<Object>} The towns
 */
export function startTowns(towns, requireMajorCity) {
  return requireMajorCity ? towns.filter((town) => town.size === 'large') : towns
}

/**
 * Where track may start away from a player's own track, in words.
 * @param {boolean} requireMajorCity - Whether track must start in a major city
 * @returns {string} "a major city" or "a town"
 */
export function startPlace(requireMajorCity) {
  return requireMajorCity ? 'a major city' : 'a town'
}

/**
 * What to tell a player whose line starts somewhere track may not start.
 * @param {boolean} requireMajorCity - Whether track must start in a major city
 * @returns {string} The rule, as a sentence
 */
export function startRuleMessage(requireMajorCity) {
  return `Track must start in ${startPlace(requireMajorCity)}, or at an end or bend of your own track.`
}

/**
 * The towns a computer player with no track yet weighs up as the start of
 * its network.
 *
 * Weighing up a town means searching the whole grid from it, about half a
 * second on a big board, so a computer player does not try every town when
 * any town will do. It tries the major cities, which it has to join to win
 * anyway, and the towns its own demand cards want deliveries in, where a
 * network starting there earns its first payoff soonest.
 *
 * @param {Array<Object>} towns - Every town on the board
 * @param {boolean} requireMajorCity - Whether track must start in a major city
 * @param {Array<string>} destinations - The names of the towns its demand
 *   cards want deliveries in
 * @returns {Array<Object>} The towns to weigh up, each once
 */
export function botStartTowns(towns, requireMajorCity, destinations) {
  const wanted = new Set(destinations)
  return startTowns(towns, requireMajorCity).filter(
    (town) => town.size === 'large' || wanted.has(town.name)
  )
}
