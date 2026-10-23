/**
 * Water Mask (waterMask.js)
 *
 * Shades the grid cells the game counts as water (see water.js), so a player
 * can see where track would need a bridge before drawing it. The terrain map
 * shows every lake and river; this shows which squares of the board the game
 * treats as water, which is coarser — a cell is water when its center is.
 *
 * Only water inside the region being played is shaded: outside it, the
 * region mask has grayed everything out already.
 *
 * @module composables/map/waterMask
 */

import { watch } from 'vue'
import L from 'leaflet'
import { useGridStore } from '@/stores/grid'
import { useGameStore } from '@/stores/game'
import { isWaterCell } from '@/composables/map/water'
import { cellBounds } from '@/composables/map/trackCost'
import { regionTest } from '@/composables/map/region'

/**
 * The map pane the water is shaded in: just above the region mask (350) and
 * below the track (410 and up), so track bridging the water is drawn over it.
 */
const WATER_PANE = 'water'
const WATER_PANE_Z_INDEX = 360

/**
 * How water cells look: a see-through blue square with a fine edge. They
 * take no clicks, and Geoman leaves them alone, so track neither snaps to
 * their edges nor can be removed with them.
 */
const WATER_STYLE = {
  pane: WATER_PANE,
  color: '#1f6fb2',
  weight: 1,
  opacity: 0.6,
  fillColor: '#1f6fb2',
  fillOpacity: 0.3,
  interactive: false,
  pmIgnore: true,
  snapIgnore: true
}

/**
 * The squares to shade: every water cell whose center is inside the region,
 * as Leaflet bounds.
 * @param {Array<Object>} grid - Grid cells
 * @param {Function} isInRegion - Whether a point is in the region (see
 *   `regionTest` in region.js)
 * @returns {Array<Array<Array<number>>>} [[south, west], [north, east]] per cell
 */
export function waterCellBounds(grid, isInRegion) {
  return grid
    .filter((cell) => isWaterCell(cell) && isInRegion(cell.centroid))
    .map((cell) => {
      const { south, west, north, east } = cellBounds(cell)
      return [
        [south, west],
        [north, east]
      ]
    })
}

/**
 * Keeps a map's water shaded, redrawn whenever the grid or the region
 * changes (another game loaded over this one).
 * @returns {{attach: Function}} `attach(map)` shades the water on a map, once
 *   the map exists
 */
export function useWaterMask() {
  const gridStore = useGridStore()
  const gameStore = useGameStore()
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
    const squares = waterCellBounds(gridStore.grid, regionTest(gameStore.region))
    water = L.layerGroup(squares.map((bounds) => L.rectangle(bounds, WATER_STYLE))).addTo(map)
  }

  watch([() => gridStore.grid, () => gameStore.region], redraw)

  /** @param {Object} leafletMap - The map to shade */
  function attach(leafletMap) {
    map = leafletMap
    redraw()
  }

  return { attach }
}
