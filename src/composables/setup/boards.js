/**
 * Boards (boards.js)
 *
 * A board is the land a game is played on: one state, or a region of several
 * (see config/regions.js). It is kept as one GeoJSON feature, the game
 * store's `region`, so everything that works from the board's outline — the
 * grid, the gray mask outside it, its size, which towns are on it — treats a
 * region exactly as it does a state.
 *
 * A board's properties say what it is:
 * - `NAME`: what players see it called ("Iowa", "New England");
 * - `STATES`: the FIPS codes of the states on it, whose towns and jobs data
 *   the game is set up from;
 * - `STATE`, on a state's own board: its FIPS code.
 *
 * A board's grid is kept in the browser's database under a key made from
 * its states (see `boardKey`): a state's FIPS code, so grids kept before
 * regions existed are still found, or a region's states' codes together. So
 * the same states make the same board, whichever grouping they were chosen
 * from, and a region whose states are changed in regions.js gets a grid of
 * its own rather than one drawn for its old outline.
 *
 * Pure functions over plain data, so they are tested without a map.
 *
 * @module composables/setup/boards
 */

import { featureCollection, union } from '@turf/turf'
import usStates from '@/config/usStates'
import { REGION_GROUPINGS } from '@/config/regions'

/** The Area Select grouping that offers single states */
export const STATES_GROUPING = 'states'

/**
 * Every way of choosing a board, in the order the Area Select screen offers
 * them: each grouping of regions, in the order regions.js lists them, then
 * single states.
 * @returns {Array<{id: string, label: string}>} The groupings
 */
export function boardGroupings() {
  return [
    ...REGION_GROUPINGS.map(({ id, label }) => ({ id, label })),
    { id: STATES_GROUPING, label: 'States' }
  ]
}

/**
 * The board for one state.
 * @param {Object} state - The state's outline, a feature from
 *   us-states.geojson (with STATE and NAME)
 * @returns {Object} The board
 */
export function stateBoard(state) {
  return {
    ...state,
    properties: { ...state.properties, STATES: [state.properties.STATE] }
  }
}

/**
 * The FIPS codes of a region's states, which regions.js names by postal
 * abbreviation. An abbreviation that names no state is left out.
 * @param {{states: Array<string>}} region - The region (see config/regions.js)
 * @returns {Array<string>} The states' FIPS codes, in the region's order
 */
function regionFips(region) {
  return region.states
    .map((abbr) => usStates.find((state) => state.abbr === abbr)?.fips)
    .filter(Boolean)
}

/**
 * The board for a region: its states' outlines joined into one.
 * @param {{id: string, name: string, states: Array<string>}} region - The
 *   region, its states by postal abbreviation (see config/regions.js)
 * @param {Array<Object>} stateFeatures - Every state's outline (from
 *   us-states.geojson)
 * @returns {Object|null} The board; null if none of its states has an outline
 */
export function regionBoard(region, stateFeatures) {
  const fips = regionFips(region)
  const outlines = stateFeatures.filter((feature) => fips.includes(feature.properties.STATE))
  if (outlines.length === 0) return null
  const joined = outlines.length === 1 ? outlines[0] : union(featureCollection(outlines))
  return {
    type: 'Feature',
    geometry: joined.geometry,
    properties: {
      NAME: region.name,
      STATES: outlines.map((feature) => feature.properties.STATE)
    }
  }
}

/**
 * Every board a grouping offers.
 * @param {string} groupingId - STATES_GROUPING, or a grouping's id from
 *   config/regions.js
 * @param {Array<Object>} stateFeatures - Every state's outline
 * @returns {Array<Object>} The boards
 */
export function boardsFor(groupingId, stateFeatures) {
  if (groupingId === STATES_GROUPING) return stateFeatures.map(stateBoard)
  const grouping = REGION_GROUPINGS.find(({ id }) => id === groupingId)
  if (!grouping) return []
  return grouping.regions.map((region) => regionBoard(region, stateFeatures)).filter(Boolean)
}

/**
 * The FIPS codes of the states on a board. A board chosen before regions
 * existed (an older save) names only its one state.
 * @param {Object} board - The board
 * @returns {Array<string>} The states' FIPS codes
 */
export function boardStates(board) {
  const { STATES, STATE } = board?.properties ?? {}
  return Array.isArray(STATES) ? STATES : STATE ? [STATE] : []
}

/**
 * The key a board's grid is kept under, and by which the board chosen is
 * known on the map: a state's FIPS code, or a region's states' codes in
 * order, as "states:09,23,25".
 * @param {Object} board - The board
 * @returns {string|undefined} The key; none for a board with no states
 */
export function boardKey(board) {
  const states = boardStates(board)
  if (states.length === 0) return undefined
  return states.length === 1 ? states[0] : `states:${[...states].sort().join(',')}`
}

/**
 * The grouping that offers a board, so the Area Select screen can open on it
 * when the player comes back to change their board: the board they chose is
 * then on the map, marked, rather than hidden under another grouping.
 *
 * A state's own board (it names its STATE) is offered by the States
 * grouping. A region's board is found by its states, not its name: names
 * repeat between groupings (there is a "Midwest" among Objective Lists'
 * regions and among the Census regions), and the same states make the same
 * board whatever it is called (see `boardKey`). When more than one grouping
 * offers the same states, the first listed wins.
 *
 * @param {Object|null} board - The board chosen, or null
 * @returns {string|null} The grouping's id; null for no board, or a board no
 *   grouping offers (a region since taken out of regions.js)
 */
export function boardGrouping(board) {
  if (!board) return null
  if (board.properties?.STATE) return STATES_GROUPING
  const key = boardKey(board)
  if (!key) return null
  const grouping = REGION_GROUPINGS.find(({ regions }) =>
    regions.some((region) => boardKey({ properties: { STATES: regionFips(region) } }) === key)
  )
  return grouping?.id ?? null
}

/**
 * What the setup screens say about the board chosen: its name, and how many
 * states it covers when it is more than one, as "Board: Iowa" or
 * "Board: New England (6 states)".
 * @param {Object|null} board - The board chosen, or null
 * @returns {string|null} The line to show; null when there is no board, as
 *   each screen words that its own way (the map screen asks for a click)
 */
export function boardLabel(board) {
  if (!board) return null
  const count = boardStates(board).length
  const states = count > 1 ? ` (${count} states)` : ''
  return `Board: ${board.properties.NAME}${states}`
}
