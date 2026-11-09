/**
 * Town Entry (townEntry.js)
 *
 * What building track into towns costs, on top of the track itself.
 *
 * In Empire Builder a city's milepost costs more to build into than open
 * ground: 3 for small and medium cities, 5 for major ones. Here a player
 * pays `gameRules.townEntry` for a town's size the first time their track
 * reaches it.
 *
 * A line reaches a town where one of its points sits on the town, which is
 * what joins it to the network so trains can stop there (see network.js).
 * Passing through a town's grid cell without a point on the town joins
 * nothing, so it pays only for the cell, like any other.
 *
 * A line that starts in a town joins that town too, and pays for it the
 * same way, unless the player's track reaches it already or it is a major
 * city. A network may start in any town (see startRule.js); without the fee,
 * starting a line in a town and running it back to the player's own track
 * would join the town for nothing. Starting out of a major city stays free,
 * as in Empire Builder, where every network begins in one.
 *
 * Pure functions over plain data, so the rule can be tested without stores.
 *
 * @module composables/townEntry
 */

import { gameRules } from '@/config/game'
import { pointKey, townKey } from '@/composables/network'

/**
 * Every town by the network key of the point it sits on, so a line's points
 * can be checked for towns quickly. Worked out once per set of towns rather
 * than on every price (see trackBuilder.js).
 * @param {Array<Object>} towns - Every town, each with lat and lon
 * @returns {Map<string, Object>} Towns by point key
 */
export function townsByKey(towns) {
  return new Map(towns.map((town) => [townKey(town), town]))
}

/**
 * What entering one town costs, by its size.
 * @param {Object} town - The town, with its size
 * @returns {number} Dollars; nothing for a size with no fee
 */
export function townEntryFee(town) {
  return gameRules.townEntry[town.size] ?? 0
}

/**
 * The towns a line enters, by key: those it has a point on, its start
 * included unless that is a major city, other than any in `reached`, each
 * once.
 * @param {Array<{lat: number, lng: number}>} latlngs - The line's points
 * @param {Map<string, Object>} byKey - Towns by point key (see `townsByKey`)
 * @param {Set<string>} reached - Point keys already reached
 * @returns {Array<string>} The keys of the towns entered, in order
 */
function townsEntered(latlngs, byKey, reached) {
  const counted = new Set()
  const entered = []
  latlngs.forEach((point, i) => {
    const key = pointKey(point)
    if (!byKey.has(key) || reached.has(key) || counted.has(key)) return
    // Counted even when free, so a line that loops back to a major city it
    // started from does not pay for it on the way back
    counted.add(key)
    const isFreeStart = i === 0 && byKey.get(key).size === 'large'
    if (!isFreeStart) entered.push(key)
  })
  return entered
}

/**
 * What a line costs in town entry: the fee for every town it reaches, the
 * one it starts in included unless that is a major city, other than those
 * the player's track reaches already, each counted once however often the
 * line comes back to it.
 *
 * @param {Array<{lat: number, lng: number}>} latlngs - The line's points
 * @param {Map<string, Object>} byKey - Towns by point key (see `townsByKey`)
 * @param {Set<string>} reached - The points the player's track is drawn
 *   through, as network keys (see `pointKey` in network.js)
 * @returns {number} The fees, in dollars
 */
export function entryFees(latlngs, byKey, reached) {
  return townsEntered(latlngs, byKey, reached).reduce(
    (total, key) => total + townEntryFee(byKey.get(key)),
    0
  )
}

/**
 * The part of a section's price not to give back when it is torn up: the
 * entry fees it paid for towns the player's other track still reaches.
 *
 * Without this, a town could be joined for free: build into it (paying the
 * fee), build a second section to it (no fee — it is reached), then tear up
 * the first for a full refund, and the second still reaches the town.
 *
 * Which section paid for a town is not stored; it is worked out again from
 * the player's sections in the order they were built, each having paid for
 * the towns it entered that none before it had reached.
 *
 * @param {Object} removed - The section being torn up, one of `segments`
 * @param {Array<Object>} segments - All the player's sections, in the order
 *   they were built, each with its `id` and `coordinates`
 * @param {Map<string, Object>} byKey - Towns by point key (see `townsByKey`)
 * @returns {number} Dollars to keep back from the refund
 */
export function entryFeesKept(removed, segments, byKey) {
  // Replay the building to find the towns the removed section paid for
  const reached = new Set()
  let paidFor = []
  for (const segment of segments) {
    const entered = townsEntered(segment.coordinates, byKey, reached)
    if (segment.id === removed.id) paidFor = entered
    segment.coordinates.forEach((point) => reached.add(pointKey(point)))
  }

  // The towns the rest of the player's track will still reach
  const stillReached = new Set(
    segments
      .filter((segment) => segment.id !== removed.id)
      .flatMap(({ coordinates }) => coordinates.map(pointKey))
  )
  return paidFor
    .filter((key) => stillReached.has(key))
    .reduce((total, key) => total + townEntryFee(byKey.get(key)), 0)
}
