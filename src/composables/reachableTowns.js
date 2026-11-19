/**
 * Reachable Towns (reachableTowns.js)
 *
 * Which of a board's towns track can actually join up.
 *
 * Some towns are found on islands too far offshore to bridge: Nantucket on
 * a BosWash board, Key West on a South Atlantic one. No player can ever lay
 * track to them, so a demand there could never be delivered, and as payoffs
 * follow what a haul's track would cost, theirs were the biggest on their
 * boards. Until there are ferries (see ROADMAP.md), such towns are left off
 * the board.
 *
 * A town stays when track could be built from it to the board's biggest
 * city, at any price, under the building rules (see `reachableFrom` in
 * botPathfinder.js): bridges no longer than the limit, and lines staying
 * inside the region (or in a town's cell). Every other town is dropped, so
 * two towns on one island go together, even though track could join them
 * to each other.
 *
 * @module composables/reachableTowns
 */

import { searchBoard, reachableFrom } from '@/composables/bot/botPathfinder'

/**
 * Where a town is, as the route search takes points.
 * @param {Object} town - A town, with lat and lon
 * @returns {{lat: number, lng: number}} The point
 */
const pointOf = (town) => ({ lat: town.lat, lng: town.lon })

/**
 * The towns track could join to the board's biggest city, and the city
 * itself.
 * @param {Object} rules - What lines are judged against, before any track
 *   is built (see `boardRulesFor` in buildRules.js)
 * @param {Array<Object>} towns - Every town, each with lat, lon and
 *   population
 * @returns {Array<Object>} The towns kept, in the order given; the same
 *   array when none are dropped
 */
export function reachableTowns(rules, towns) {
  if (towns.length < 2) return towns
  // The first of the biggest, should two be the same size
  const biggest = towns.reduce((big, town) => (town.population > big.population ? town : big))
  // No towns are given to the search: the detours a computer player makes
  // through towns change what track costs, never whether it can get there
  const reaches = reachableFrom(searchBoard(rules, []), [pointOf(biggest)])
  const kept = towns.filter((town) => town === biggest || reaches(pointOf(town)))
  return kept.length === towns.length ? towns : kept
}
