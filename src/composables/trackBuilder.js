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
 *   network grows out of one (see startRule.js). "On" means anywhere along
 *   it: at an end or bend, or part way along a leg, where the new section
 *   joins the network as a junction (see network.js);
 * - keep out of towns that are full, with the game setting that limits how
 *   many players may build into a town on: a full town can be neither
 *   started in nor built into or through by a player not already in it
 *   (see townLimits.js);
 * - keep to the build rules (inside the region, bridges, spacing, full
 *   towns — see buildRules.js);
 * - cost no more than the player has left to spend this turn, in cash and
 *   in allowance (see the player store).
 *
 * A section's price is its track: each grid cell it crosses, priced for this
 * board (see trackCost.js), and any bridges. Reaching a town costs nothing
 * more: the developed land around it is priced by its land cover, so the
 * many developed cells around a big city cost more to build through than a
 * small town's one (see `trackPrice` in config/game.js).
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
import { linePrice } from '@/composables/map/trackCost'
import {
  lineBlock,
  blockMessage,
  boardRulesFor,
  builtLegs,
  trackIndex,
  closedCells
} from '@/composables/map/buildRules'
import { isEmptyGrid } from '@/composables/map/cellGrid'
import { pointKey, townKey, liesOnTrack } from '@/composables/network'
import { formatCurrency } from '@/composables/utils'
import { startTowns, startRuleMessage } from '@/composables/startRule'
import { affordableSection } from '@/composables/bot/botPathfinder'
import { buildersByTown, closedTowns, townFullMessage } from '@/composables/townLimits'

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
   * track built so far, indexed by where it is (the board's parts come from
   * `boardRulesFor` in buildRules.js, which payoffs and setup share). Worked
   * out once rather than on every move of the cursor; the board parts and the track are kept
   * apart, so building or tearing up track does not work the board out again.
   *
   * The grid is never reactive (see stores/grid.js), so it is used as it is.
   * The track's points are unwrapped from the store's reactive copies:
   * checking a line measures every point along it against the track nearby,
   * and going through Vue's reactive wrappers for each of those made it many
   * times slower. The track is still read through the store, so a section
   * added is noticed.
   */
  const boardRules = computed(() =>
    boardRulesFor(
      gridStore.grid,
      gameStore.boardScale.speedUnitKm,
      waterStore.data,
      townsStore.towns,
      gameStore.region
    )
  )
  const builtTrack = computed(() =>
    trackIndex(builtLegs(trackStore.segments).map((leg) => leg.map((point) => toRaw(point))))
  )

  /**
   * Which players have built into each town (see `buildersByTown`), worked
   * out once per change to the towns or track rather than on every move of
   * the cursor.
   */
  const builders = computed(() =>
    buildersByTown(
      townsStore.towns,
      trackStore.segments.map((segment) => toRaw(segment))
    )
  )

  /**
   * The towns closed to a player (see townLimits.js): full, with them not
   * among the players in them. None when this game does not limit how many
   * players may build into a town.
   * @param {number} playerId - The player
   * @returns {Array<{town: Object, limit: number, playerCount: number}>} The
   *   closed towns
   */
  function closedTownsFor(playerId) {
    if (!gameStore.gameSettings.limitTownBuilders) return []
    return closedTowns(townsStore.towns, builders.value, playerId, playerStore.players.length)
  }

  /**
   * Why a player may not start a section in a town they could otherwise
   * start in (see startRule.js): it is full, and they are not in it. In
   * words, for the player; null if the point is not such a town. A town the
   * start rule rules out anyway (a small town, when track must start in a
   * major city) gives null, so the player is told the start rule instead.
   * @param {number} playerId - The player
   * @param {{lat: number, lng: number}} point - The point
   * @returns {string|null} The message, or null
   */
  function fullTownAt(playerId, point) {
    const key = pointKey(point)
    if (!startKeys.value.towns.has(key)) return null
    const closed = closedTownsFor(playerId).find(({ town }) => townKey(town) === key)
    return closed ? townFullMessage(closed) : null
  }

  /**
   * The towns a player may still build into: every town but those closed to
   * them.
   * @param {number} playerId - The player
   * @returns {Array<Object>} The towns
   */
  function openTowns(playerId) {
    const closed = new Set(closedTownsFor(playerId).map(({ town }) => town))
    return townsStore.towns.filter((town) => !closed.has(town))
  }

  /**
   * The cells of the towns closed to the player whose turn it is (see
   * `closedCells`). Track is only ever built by that player (see
   * `buildSection`), whether drawn on the map or planned by a computer
   * player on its turn, so the build rules are always theirs.
   */
  const activeClosedCells = computed(() =>
    closedCells(closedTownsFor(playerStore.activePlayer?.id), gridStore.grid)
  )

  /**
   * The rules every line is checked against: the board's, the track built so
   * far, and the towns closed to the player whose turn it is. Each part is
   * worked out on its own, so a new turn does not index the track again, nor
   * building track work the board out again.
   */
  const buildRules = computed(() => ({
    ...boardRules.value,
    builtTrack: builtTrack.value,
    closedCells: activeClosedCells.value
  }))

  /**
   * Every point a player may start a section from: each town track may start
   * in (see startRule.js) that is not closed to them (see townLimits.js),
   * and every point their own track is drawn through — its ends, and its
   * bends, so a branch can leave a line part way along.
   * @param {number} playerId - The player
   * @returns {Array<{lat: number, lng: number}>} The points
   */
  function startPoints(playerId) {
    const towns = startTowns(openTowns(playerId), requireMajorCity()).map((town) => ({
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

  /**
   * Whether a player may start a section at a point: in a town they may
   * start in that is not full to them, or anywhere on their own track — at
   * one of its points, or part way along a leg (see network.js's
   * `liesOnTrack`). The quick check of the points comes first; looking along
   * every leg is only needed off them.
   *
   * A town is never closed to a player with track at it, so their own
   * points are checked before whether a town is full.
   * @param {number} playerId - The player
   * @param {{lat: number, lng: number}} point - Where the section would start
   * @returns {boolean} True if they may start there
   */
  function canStartAt(playerId, point) {
    const key = pointKey(point)
    const { towns, own } = startKeys.value
    if (own.get(playerId)?.has(key)) return true
    if (towns.has(key)) return !fullTownAt(playerId, point)
    return liesOnTrack(point, trackStore.segmentsForOwner(playerId))
  }

  /**
   * What a section would cost to build: its track, over this board's ground
   * and water as things stand (see `linePrice` in trackCost.js). This is the
   * price building charges, and the one shown while a line is drawn. It is
   * the same for every player.
   * @param {Array<{lat: number, lng: number}>} latlngs - The section's points
   * @returns {{total: number, bridges: number}} The whole price, and how much
   *   of it is bridges
   */
  function priceSection(latlngs) {
    return linePrice(latlngs, buildRules.value)
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
    const price = (points) => priceSection(points).total
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
    // A full town is a place track could start but for the limit, so the
    // player is told about the limit, not the start rule
    if (!canStartAt(playerId, latlngs[0])) {
      return { ok: false, error: fullTownAt(playerId, latlngs[0]) ?? startRule() }
    }

    const blocked = whyNotBuildable(latlngs, { isFinished: true })
    if (blocked) return { ok: false, error: blocked }

    const cost = priceSection(latlngs).total
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
    fullTownAt,
    openTowns,
    priceSection,
    fitLine,
    whyNotBuildable,
    describeBlock,
    buildSection
  }
}
