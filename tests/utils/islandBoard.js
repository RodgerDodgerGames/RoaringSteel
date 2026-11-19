/**
 * A Board with Islands, for Tests
 *
 * One row of land and water, west to east, played at a speed unit of one
 * cell (10 km), so a bridge may span at most 3 cells of water (see
 * `gameRules.bridges.maxSpeedUnits`):
 *
 *   cols 0–5    the mainland: towns West, Middle and East
 *   cols 6–7    water, 2 cells: bridgeable
 *   cols 8–9    a near island: town Near
 *   cols 10–14  water, 5 cells: too wide to bridge
 *   cols 15–16  a far island: town Far
 *   col  17     water, 1 cell: bridgeable
 *   cols 18–19  a second far island: town Farther
 *
 * So track can join West, Middle, East and Near; and, apart from them, Far
 * and Farther.
 */

import { makeTestGrid, CELL, CELL_METERS } from './testGrid'

/** The speed unit the board is played at: one cell */
export const ISLAND_SPEED_UNIT_KM = CELL_METERS / 1000

/** The board's columns of water */
const WATER = new Set([6, 7, 10, 11, 12, 13, 14, 17])

/**
 * The board's grid: three rows of the columns above.
 * @returns {Object} The grid
 */
export function makeIslandGrid() {
  return makeTestGrid({
    rows: 3,
    cols: 20,
    cell: (row, col) => (WATER.has(col) ? { water: true } : { landCover: 100 })
  })
}

/**
 * A town in the middle row, at the center of a column's cell.
 * @param {string} name - The town's name
 * @param {number} col - Its column
 * @param {number} [population] - How many live there
 * @returns {Object} The town
 */
export function islandTown(name, col, population = 10000) {
  return {
    name,
    msa: name.toLowerCase(),
    lat: 1.5 * CELL,
    lon: (col + 0.5) * CELL,
    size: 'small',
    population,
    industries: []
  }
}

/**
 * The board's towns, by name.
 * @returns {Object<string, Object>} West, Middle, East, Near, Far, Farther
 */
export function makeIslandTowns() {
  return {
    West: islandTown('West', 0),
    Middle: islandTown('Middle', 2),
    East: islandTown('East', 5),
    Near: islandTown('Near', 9),
    Far: islandTown('Far', 15),
    Farther: islandTown('Farther', 19)
  }
}
