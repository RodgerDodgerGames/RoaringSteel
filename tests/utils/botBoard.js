/**
 * A Board for Computer Player Tests
 *
 * A small made-up state, laid out the way the grid store lays out a real
 * one (see stores/grid.js): 10 km cells in rows and columns over the
 * region's bounding box. It has the things a computer player must find its
 * way around:
 * - a notch cut out of the region's top right corner, where track may not go;
 * - a lake four cells across, too wide to bridge;
 * - a river one cell wide, which can be bridged;
 * - a ridge of dear cells down the middle, with a cheap pass through it;
 * - ten towns, four of them major cities, producing a spread of goods, and
 *   an eleventh out in the notch that no track can reach.
 */

import { gridConfig } from '@/config/grid'
import { nlcdCostMap } from '@/config/nlcd'
import {
  metersToLatitudeDegrees,
  metersToLongitudeDegrees
} from '@/composables/setup/useMapSupport'
import { makeTestGrid } from './testGrid'

export const ROWS = 20
export const COLS = 26

const SOUTH = 40
const WEST = -100
const LAT_STEP = metersToLatitudeDegrees(gridConfig.cellSize)
const LNG_STEP = metersToLongitudeDegrees(gridConfig.cellSize, SOUTH + (ROWS * LAT_STEP) / 2)
const NORTH = SOUTH + ROWS * LAT_STEP
const EAST = WEST + COLS * LNG_STEP

/** The center of the cell at a row and column */
export const centerAt = (row, col) => ({
  lat: SOUTH + (row + 0.5) * LAT_STEP,
  lng: WEST + (col + 0.5) * LNG_STEP
})

/** The land cover the grid gives open water */
const WATER = nlcdCostMap[11]

/** Whether a cell is in the lake (rows 8–11, columns 4–7) */
export const isLake = (row, col) => row >= 8 && row <= 11 && col >= 4 && col <= 7

/** Whether a cell is the river (column 18) */
export const isRiver = (row, col) => col === 18

/** Whether a cell is on the ridge (column 12), apart from the pass at row 3 */
export const isRidge = (row, col) => col === 12 && row !== 3

/**
 * The board's grid.
 * @param {Function} [keep] - `(row, col)` → whether the cell is on the
 *   board; every cell is, unless told otherwise
 * @returns {Object} The grid
 */
export function makeGrid(keep = () => true) {
  return makeTestGrid({
    rows: ROWS,
    cols: COLS,
    south: SOUTH,
    west: WEST,
    latStep: LAT_STEP,
    lngStep: LNG_STEP,
    cell: (row, col) =>
      keep(row, col)
        ? {
            elevation: 100,
            landCover: isLake(row, col) || isRiver(row, col) ? WATER : 300,
            cost: isRidge(row, col) ? 6000 : 400 + ((row * 7 + col * 13) % 9) * 120
          }
        : null
  })
}

/**
 * The region: the board's bounding box, less a notch out of the top right
 * corner (the top five rows of the last six columns).
 */
export function makeRegion() {
  const notchSouth = NORTH - 5 * LAT_STEP
  const notchWest = EAST - 6 * LNG_STEP
  return {
    type: 'Feature',
    properties: { STATE: '99', NAME: 'Testland' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [WEST, SOUTH],
          [EAST, SOUTH],
          [EAST, notchSouth],
          [notchWest, notchSouth],
          [notchWest, NORTH],
          [WEST, NORTH],
          [WEST, SOUTH]
        ]
      ]
    }
  }
}

/** A town a little off the center of a cell, as real towns are */
const town = (name, row, col, size, industries) => {
  const { lat, lng } = centerAt(row, col)
  return {
    name,
    msa: name.toLowerCase(),
    lat: lat + LAT_STEP * 0.1,
    lon: lng - LNG_STEP * 0.15,
    size,
    population: 10000,
    industries: industries.map((name, i) => ({ name, industry: i + 1 }))
  }
}

/** The towns of the board */
export function makeTowns() {
  return [
    town('Alder', 2, 2, 'large', ['Coal', 'Steel']),
    town('Birch', 16, 3, 'large', ['Wheat']),
    town('Cedar', 4, 21, 'large', ['Machinery', 'Oil']),
    town('Dogwood', 13, 23, 'large', ['Cattle']),
    town('Elm', 9, 10, 'medium', ['Fruit', 'Coal']),
    town('Fir', 13, 16, 'medium', ['Oil']),
    town('Gum', 6, 15, 'small', ['Wheat', 'Beer']),
    town('Hazel', 18, 13, 'small', ['Steel']),
    town('Ivy', 11, 2, 'small', ['Cattle', 'Beer']),
    town('Juniper', 1, 9, 'small', ['Fruit']),
    // In the notch, outside the region: no track can reach it
    town('Kauri', 18, 24, 'small', ['Gold'])
  ]
}

/**
 * A stand-in for Math.random that always gives the same numbers, so a deck
 * built from it is the same every run.
 * @param {number} seed - Where the numbers start
 * @returns {Function} The generator
 */
export function seededRandom(seed) {
  let state = seed >>> 0
  return () => {
    // Mulberry32
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
