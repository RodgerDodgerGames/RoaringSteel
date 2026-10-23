/**
 * Water Mask (waterMask.js)
 *
 * Shades the grid cells the game counts as water (see water.js), so a player
 * can see where track would need a bridge before drawing it. The terrain map
 * shows every lake and river; this shows which squares of the board the game
 * treats as water, which is coarser — a cell is water when its center is.
 *
 * Every water cell is shaded, inside the region or not: a cell on the
 * border is bridged like any other, so it has to show. The water is drawn
 * under the region mask, so outside the region it is grayed with
 * everything else there.
 *
 * All the water is one shape with no outline, so neighboring water cells run
 * together into one body of water rather than a grid of squares.
 *
 * @module composables/map/waterMask
 */

import { watch } from 'vue'
import L from 'leaflet'
import { useGridStore } from '@/stores/grid'
import { isWaterCell } from '@/composables/map/water'
import { cellBounds } from '@/composables/map/trackCost'

/**
 * The map pane the water is shaded in: above the terrain tiles (200), below
 * the region mask (350), and so below the track (410 and up) too, which is
 * drawn over the water it bridges.
 */
const WATER_PANE = 'water'
const WATER_PANE_Z_INDEX = 340

/**
 * How water looks: see-through blue. It takes no clicks, and Geoman leaves it
 * alone, so track neither snaps to its edges nor can be removed with it.
 */
const WATER_STYLE = {
  pane: WATER_PANE,
  stroke: false,
  // Neighboring squares can overlap by a hair; nonzero keeps the overlap
  // filled, where Leaflet's default even-odd would leave a pale seam
  fillRule: 'nonzero',
  fillColor: '#1f6fb2',
  fillOpacity: 0.35,
  interactive: false,
  pmIgnore: true,
  snapIgnore: true
}

/**
 * The squares to shade, one for every water cell, as rings of [lat, lng]
 * corners ready to be the parts of one Leaflet polygon.
 * @param {Array<Object>} grid - Grid cells
 * @returns {Array<Array<Array<Array<number>>>>} One single-ring polygon per
 *   water cell
 */
export function waterSquares(grid) {
  return grid.filter(isWaterCell).map((cell) => {
    const { south, west, north, east } = cellBounds(cell)
    return [
      [
        [south, west],
        [north, west],
        [north, east],
        [south, east]
      ]
    ]
  })
}

/**
 * Keeps a map's water shaded, redrawn whenever the grid changes (another
 * game loaded over this one).
 * @returns {{attach: Function}} `attach(map)` shades the water on a map, once
 *   the map exists
 */
export function useWaterMask() {
  const gridStore = useGridStore()
  let map = null
  let water = null

  /** Takes down the water shaded last, if any, and shades the grid's */
  function redraw() {
    water?.remove()
    water = null
    if (!map) return
    if (!map.getPane(WATER_PANE)) {
      map.createPane(WATER_PANE).style.zIndex = WATER_PANE_Z_INDEX
    }
    const squares = waterSquares(gridStore.grid)
    if (squares.length > 0) water = L.polygon(squares, WATER_STYLE).addTo(map)
  }

  watch(() => gridStore.grid, redraw)

  /** @param {Object} leafletMap - The map to shade */
  function attach(leafletMap) {
    map = leafletMap
    redraw()
  }

  return { attach }
}
