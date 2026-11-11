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
 * - start in a town or on the player's own track — or, with the game
 *   setting for it on, in a major city, Empire Builder's own rule, so every
 *   network grows out of one (see startRule.js). "On" means at one of the
 *   points the track is drawn through (its ends and bends): that is where a
 *   new section joins the network (see network.js);
 * - keep to the build rules (inside the region, bridges, spacing — see
 *   buildRules.js);
 * - cost no more than the player has left to spend this turn, in cash and
 *   in allowance (see the player store).
 *
 * A section's price is its track — each grid cell it crosses, priced for this
 * board (see trackCost.js) — plus the entry fee for each town it reaches that
 * the player's track did not reach before (see townEntry.js).
 *
 * @module composables/trackBuilder
 */

import { computed, toRaw } from 'vue'
import { useGameStore } from '@/stores/game'
import { useGridStore } from '@/stores/grid'
import { usePlayerStore } from '@/stores/players'
import { useTownsStore } from '@/stores/towns'
import { useTrackStore } from '@/stores/track'
import { useWaterStore } from '@/stores/water'
import { linePrice, trackPriceScale } from '@/composables/map/trackCost'
import { townsByKey, entryFees, entryFeesKept } from '@/composables/townEntry'
import {
  lineBlock,
  blockMessage,
  townCells,
  builtLegs,
  trackIndex
} from '@/composables/map/buildRules'
import { isEmptyGrid } from '@/composables/map/cellGrid'
import { regionTest } from '@/composables/map/region'
import { riversFor } from '@/composables/map/waterData'
import { pointKey } from '@/composables/network'
import { formatCurrency } from '@/composables/utils'
import { startTowns, startRuleMessage } from '@/composables/startRule'
import { affordableSection } from '@/composables/bot/botPathfinder'

export function useTrackBuilder() {
  const gameStore = useGameStore()
  const gridStore = useGridStore()
  const playerStore = usePlayerStore()
  const townsStore = useTownsStore()
  const trackStore = useTrackStore()
  const waterStore = useWaterStore()

  /** Whether this game makes track start in a major city (see startRule.js) */
  const requireMajorCity = () => gameStore.gameSettings.requireMajorCityStart

  /** The start rule for this game, as told to a player who breaks it */
  const startRule = () => startRuleMessage(requireMajorCity())

  /**
   * What every line is checked against before it is built (see buildRules.js):
   * the grid, what a point of its terrain cost comes to in dollars on this
   * board (`priceScale`, see `trackPriceScale`), the board's speed unit, which
   * bridges are priced and measured in, the rivers on the board (see
   * water.js), the region being played, the cells the towns sit in, and the
   * track built so far, indexed by where it is. Worked out once rather than
   * on every move of the cursor; the board parts and the track are kept
   * apart, so building or tearing up track does not work the board out again.
   *
   * The grid is never reactive (see stores/grid.js), so it is used as it is.
   * The track's points are unwrapped from the store's reactive copies:
   * checking a line measures every point along it against the track nearby,
   * and going through Vue's reactive wrappers for each of those made it many
   * times slower. The track is still read through the store, so a section
   * added is noticed.
   */
  const boardRules = computed(() => {
    const grid = gridStore.grid
    return {
      grid,
      // An empty grid has no cells to price, and no cell size to price them by
      priceScale: isEmptyGrid(grid) ? 0 : trackPriceScale(grid, gameStore.boardScale.speedUnitKm),
      speedUnitKm: gameStore.boardScale.speedUnitKm,
      rivers: isEmptyGrid(grid) ? null : riversFor(grid, waterStore.data),
      isInRegion: regionTest(gameStore.region),
      townCells: isEmptyGrid(grid) ? [] : townCells(townsStore.towns, grid)
    }
  })
  const buildRules = computed(() => ({
    ...boardRules.value,
    builtTrack: trackIndex(
      builtLegs(trackStore.segments).map((leg) => leg.map((point) => toRaw(point)))
    )
  }))

  /**
   * Every point a player may start a section from: each town track may start
   * in (see startRule.js), and every point their own track is drawn through — its ends, and its bends,
   * so a branch can leave a line part way along.
   * @param {number} playerId - The player
   * @returns {Array<{lat: number, lng: number}>} The points
   */
  function startPoints(playerId) {
    const towns = startTowns(townsStore.towns, requireMajorCity()).map((town) => ({
      lat: town.lat,
      lng: town.lon
    }))
    const ownPoints = trackStore
      .segmentsForOwner(playerId)
      .flatMap(({ coordinates }) => coordinates)
    return [...towns, ...ownPoints]
  }

  /**
   * Every player's start points as keys (see `pointKey`), worked out once per
   * change to the towns or track rather than on every move of the cursor:
   * `towns` for everyone, and `own` by player id.
   */
  const startKeys = computed(() => {
    const own = new Map()
    trackStore.segments.forEach(({ ownerId, coordinates }) => {
      if (!own.has(ownerId)) own.set(ownerId, new Set())
      coordinates.forEach((point) => own.get(ownerId).add(pointKey(point)))
    })
    const towns = new Set(
      startTowns(townsStore.towns, requireMajorCity()).map((town) =>
        pointKey({ lat: town.lat, lng: town.lon })
      )
    )
    return { towns, own }
  })

  /** Every town by the key of the point it sits on (see `townsByKey`) */
  const townKeys = computed(() => townsByKey(townsStore.towns))

  /**
   * The points a player's track is drawn through, as network keys: what
   * their track reaches, for town entry (see townEntry.js). Gathered already
   * for the start rule.
   * @param {number} playerId - The player
   * @returns {Set<string>} Point keys
   */
  function reachedKeys(playerId) {
    return startKeys.value.own.get(playerId) ?? new Set()
  }

  /**
   * Whether a player may start a section at a point.
   * @param {number} playerId - The player
   * @param {{lat: number, lng: number}} point - Where the section would start
   * @returns {boolean} True if it is one of their start points
   */
  function canStartAt(playerId, point) {
    const key = pointKey(point)
    const { towns, own } = startKeys.value
    return towns.has(key) || Boolean(own.get(playerId)?.has(key))
  }

  /**
   * What a section would cost a player to build: its track, and the entry fee
   * for every town it reaches that their track does not reach already. This
   * is the price building charges, and the one shown while a line is drawn.
   * @param {number} playerId - The player who would build it
   * @param {Array<{lat: number, lng: number}>} latlngs - The section's points
   * @returns {{total: number, bridges: number, entry: number}} The whole
   *   price, and how much of it is bridges and how much town entry
   */
  function priceSection(playerId, latlngs) {
    const track = linePrice(latlngs, buildRules.value)
    const entry = entryFees(latlngs, townKeys.value, reachedKeys(playerId))
    return { total: track.total + entry, bridges: track.bridges, entry }
  }

  /**
   * Cuts a finished line back to the longest start of it that can be built,
   * so a line is built as far as it can go instead of not at all. Two things
   * cut a line short:
   * - money: the player cannot pay for all of it, so it stops at the last
   *   vertex they can pay for;
   * - water: it ends out on the water, where a bridge has to reach land, so
   *   it stops at the last vertex on land (or in a town).
   * Both can apply at once: if the last vertex the money reaches is out on
   * water, the cut goes back further, to one on land.
   *
   * The cut falls on one of the line's own vertices, never between two: a
   * vertex is a point the player chose. It is made by `affordableSection`,
   * which a computer player's lines are cut by too, so both are held to the
   * same limits the same way.
   *
   * Only money and the water at the end are judged here. The line is assumed
   * to keep to the build rules otherwise — the drawing tool takes back any
   * leg that breaks one — and every start of such a line keeps to them too.
   * A line that breaks some other rule, or that cannot be priced at all, is
   * handed back whole, so building refuses it and says why.
   *
   * @param {number} playerId - The player who would build it
   * @param {Array<{lat: number, lng: number}>} latlngs - The line's vertices
   * @returns {{points: Array<Object>|null, isCut: boolean,
   *   limit: ('allowance'|'cash'|null), available: number, toLand: boolean}}
   *   - `points`: what to build — the whole line, the start of it that can
   *     be built, or null when none of it can;
   *   - `isCut`: whether `points` is less than the whole line;
   *   - `limit`: what money ran out, if it did: 'allowance' for this turn's
   *     building allowance, 'cash' for the player's cash, whichever is
   *     smaller (the allowance when they are equal, since the allowance is
   *     the rule that is always there); null when money was not the problem;
   *   - `available`: what the player had to spend, before building;
   *   - `toLand`: true when the cut went back past a vertex that could be
   *     paid for, to reach land.
   */
  function fitLine(playerId, latlngs) {
    const available = playerStore.availableForTrack(playerId)
    const price = (points) => priceSection(playerId, points).total
    const whole = price(latlngs)
    const uncut = { points: latlngs, isCut: false, limit: null, available, toLand: false }
    // Not a money problem, and cutting it would only hide the real one
    if (!Number.isFinite(whole)) return uncut

    const isAffordable = whole <= available
    const endsOnWater =
      lineBlock(latlngs, buildRules.value, { isFinished: true })?.reason === 'endsOnWater'
    if (isAffordable && !endsOnWater) return uncut

    const points = affordableSection(latlngs, available, buildRules.value, price)
    if (isAffordable) return { points, isCut: true, limit: null, available, toLand: true }

    const allowance = playerStore.trackBudgetRemaining(playerId)
    const limit = allowance <= available ? 'allowance' : 'cash'
    // Cut short of a vertex that could be paid for only if the vertex after
    // the cut could still have been: then it was water, not money, that
    // stopped it there
    const kept = points?.length ?? 1
    const toLand = price(latlngs.slice(0, kept + 1)) <= available
    return { points, isCut: true, limit, available, toLand }
  }

  /**
   * What tearing up a section built this turn gives back: what it cost, less
   * any entry fee it paid for a town the player's other track still reaches
   * (see `entryFeesKept`). Asked before the section is taken out of the store.
   * @param {Object} segment - The section, as the track store holds it
   * @returns {number} Dollars to refund
   */
  function refundFor(segment) {
    const own = trackStore.segmentsForOwner(segment.ownerId)
    return segment.cost - entryFeesKept(segment, own, townKeys.value)
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
    if (isEmptyGrid(gridStore.grid)) {
      return {
        ok: false,
        error: 'The map has not finished loading, so track cannot be priced yet.'
      }
    }
    if (!Array.isArray(latlngs) || latlngs.length < 2) {
      return { ok: false, error: 'A section needs at least two points.' }
    }
    if (!canStartAt(playerId, latlngs[0])) return { ok: false, error: startRule() }

    const blocked = whyNotBuildable(latlngs, { isFinished: true })
    if (blocked) return { ok: false, error: blocked }

    const cost = priceSection(playerId, latlngs).total
    const affordable = playerStore.availableForTrack(playerId)
    // Whether building had started this turn, to put back if this one fails
    const hadSpent = playerStore.hasSpentThisTurn(playerId)

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
      // Nothing was built, so building has not started either
      if (!hadSpent) playerStore.updatePlayer(playerId, { hasSpentThisTurn: false })
      return { ok: false, error: 'That section could not be recorded.' }
    }

    return { ok: true, segment, cost }
  }

  return {
    startRule,
    boardRules,
    buildRules,
    startPoints,
    canStartAt,
    reachedKeys,
    priceSection,
    fitLine,
    refundFor,
    whyNotBuildable,
    describeBlock,
    buildSection
  }
}
