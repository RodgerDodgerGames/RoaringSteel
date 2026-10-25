/**
 * Track Builder (trackBuilder.js)
 *
 * Builds a section of track for a player: checks it may be built, prices it,
 * charges the player, and records it. This is the one way track gets built,
 * whoever is building — the map's drawing tool (useBuildTrack) hands its
 * finished line here, and a computer player can hand its lines here too,
 * without a map, and be held to exactly the same rules.
 *
 * A section must:
 * - be built by the player whose turn it is, while the game is on;
 * - start in a major city or on the player's own track — Empire Builder's
 *   rule, so every network grows out of a major city. "On" means at one of
 *   the points the track is drawn through (its ends and bends): that is
 *   where a new section joins the network (see network.js);
 * - keep to the build rules (inside the region, bridges, spacing — see
 *   buildRules.js);
 * - cost no more than the player has left to spend this turn, in cash and
 *   in allowance (see the player store).
 *
 * @module composables/trackBuilder
 */

import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { useGridStore } from '@/stores/grid'
import { usePlayerStore } from '@/stores/players'
import { useTownsStore } from '@/stores/towns'
import { useTrackStore } from '@/stores/track'
import { priceLine } from '@/composables/map/trackCost'
import { lineBlock, blockMessage, townCells, builtLegs } from '@/composables/map/buildRules'
import { regionTest } from '@/composables/map/region'
import { pointKey } from '@/composables/network'
import { formatCurrency } from '@/composables/utils'

/** What to tell a player whose line starts somewhere track may not start */
export const START_RULE =
  'Track must start in a major city, or at an end or bend of your own track.'

export function useTrackBuilder() {
  const gameStore = useGameStore()
  const gridStore = useGridStore()
  const playerStore = usePlayerStore()
  const townsStore = useTownsStore()
  const trackStore = useTrackStore()

  /**
   * What every line is checked against before it is built (see buildRules.js):
   * the grid, the region being played, the cells the towns sit in, and the
   * track built so far. Worked out once rather than on every move of the
   * cursor; the board parts and the track are kept apart, so building or
   * tearing up track does not work the board out again.
   */
  const boardRules = computed(() => ({
    grid: gridStore.grid ?? [],
    isInRegion: regionTest(gameStore.region),
    townCells: townCells(townsStore.towns, gridStore.grid ?? [])
  }))
  const buildRules = computed(() => ({
    ...boardRules.value,
    builtLegs: builtLegs(trackStore.segments)
  }))

  /**
   * Every point a player may start a section from: each major city, and
   * every point their own track is drawn through — its ends, and its bends,
   * so a branch can leave a line part way along.
   * @param {number} playerId - The player
   * @returns {Array<{lat: number, lng: number}>} The points
   */
  function startPoints(playerId) {
    const cities = townsStore.towns
      .filter((town) => town.size === 'large')
      .map((town) => ({ lat: town.lat, lng: town.lon }))
    const ownPoints = trackStore
      .segmentsForOwner(playerId)
      .flatMap(({ coordinates }) => coordinates)
    return [...cities, ...ownPoints]
  }

  /**
   * Whether a player may start a section at a point.
   * @param {number} playerId - The player
   * @param {{lat: number, lng: number}} point - Where the section would start
   * @returns {boolean} True if it is one of their start points
   */
  function canStartAt(playerId, point) {
    const key = pointKey(point)
    return startPoints(playerId).some((start) => pointKey(start) === key)
  }

  /**
   * A broken build rule, in words for the player (see `blockMessage`).
   * @param {Object} block - What `lineBlock` found
   * @returns {string} The message
   */
  function describeBlock(block) {
    return blockMessage(block, gameStore.region?.properties?.NAME)
  }

  /**
   * Why a line may not be built, in words for the player; null if it may.
   * Only the line's own shape is judged here — where it starts, and whether
   * the player can pay, are checked as it is built.
   * @param {Array<Object>} latlngs - The line's vertices
   * @param {Object} [options] - See `lineBlock`: `isFinished` for a line
   *   that is done, which may not end on water
   * @returns {string|null} The reason, or null
   */
  function whyNotBuildable(latlngs, options) {
    const block = lineBlock(latlngs, buildRules.value, options)
    return block && describeBlock(block)
  }

  /**
   * Builds a section of track for a player, if every rule allows it: the
   * player is charged its price and the section is recorded as theirs, built
   * this turn.
   * @param {number} playerId - The player building
   * @param {Array<{lat: number, lng: number}>} latlngs - The section's
   *   vertices, from where it starts to where it ends
   * @returns {{ok: boolean, error?: string, segment?: Object, cost?: number}}
   *   The section built and what it cost, or why it was not built
   */
  function buildSection(playerId, latlngs) {
    if (gameStore.isOver) return { ok: false, error: 'The game is over.' }
    if (playerStore.activePlayer?.id !== playerId) {
      return { ok: false, error: "It isn't your turn." }
    }
    // Cost comes from the grid cells a line crosses, so with no grid every
    // line would price at zero and be built for nothing
    if (!gridStore.grid?.length) {
      return {
        ok: false,
        error: 'The map has not finished loading, so track cannot be priced yet.'
      }
    }
    if (!Array.isArray(latlngs) || latlngs.length < 2) {
      return { ok: false, error: 'A section needs at least two points.' }
    }
    if (!canStartAt(playerId, latlngs[0])) return { ok: false, error: START_RULE }

    const blocked = whyNotBuildable(latlngs, { isFinished: true })
    if (blocked) return { ok: false, error: blocked }

    const cost = priceLine(latlngs, gridStore.grid)
    const affordable = playerStore.availableForTrack(playerId)

    // Charged before it is recorded: once a section is in the store it is
    // indistinguishable from one that was paid for, so a build the player
    // cannot cover has to be turned away here rather than unwound later
    if (!playerStore.spendOnTrack(playerId, cost)) {
      // The store's own message is in raw numbers and names the player, which
      // is what a log wants and not what the person building wants to read
      console.warn('Track section refused:', playerStore.error)
      // Money is only one of the ways the charge can fail; blaming the budget
      // for a section that could not be priced at all would send the player
      // looking for cash they already have
      return {
        ok: false,
        error: Number.isFinite(cost)
          ? `That section costs ${formatCurrency(cost)} — more than the ${formatCurrency(affordable)} you have left to spend.`
          : 'That section could not be priced.'
      }
    }

    const segment = trackStore.addSegment({
      ownerId: playerId,
      coordinates: latlngs.map(({ lat, lng }) => ({ lat, lng })),
      cost,
      turn: gameStore.turn
    })
    if (!segment) {
      // Nothing was built, so nothing stays charged for. Losing the segment
      // silently would leave the player charged for track no save records.
      console.error('Could not record track segment:', trackStore.error)
      playerStore.refundTrackSpend(playerId, cost)
      return { ok: false, error: 'That section could not be recorded.' }
    }

    return { ok: true, segment, cost }
  }

  return { buildRules, startPoints, canStartAt, whyNotBuildable, describeBlock, buildSection }
}
