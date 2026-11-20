/**
 * Town Limits (townLimits.js)
 *
 * How many players may build into a town, with the game setting "Limit how
 * many players may build into a town" on. A small or medium town takes only
 * so many players' track, by how many players the game has (see
 * townBuilderLimits in config/towns.js); a major city takes everyone's.
 *
 * A player has built into a town when any of their track has a point on it:
 * a section that ends there, passes through it, or starts from it. That is
 * how track joins a town on the network (see network.js), so it is the same
 * thing as being connected to it. Track that only passes through the town's
 * grid cell, without touching the town itself, does not count.
 *
 * Once a town has as many players in it as it takes, it is full, and closed
 * to everyone else: none of them may build into its grid cell at all, not
 * even through it without joining (see `lineBlock` in buildRules.js), nor
 * start a network there (see trackBuilder.js). The players already in it
 * build there as they like. A player who tears up all their track at a town
 * leaves it, and the place is free for someone else — who is in a town is
 * worked out from the track on the map each time, never kept.
 *
 * Only building is limited. Any player may still run their train into a full
 * town over someone else's track, paying the usual fee.
 *
 * Pure functions over plain data, so the rule can be tested without stores.
 *
 * @module composables/townLimits
 */

import { townBuilderLimits } from '@/config/towns'
import { pointKey, townKey } from '@/composables/network'

/** What each limited size of town is called in a message to the player */
const SIZE_NAMES = Object.freeze({ small: 'small town', medium: 'medium town' })

/**
 * The row of townBuilderLimits a game of this many players uses: the last
 * row starting at or below the count, or the first row for a game smaller
 * than any.
 * @param {number} playerCount - How many players the game has, bots included
 * @returns {{players: number, small: number, medium: number}} The row
 */
function limitRow(playerCount) {
  return townBuilderLimits.findLast((row) => row.players <= playerCount) ?? townBuilderLimits[0]
}

/**
 * How many players may build into a town of this size.
 * @param {string} size - The town's size: "small", "medium" or "large"
 * @param {number} playerCount - How many players the game has, bots included
 * @returns {number} The most players; Infinity for a major city (or any size
 *   the table does not limit)
 */
export function builderLimit(size, playerCount) {
  return limitRow(playerCount)[size] ?? Infinity
}

/**
 * The limits as rows for the Settings dialog's table: each row's player
 * counts in words ("2", "6–7", "8+") and its limits.
 * @returns {Array<{label: string, small: number, medium: number}>} One per row
 *   of townBuilderLimits, in order
 */
export function builderLimitRows() {
  return townBuilderLimits.map((row, i) => {
    const next = townBuilderLimits[i + 1]
    const label = !next
      ? `${row.players}+`
      : next.players - 1 === row.players
        ? `${row.players}`
        : `${row.players}–${next.players - 1}`
    return { label, small: row.small, medium: row.medium }
  })
}

/**
 * Which players have built into each town: those with a point of their
 * track on it.
 * @param {Array<Object>} towns - Every town, each with lat and lon
 * @param {Array<Object>} segments - Every section of track, each with
 *   `ownerId` and `coordinates`
 * @returns {Map<string, Set<number>>} The ids of the players in each town, by
 *   the town's key (see `townKey`); a town no one has built into is left out
 */
export function buildersByTown(towns, segments) {
  const townKeys = new Set(towns.map(townKey))
  const builders = new Map()
  segments.forEach(({ ownerId, coordinates }) => {
    coordinates.forEach((point) => {
      const key = pointKey(point)
      if (!townKeys.has(key)) return
      if (!builders.has(key)) builders.set(key, new Set())
      builders.get(key).add(ownerId)
    })
  })
  return builders
}

/**
 * The towns closed to a player: full, and they are not one of the players in
 * them.
 * @param {Array<Object>} towns - Every town, each with lat, lon and size
 * @param {Map<string, Set<number>>} builders - Who is in each town (see
 *   `buildersByTown`)
 * @param {number} playerId - The player
 * @param {number} playerCount - How many players the game has, bots included
 * @returns {Array<{town: Object, limit: number, playerCount: number}>} Each
 *   closed town, with how many players it takes and the game's player count,
 *   for telling the player why (see `townFullMessage`)
 */
export function closedTowns(towns, builders, playerId, playerCount) {
  return towns.flatMap((town) => {
    const inTown = builders.get(townKey(town))
    const limit = builderLimit(town.size, playerCount)
    if (!inTown || inTown.has(playerId) || inTown.size < limit) return []
    return [{ town, limit, playerCount }]
  })
}

/**
 * What to tell a player who tries to build into a town that is full, e.g.
 * "Fairmont is full: only 2 players may build into a small town in a
 * 4-player game."
 * @param {{town: Object, limit: number, playerCount: number}} closed - The
 *   town, from `closedTowns`
 * @returns {string} The message
 */
export function townFullMessage({ town, limit, playerCount }) {
  const players = limit === 1 ? '1 player' : `${limit} players`
  return (
    `${town.name} is full: only ${players} may build into a ${SIZE_NAMES[town.size]}` +
    ` in a ${playerCount}-player game.`
  )
}
