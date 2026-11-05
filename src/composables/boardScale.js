/**
 * Board Scale (boardScale.js)
 *
 * How the size of the board sets the distances the game is played at.
 *
 * Trains are rated by speed — 9 for a Freight, 12 for a Fast Freight — but
 * how far a speed of 9 carries a train depends on the board. Each board has a
 * hidden distance, its speed unit, and a train runs its speed in speed units
 * each turn. The speed unit is chosen so that a speed-9 train crosses the
 * board in the number of turns `boardConfig.turnsToCross` gives for a board
 * of its size: about 6 turns on a small board, 10 on one Colorado's size, 15
 * on a big one.
 *
 * The speed unit is the game's yardstick for money too. Track is priced, and
 * deliveries pay, per speed unit (see trackCost.js and payoffs.js), so a
 * turn's building allowance buys about the same share of a turn's travel on
 * every board, as in Empire Builder, whatever the board's size or the size of
 * its grid cells.
 *
 * Pure functions over plain data, so the rules can be tested without stores.
 *
 * @module composables/boardScale
 */

import { area } from '@turf/turf'
import { boardConfig } from '@/config/board'
import { regionPolygons } from '@/composables/map/region'

/**
 * How big a region is, as one length: the square root of its area, in km.
 * A square region's size is its side; any other shape counts the same as a
 * square of equal area, so a long, thin state is not treated as a big one.
 * @param {Object|null} region - GeoJSON Feature or FeatureCollection
 * @returns {number} Kilometers; 0 for no region
 */
export function boardSizeKm(region) {
  const squareMeters = regionPolygons(region).reduce((sum, feature) => sum + area(feature), 0)
  return Math.sqrt(squareMeters) / 1000
}

/**
 * How many turns a train of the reference speed takes to cross a board of
 * this size, read off the anchor points in `boardConfig.turnsToCross`.
 *
 * Between two anchors the turns follow a power curve — a straight line on a
 * log–log plot — so each doubling of the board's size multiplies the turns by
 * the same amount. Beyond the outermost anchors the curve of the nearest two
 * carries on.
 *
 * @param {number} sizeKm - The board's size (see `boardSizeKm`)
 * @param {Array<{sizeKm: number, turns: number}>} [anchors] - The anchor
 *   points; at least two, in any order
 * @returns {number} Turns, not rounded
 */
export function turnsToCross(sizeKm, anchors = boardConfig.turnsToCross) {
  const points = [...anchors].sort((a, b) => a.sizeKm - b.sizeKm)
  // The pair of anchors whose stretch of curve the size falls on: the first
  // pair whose upper end it is below, or the last pair for anything larger
  let upper = points.findIndex(({ sizeKm: anchorKm }) => sizeKm < anchorKm)
  if (upper < 1) upper = upper === 0 ? 1 : points.length - 1
  const low = points[upper - 1]
  const high = points[upper]

  // turns = low.turns · (size / low.size) ^ slope, the slope taken from the
  // two anchors on the log–log plot
  const slope = Math.log(high.turns / low.turns) / Math.log(high.sizeKm / low.sizeKm)
  return low.turns * (sizeKm / low.sizeKm) ** slope
}

/**
 * Everything the board's size decides, worked out once per region.
 *
 * A region with no area (none at all, or a damaged save's) is played at
 * `boardConfig.fallbackSizeKm`, so trains still run and track still prices.
 *
 * @param {Object|null} region - GeoJSON Feature or FeatureCollection
 * @returns {{sizeKm: number, turnsToCross: number, speedUnitKm: number}}
 *   The board's size; the turns a reference-speed train takes to cross it;
 *   and its speed unit, the km a train covers per point of speed per turn
 */
export function boardScaleFor(region) {
  const measured = boardSizeKm(region)
  const sizeKm = measured > 0 ? measured : boardConfig.fallbackSizeKm
  const turns = turnsToCross(sizeKm)
  return {
    sizeKm,
    turnsToCross: turns,
    // A reference-speed train runs `referenceSpeed` units a turn and crosses
    // the board in `turns` turns
    speedUnitKm: sizeKm / (turns * boardConfig.referenceSpeed)
  }
}

/**
 * A distance as the player is shown it. Players are never told km: a train
 * has a speed (9, 12), and distances are given in the same points, so a
 * town 14 away is a turn and a half for a speed-9 train.
 *
 * Shown to a tenth, and rounded the cautious way for what it is: distance
 * left rounds down and distance to cover rounds up, so a town shown as no
 * further than the distance left is always one the train can reach.
 *
 * @param {number} km - The distance, in km
 * @param {number} speedUnitKm - The board's speed unit
 * @param {'up'|'down'} rounding - 'up' for a distance to cover, 'down' for
 *   one left to run
 * @returns {string} The distance, e.g. "14" or "8.6"
 */
export function formatDistance(km, speedUnitKm, rounding) {
  const tenths = (km / speedUnitKm) * 10
  // A hair's leeway, so a distance that is a whole number of tenths but for
  // floating-point noise is not pushed to the next one
  const rounded = rounding === 'up' ? Math.ceil(tenths - 1e-6) : Math.floor(tenths + 1e-6)
  return String(rounded / 10)
}
