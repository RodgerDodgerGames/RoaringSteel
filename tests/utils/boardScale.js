/**
 * Board scale for tests.
 *
 * How far a train runs, what track costs and what deliveries pay all hang on
 * the board's speed unit (see composables/boardScale.js), which comes from
 * tuning settings meant to be changed after playtests. Tests that place towns
 * a set distance apart pin the speed unit instead, so they check the rules
 * rather than whatever the settings say today.
 */

import { boardConfig } from '@/config/board'
import { gameRules } from '@/config/game'
import { CELL_METERS } from './testGrid'

/**
 * Makes every board — with or without a region — play at this speed unit,
 * until the returned function puts the settings back.
 *
 * Done by swapping in anchors on a straight line through the origin: turns
 * to cross then grow in step with the board's size, so every size gives the
 * same speed unit. Must be called before the game store first works out its
 * board scale (a fresh Pinia per test does that).
 *
 * @param {number} speedUnitKm - The speed unit wanted, in km
 * @returns {Function} Puts the settings back
 */
export function pinSpeedUnit(speedUnitKm) {
  const saved = { ...boardConfig }
  // A board of this size takes 10 turns at the reference speed
  const sizeKm = 10 * boardConfig.referenceSpeed * speedUnitKm
  boardConfig.turnsToCross = [
    { sizeKm, turns: 10 },
    { sizeKm: 2 * sizeKm, turns: 20 }
  ]
  boardConfig.fallbackSizeKm = sizeKm
  return () => Object.assign(boardConfig, saved)
}

/**
 * Sets the track price's tuning knobs (`gameRules.trackPrice.knobs`), until
 * the returned function puts them back. Tests that check how track is priced
 * or searched, rather than today's tuning, pin them.
 *
 * @param {number} landCover - The land cover knob
 * @param {number} [elevation] - The elevation knob; the same as land cover's
 *   if not given
 * @returns {Function} Puts the knobs back
 */
export function pinKnobs(landCover, elevation = landCover) {
  const { knobs } = gameRules.trackPrice
  const saved = { ...knobs }
  Object.assign(knobs, { landCover, elevation })
  return () => Object.assign(knobs, saved)
}

/**
 * Plays the game at the scale it had before boards were scaled: a 10 km
 * speed unit — one cell of the test grids, so a Freight runs 90 km a turn —
 * and level track on the test grids costing exactly its land cover cost in
 * dollars. For tests about which cells are charged, or how players play,
 * rather than at what rate. Both tuning knobs are set to whatever makes a
 * level cell's price its land cover cost.
 *
 * @returns {Function} Puts the settings back
 */
export function pinPlainScale() {
  const speedUnitKm = 10
  const { perSpeedUnit, openGroundCost } = gameRules.trackPrice
  const restoreScale = pinSpeedUnit(speedUnitKm)
  // Dollars per point of terrain = perSpeedUnit / openGroundCost · cell km /
  // speed unit km (see trackPriceScale), and the knob multiplies the points;
  // make the two together 1
  const cellKm = CELL_METERS / 1000
  const restoreKnobs = pinKnobs((openGroundCost * speedUnitKm) / (perSpeedUnit * cellKm))
  return () => {
    restoreScale()
    restoreKnobs()
  }
}
