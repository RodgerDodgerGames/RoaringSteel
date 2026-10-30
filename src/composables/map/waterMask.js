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
 * All the water is one picture, laid over the grid's bounding box, with a
 * pixel for each water cell's column, so neighboring water cells run
 * together into one body of water rather than a grid of squares. One
 * picture is far quicker for the map to redraw as it pans and zooms than a
 * shape with a corner for every water cell, which on a fine grid ran to
 * hundreds of thousands of corners.
 *
 * @module composables/map/waterMask
 */

import { watch } from 'vue'
import L from 'leaflet'
import { useGridStore } from '@/stores/grid'
import { cellAt, isEmptyGrid } from '@/composables/map/cellGrid'
import { isWaterCell } from '@/composables/map/water'

/**
 * The map pane the water is shaded in: above the terrain tiles (200), below
 * the region mask (350), and so below the track (410 and up) too, which is
 * drawn over the water it bridges.
 */
const WATER_PANE = 'water'
const WATER_PANE_Z_INDEX = 340

/** A water pixel: #1f6fb2, solid (the picture as a whole is see-through) */
const WATER_PIXEL = Uint8ClampedArray.of(0x1f, 0x6f, 0xb2, 255)

/** How see-through the water is drawn */
const WATER_OPACITY = 0.35

/**
 * How many pixels of the picture each row of cells gets, and the most the
 * picture may have in all (browsers refuse very tall canvases). Rows need
 * several pixels each because the map stretches the picture unevenly north
 * to south (see `waterPicture`), so a row's edges fall between pixels.
 */
const PIXELS_PER_ROW = 8
const MAX_HEIGHT = 4096

/**
 * How the map projects a latitude north–south (Web Mercator), up to scale.
 * @param {number} lat - Degrees
 * @returns {number} The projected height
 */
const mercatorY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))

/** The latitude at a projected height: `mercatorY` backward */
const latitudeAt = (y) => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90

/**
 * The water as a picture: RGBA pixels, transparent but for the water cells,
 * and the edges of the map it covers.
 *
 * The map lays a picture over its bounds evenly in its own projection, Web
 * Mercator, which stretches the north more than the south; the grid's rows
 * are evenly spaced in latitude. Spread evenly over a state the size of
 * Texas, the picture's middle rows would land a couple of cells off. So each
 * row of pixels is matched to the latitude the map will put it at, and takes
 * the grid row there.
 *
 * Columns need no such care: the map's east–west is even in longitude, as
 * the grid's columns are, so a column of pixels is a column of cells.
 *
 * @param {Object} grid - The grid (see cellGrid.js)
 * @returns {{width: number, height: number, pixels: Uint8ClampedArray,
 *   bounds: {south: number, west: number, north: number, east: number}}|null}
 *   The picture, or null when there is no water to show
 */
export function waterPicture(grid) {
  if (isEmptyGrid(grid)) return null
  const { rows, cols, south, west, latStep, lngStep } = grid
  const north = south + rows * latStep
  const width = cols
  const height = Math.min(rows * PIXELS_PER_ROW, MAX_HEIGHT)
  const pixels = new Uint8ClampedArray(width * height * 4)

  const top = mercatorY(north)
  const bottom = mercatorY(south)
  let hasWater = false
  for (let y = 0; y < height; y++) {
    // The latitude at the middle of this row of pixels, counting down from the north
    const lat = latitudeAt(top - ((y + 0.5) / height) * (top - bottom))
    const row = Math.min(rows - 1, Math.floor((lat - south) / latStep))
    for (let col = 0; col < cols; col++) {
      const cell = cellAt(grid, row, col)
      if (cell === -1 || !isWaterCell(grid, cell)) continue
      pixels.set(WATER_PIXEL, (y * width + col) * 4)
      hasWater = true
    }
  }
  if (!hasWater) return null
  return { width, height, pixels, bounds: { south, west, north, east: west + cols * lngStep } }
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
    const picture = waterPicture(gridStore.grid)
    if (!picture) return

    const canvas = document.createElement('canvas')
    canvas.width = picture.width
    canvas.height = picture.height
    canvas
      .getContext('2d')
      .putImageData(new ImageData(picture.pixels, picture.width, picture.height), 0, 0)

    const { south, west, north, east } = picture.bounds
    // It takes no clicks, and Geoman leaves it alone, so track neither snaps
    // to it nor can be removed with it
    water = L.imageOverlay(
      canvas.toDataURL(),
      [
        [south, west],
        [north, east]
      ],
      {
        pane: WATER_PANE,
        opacity: WATER_OPACITY,
        interactive: false,
        pmIgnore: true,
        snapIgnore: true
      }
    ).addTo(map)
    // Each pixel is a cell: drawn as a hard-edged square when zoomed in, not
    // blurred into its neighbors
    water.getElement().style.imageRendering = 'pixelated'
  }

  watch(() => gridStore.grid, redraw)

  /** @param {Object} leafletMap - The map to shade */
  function attach(leafletMap) {
    map = leafletMap
    redraw()
  }

  return { attach }
}
