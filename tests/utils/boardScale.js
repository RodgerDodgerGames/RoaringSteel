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
import { gridConfig } from '@/config/grid'

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
 * Plays the game at the scale it had before boards were scaled: a 10 km
 * speed unit — one cell of the test grids, so a Freight runs 90 km a turn —
 * and track on the test grids costing exactly its terrain cost in dollars.
 * For tests about which cells are charged, or how players play, rather than
 * at what rate. The tuning knob is set to whatever makes a cell's price its
 * terrain cost.
 *
 * @returns {Function} Puts the settings back
 */
export function pinPlainScale() {
  const speedUnitKm = 10
  const { perSpeedUnit, openGroundCost, multiplier } = gameRules.trackPrice
  const restoreScale = pinSpeedUnit(speedUnitKm)
  // Dollars per point of terrain = perSpeedUnit · multiplier / openGroundCost
  // · cell km / speed unit km (see trackPriceScale); make that 1
  const cellKm = gridConfig.cellSize / 1000
  gameRules.trackPrice.multiplier = (openGroundCost * speedUnitKm) / (perSpeedUnit * cellKm)
  return () => {
    restoreScale()
    gameRules.trackPrice.multiplier = multiplier
  }
}
