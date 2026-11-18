/**
 * Payoffs (payoffs.js)
 *
 * What a demand pays when it is delivered.
 *
 * In Empire Builder a demand pays more the harder its commodity is to bring
 * in: the printed payoffs track how far it has to come from the places that
 * produce it. Here the payoff follows what it would cost to lay track for
 * the haul — over mountains, across a bay, over rivers — not just how long
 * the haul is, so a delivery that needs dear track pays enough to be worth
 * building it.
 *
 * A haul is priced as a straight line of track from the producing town to
 * the destination, cell by cell over the board's grid, at the same prices
 * track is built at (see `haulPrice`). A player's real line may bend round
 * the worst ground, but the straight line is a fair measure of what lies
 * between the two towns.
 *
 * The producer that counts is the one whose haul is cheapest to build, as
 * that is where a sensible player fetches the commodity from. A commodity
 * made all over the map is cheap to bring anywhere; one made only behind a
 * mountain range pays well everywhere else.
 *
 * The payoff is that price times `gameRules.payoffs.trackCostMultiple`, times
 * a long-haul bonus that grows exponentially with how far the haul is
 * measured against the map's own span — the distance between its two
 * furthest-apart towns. Reaching a distant town means building (and risking)
 * a lot of track before the first delivery pays. The bonus is measured on
 * distance alone: the terrain is already in the price, and measuring the
 * bonus on the price too would reward rough ground twice. Measuring against
 * the span keeps the bonus the same shape on a small region as on a large
 * one: a haul halfway across the map gets the same multiplier either way.
 *
 * Pure functions over plain data, so the rule can be tested without stores.
 *
 * @module composables/payoffs
 */

import * as turf from '@turf/turf'
import { gameRules } from '@/config/game'
import { terrainCost, landCellPrice } from '@/composables/map/trackCost'
import {
  isWaterCell,
  bridgeCellPrice,
  maxBridgeCells,
  riverCrossings
} from '@/composables/map/water'
import { cellAt, walkCells } from '@/composables/map/cellGrid'

/**
 * The straight-line distance between two towns, in km.
 * @param {Object} a - A town, with lat and lon
 * @param {Object} b - Another town, with lat and lon
 * @returns {number} Kilometers
 */
function townKm(a, b) {
  return turf.distance(turf.point([a.lon, a.lat]), turf.point([b.lon, b.lat]))
}

/**
 * The map's span: the straight-line distance, in km, between the two towns
 * furthest apart. No haul can be longer than this, so it is the yardstick the
 * long-haul bonus is measured against.
 *
 * Every pair is compared, which is quadratic in the number of towns — fine
 * for a map's tens-to-hundreds of towns, but it is why the deck builder works
 * this out once per deck and hands it to `demandPayoff`, rather than each
 * payoff working it out again.
 * @param {Array<Object>} towns - Every town, each with lat and lon
 * @returns {number} Kilometers; 0 when there are fewer than two towns
 */
export function mapSpanKm(towns) {
  const points = towns.map((town) => turf.point([town.lon, town.lat]))
  let span = 0
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      span = Math.max(span, turf.distance(points[i], points[j]))
    }
  }
  return span
}

/**
 * The long-haul bonus: what the payoff is multiplied by for a haul of this
 * length on a map of this span.
 *
 *   share      = km / span                       (0 to 1)
 *   multiplier = 1 + maxBonus · (e^(steepness · share) − 1) / (e^steepness − 1)
 *
 * The fraction is an exponential curve squeezed to run from 0 at no distance
 * to 1 at the full span: e^0 − 1 is 0 on top, and at the full span the top and
 * bottom are equal. So a haul of no length gets no bonus and the map's
 * longest possible haul pays exactly (1 + maxBonus) times its base payoff.
 *
 * In between, the curve is exponential: it stays low for short and middling
 * hauls and climbs fastest at the far end, so the bonus is saved for the
 * hauls that really cross the map. `steepness` sets how hard it bends. At 2,
 * a haul a quarter of the way across gets about a tenth of the bonus and one
 * halfway across about a quarter of it; higher holds more back for the very
 * longest hauls, and values near 0 straighten it into a plain line.
 * @param {number} km - The haul's length
 * @param {number} spanKm - The map's span (see `mapSpanKm`)
 * @returns {number} The multiplier, from 1 up to 1 + maxBonus
 */
export function longHaulMultiplier(km, spanKm) {
  // A map with one town, or all towns in one spot, has no long hauls; this
  // also keeps the division below from going by zero
  if (spanKm <= 0) return 1
  const { maxBonus, steepness } = gameRules.payoffs.longHaul
  // A haul runs between two of the map's towns, so it should never be longer
  // than the span. Capped anyway: past the span the exponential runs away
  // fast (twice the span would pay over 9 times the rate), so a span worked
  // out from a different set of towns must not turn into a runaway payoff.
  const share = Math.min(1, km / spanKm)
  // At a steepness of 0 the curve is 0 / 0, and it tends to a straight line
  // as steepness shrinks, so use the line. A negative or missing steepness
  // gets the line too, rather than a curve bent the wrong way or NaN.
  const curve = steepness > 0 ? Math.expm1(steepness * share) / Math.expm1(steepness) : share
  return 1 + maxBonus * curve
}

/**
 * What a stretch of lake or sea along a haul adds to its price, given how
 * many water cells the stretch has in a row.
 *
 * A stretch no longer than a bridge may span (`maxCells`) is bridged, every
 * cell at the bridge price, as track built across it would be.
 *
 * A longer stretch cannot be bridged: a real line has to go round it, which
 * costs more than going straight over, though by how much depends on the
 * shore. So the cells a bridge could span are still charged as a bridge,
 * and each cell past them adds `gameRules.payoffs.unbridgeableWater` of a
 * bridge — half, at today's setting — as a stand-in for the detour.
 *
 * @param {number} cells - Water cells in a row
 * @param {number} bridgeCell - What bridging one water cell costs (see
 *   `bridgeCellPrice` in water.js)
 * @param {number} maxCells - The most water cells a bridge may span (see
 *   `maxBridgeCells` in water.js)
 * @returns {number} Dollars
 */
export function waterStretchPrice(cells, bridgeCell, maxCells) {
  const bridged = Math.min(cells, maxCells)
  const beyond = cells - bridged
  return Math.round(
    bridged * bridgeCell + beyond * bridgeCell * gameRules.payoffs.unbridgeableWater
  )
}

/**
 * A pricer for the hauls on a board: a function giving what a straight line
 * of track from one town to another would cost, cell by cell over the grid,
 * for pricing a demand.
 *
 * Priced the way track is (see `linePrice` in trackCost.js), with three
 * differences, because this line is only a measure and is never built:
 * - A stretch of water too long to bridge is not a line that cannot be
 *   built; it is charged as a bridge and a detour (see `waterStretchPrice`).
 * - A cell whose terrain did not load (a hole, or a cell whose slope was
 *   never worked out) costs what ordinary ground does. Track pricing charges
 *   nothing for it, so a line can still be built there, but a haul over it
 *   priced at nothing would pay too little.
 * - The cells the towns sit in end a stretch of water, as they do when
 *   measuring a bridge (see `longestCrossing` in water.js): a town on the
 *   shore is the land a bridge reaches, even when its cell's center is in
 *   the water. Such a cell is still priced as a bridge, as track into it is.
 *
 * Each place the line crosses a river adds a river bridge, as track does.
 *
 * What the board's prices come to is worked out once, here, and each haul's
 * price is remembered: a deck prices the same producer and destination for
 * every commodity they share, and every producer of every demand.
 *
 * @param {Object} board - What hauls are priced against (see `pricingBoard`
 *   in buildRules.js)
 * @param {Object} board.grid - The grid (see cellGrid.js)
 * @param {number} board.priceScale - Dollars per point of terrain cost (see
 *   `trackPriceScale` in trackCost.js)
 * @param {number} board.speedUnitKm - The board's speed unit (see
 *   boardScale.js), which bridges are priced and measured in
 * @param {Object|null} [board.rivers] - The rivers on the board (see
 *   `riverIndex` in water.js); none if left out
 * @param {Array<number>} [board.townCells] - The cells the towns sit in (see
 *   `townCells` in buildRules.js)
 * @returns {Function} (from, to) => dollars, for two towns with lat and lon
 */
export function haulPricer({ grid, priceScale, speedUnitKm, rivers = null, townCells = [] }) {
  const townCellSet = new Set(townCells)
  const bridgeCell = bridgeCellPrice(grid, speedUnitKm)
  const maxCells = maxBridgeCells(grid, speedUnitKm)
  // A level cell of ordinary ground, at the board's price, rounded as each
  // land cell's price is (see `landCellPrice`)
  const ordinaryGround = Math.round(
    terrainCost(gameRules.trackPrice.openGroundCost, 0) * priceScale
  )
  // Prices worked out so far, by the town hauled from, then the town hauled to
  const known = new Map()

  /** The price of one haul, worked out afresh */
  function priceOf(from, to) {
    const start = { lat: from.lat, lng: from.lon }
    const end = { lat: to.lat, lng: to.lon }
    let total = 0
    // Water cells passed in a row since the last land (or town) cell
    let waterRun = 0
    const endWaterRun = () => {
      total += waterStretchPrice(waterRun, bridgeCell, maxCells)
      waterRun = 0
    }

    // A straight leg passes through each cell once, so no cell is charged
    // twice. A cell off the grid is charged as a hole: a line between two
    // towns on the board stays on it, so in practice there are none.
    walkCells(start, end, grid, (row, col) => {
      const cell = cellAt(grid, row, col)
      const isWater = cell !== -1 && isWaterCell(grid, cell)
      if (isWater && !townCellSet.has(cell)) {
        waterRun++
        return
      }
      endWaterRun()
      if (isWater) total += bridgeCell
      else if (cell === -1 || !Number.isFinite(grid.slope[cell])) total += ordinaryGround
      else total += landCellPrice(grid, cell, priceScale)
    })
    // A stretch of water the line ends in: only possible when the town cells
    // were not given, as the line ends in the destination's cell
    endWaterRun()

    const riverBridges =
      riverCrossings([start, end], grid, rivers).length * gameRules.bridges.riverCrossing
    return total + riverBridges
  }

  return (from, to) => {
    if (!known.has(from)) known.set(from, new Map())
    const prices = known.get(from)
    if (!prices.has(to)) prices.set(to, priceOf(from, to))
    return prices.get(to)
  }
}

/**
 * The cheapest haul of a commodity to a town: from whichever other town
 * that produces it has the cheapest straight line of track to it (see
 * `haulPricer`). Where two cost the same, the first in the list is taken.
 * @param {Object} destination - The town it is wanted in, with lat and lon
 * @param {string} industry - The commodity's name
 * @param {Array<Object>} towns - Every town, each with lat, lon and industries
 * @param {Function} priceOf - What a haul costs: (from, to) => dollars (see
 *   `haulPricer`)
 * @returns {{price: number, km: number}|null} The haul's price in dollars and
 *   its straight-line length, or null when no other town produces it
 */
export function cheapestHaul(destination, industry, towns, priceOf) {
  let cheapest = null
  towns.forEach((town) => {
    if (town === destination || !town.industries.some(({ name }) => name === industry)) return
    const price = priceOf(town, destination)
    if (!cheapest || price < cheapest.price) {
      cheapest = { price, km: townKm(town, destination) }
    }
  })
  return cheapest
}

/**
 * What delivering a commodity to a town pays: the price of its cheapest haul
 * (see `cheapestHaul`), times `trackCostMultiple`, times the long-haul bonus
 * for that haul's length, rounded, and never under the minimum.
 * @param {Object} destination - The town it is wanted in, with lat and lon
 * @param {string} industry - The commodity's name
 * @param {Array<Object>} towns - Every town, each with lat, lon and industries
 * @param {Object} pricing
 * @param {number} pricing.spanKm - The map's span (see `mapSpanKm`)
 * @param {Function} pricing.priceOf - What a haul costs: (from, to) =>
 *   dollars (see `haulPricer`)
 * @returns {number} The payoff, in dollars; the minimum when no other town
 *   produces the commodity
 */
export function demandPayoff(destination, industry, towns, { spanKm, priceOf }) {
  const { trackCostMultiple, roundTo, minimum } = gameRules.payoffs
  const haul = cheapestHaul(destination, industry, towns, priceOf)
  if (!haul) return minimum
  const dollars = haul.price * trackCostMultiple * longHaulMultiplier(haul.km, spanKm)
  return Math.max(minimum, Math.round(dollars / roundTo) * roundTo)
}
