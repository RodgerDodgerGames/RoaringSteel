/**
 * Elevation Tiles (useElevationTiles.js)
 *
 * Gets the elevation under each grid cell from the AWS Terrain Tiles.
 *
 * The tiles are map tiles like any other — 256 by 256 pixels, laid out in
 * the web map's usual zoom/x/y scheme — except that each pixel's color is a
 * height rather than a picture ("terrarium" encoding, see `decodeTerrarium`).
 * One tile covers hundreds of cells, so a whole state takes tens of requests
 * where looking cells up one batch at a time took hundreds, and the service
 * has no key or rate limit to run into.
 *
 * Each cell is read from every pixel that falls inside it, not one point:
 * its height is the average of them, and its roughness the average steepness
 * between neighboring pixels inside it. The tiles are fetched at the zoom
 * where a cell is about `pixelsPerCell` pixels across, so a cell is read from
 * a couple of hundred heights.
 *
 * Over US land the tiles are built from USGS data: SRTM (30 m) at zooms 7–9
 * and 3DEP (10 m) from zoom 10. Lakes read as their surface height; the sea
 * reads below zero, from NOAA's sea floor depths.
 *
 * Source: https://registry.opendata.aws/terrain-tiles/
 *
 * @module composables/setup/useElevationTiles
 */

import { gridApiConfig } from '@/config/grid'
import { mapWithConcurrency } from '@/composables/utils'
import { fetchImagePixels } from '@/composables/setup/imagePixels'

/** Width and height of a tile, in pixels */
const TILE_SIZE = 256

/** The equator's length on the sphere web maps are drawn on, in meters */
const EQUATOR_METERS = 2 * Math.PI * 6378137

/**
 * How many meters of ground one tile pixel covers, east to west.
 * @param {number} zoom - Tile zoom
 * @param {number} latitude - Where, in degrees; pixels shrink toward the poles
 * @returns {number} Meters per pixel
 */
export function metersPerPixel(zoom, latitude) {
  return (Math.cos((latitude * Math.PI) / 180) * EQUATOR_METERS) / (TILE_SIZE * 2 ** zoom)
}

/**
 * The zoom to fetch tiles at: the coarsest one that still puts about
 * `pixelsPerCell` pixels across a cell. Finer would mean more tiles to
 * download for little better a reading of the cell.
 * @param {number} cellMeters - Width of a grid cell, in meters
 * @param {number} latitude - The region's latitude, in degrees
 * @returns {number} The zoom
 */
export function zoomForCell(cellMeters, latitude) {
  const wantedMeters = cellMeters / gridApiConfig.pixelsPerCell
  for (let zoom = 0; zoom < gridApiConfig.elevationMaxZoom; zoom++) {
    if (metersPerPixel(zoom, latitude) <= wantedMeters) return zoom
  }
  return gridApiConfig.elevationMaxZoom
}

/**
 * The tile a point is in, and the pixel within that tile.
 * Standard web map tile math: longitude spreads evenly across the tiles,
 * latitude by the Mercator projection.
 * @param {{lat: number, lng: number}} location - The point
 * @param {number} zoom - Tile zoom
 * @returns {{tileX: number, tileY: number, px: number, py: number}} The
 *   tile's column and row, and the pixel's column and row inside it (from its
 *   top left)
 */
export function tilePixel({ lat, lng }, zoom) {
  const tiles = 2 ** zoom
  const x = ((lng + 180) / 360) * tiles
  const radians = (lat * Math.PI) / 180
  const y = ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * tiles
  const tileX = Math.floor(x)
  const tileY = Math.floor(y)
  return {
    tileX,
    tileY,
    px: Math.min(TILE_SIZE - 1, Math.floor((x - tileX) * TILE_SIZE)),
    py: Math.min(TILE_SIZE - 1, Math.floor((y - tileY) * TILE_SIZE))
  }
}

/**
 * The height a terrarium pixel stores, in meters. The height plus 32,768 is
 * split across the color: red is the 256s, green the units, blue the
 * fraction. Below sea level comes out negative.
 * @param {number} red - 0 to 255
 * @param {number} green - 0 to 255
 * @param {number} blue - 0 to 255
 * @returns {number} Meters above sea level
 */
export function decodeTerrarium(red, green, blue) {
  return red * 256 + green + blue / 256 - 32768
}

/**
 * The address of one tile.
 * @param {number} zoom - Tile zoom
 * @param {number} x - Tile column
 * @param {number} y - Tile row
 * @returns {string} The URL
 */
function tileUrl(zoom, x, y) {
  return gridApiConfig.elevationTileUrl.replace('{z}', zoom).replace('{x}', x).replace('{y}', y)
}

/**
 * The latitude of a point a given way down the web map, as a share of its
 * height: 0 at the top (about 85° north), 1 at the bottom. The inverse of the
 * Mercator projection the tiles are drawn in.
 * @param {number} y - Share of the map's height, from the top
 * @returns {number} Latitude, in degrees
 */
function latitudeAt(y) {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI
}

/**
 * The heights in a tile, in meters: one per pixel, row by row from the top
 * left. A see-through pixel holds no height and reads NaN: decoded, it would
 * come out as 32 km below sea level.
 * @param {Uint8ClampedArray} data - The tile's pixels, four bytes each
 * @returns {Float32Array} Heights
 */
function tileHeights(data) {
  const heights = new Float32Array(TILE_SIZE * TILE_SIZE)
  for (let i = 0; i < heights.length; i++) {
    const o = i * 4
    heights[i] = data[o + 3] === 0 ? NaN : decodeTerrarium(data[o], data[o + 1], data[o + 2])
  }
  return heights
}

/**
 * Running totals per cell, for averaging heights and steepness over the
 * pixels in each cell.
 * @param {number} size - How many cells
 * @returns {{heightSum: Float64Array, heightCount: Uint32Array, slopeSum:
 *   Float64Array, slopeCount: Uint32Array}} Zeroed totals
 */
function cellTotals(size) {
  return {
    heightSum: new Float64Array(size),
    heightCount: new Uint32Array(size),
    slopeSum: new Float64Array(size),
    slopeCount: new Uint32Array(size)
  }
}

/**
 * Composable for the elevation download.
 * @returns {{planElevations: Function}}
 */
export function useElevationTiles() {
  /**
   * Works out which tiles a grid needs, before anything is fetched, so the
   * progress bar can know the size of the job up front: every tile that
   * covers some of the grid's rectangle.
   *
   * @param {Object} shape - The grid's rows, cols, south, west, latStep and
   *   lngStep (see cellGrid.js)
   * @param {number} cellMeters - Width of a cell, in meters
   * @returns {{zoom: number, requestCount: number, fetch: Function}} The
   *   plan: how many tiles it takes, and `fetch(onProgress)` to get them
   */
  function planElevations(shape, cellMeters) {
    const { rows, cols, south, west, latStep, lngStep } = shape
    const north = south + rows * latStep
    const east = west + cols * lngStep
    const zoom = zoomForCell(cellMeters, (south + north) / 2)

    const jobs = []
    if (rows > 0 && cols > 0) {
      const topLeft = tilePixel({ lat: north, lng: west }, zoom)
      const bottomRight = tilePixel({ lat: south, lng: east }, zoom)
      for (let y = topLeft.tileY; y <= bottomRight.tileY; y++) {
        for (let x = topLeft.tileX; x <= bottomRight.tileX; x++) jobs.push({ x, y })
      }
    }

    /**
     * Fetches the tiles and reads every cell from the pixels inside it.
     *
     * For each cell, the average height of its pixels, and its roughness:
     * the average steepness between each pixel and the ones to its right and
     * below, where they are in the same cell (rise over run, so 0.1 is a 10%
     * grade). Steepness is measured over the pixel's own ground width, so an
     * even slope reads the same at any zoom. Bumpy ground does not quite:
     * pixels are a sixteenth of a cell, so a small board's small cells are
     * read from finer pixels, which catch smaller bumps, and read a little
     * rougher than the same ground on a big board.
     *
     * A tile that fails leaves its pixels unread rather than failing the run:
     * a cell no pixel reached reads NaN, as "unknown", never as sea level,
     * and the grid store judges how much loss is too much. A tile that
     * arrives at the wrong size counts as failed, as its pixels would not be
     * where the math expects.
     *
     * Heights are rounded to the meter. The tiles store fractions of a meter,
     * which would carry through the cost step into every track price.
     *
     * @param {Function} [onProgress] - Called with (tiles done, tiles in all)
     * @returns {Promise<{elevation: Float32Array, roughness: Float32Array}>}
     *   Per cell, in the grid's order: the average height in meters, and the
     *   average steepness; NaN where no pixel reached the cell
     */
    async function fetchElevations(onProgress = null) {
      const size = rows * cols
      // Every pixel, and apart from them the pixels above sea level, so a
      // cell on the coast can be read from its land alone (see below)
      const all = cellTotals(size)
      const land = cellTotals(size)
      const tiles = 2 ** zoom

      await mapWithConcurrency(
        jobs,
        async (tile) => {
          let pixels
          try {
            pixels = await fetchImagePixels(tileUrl(zoom, tile.x, tile.y), {
              timeoutMs: gridApiConfig.elevationTimeoutMs
            })
            if (pixels.width !== TILE_SIZE || pixels.height !== TILE_SIZE) {
              throw new Error(`Elevation tile came back ${pixels.width}x${pixels.height}`)
            }
          } catch (error) {
            console.error('Error fetching elevation tile:', error)
            return
          }
          const heights = tileHeights(pixels.data)

          // The cell column of each pixel column, and the cell row and ground
          // width of each pixel row; -1 off the grid
          const cellColOf = new Int32Array(TILE_SIZE)
          for (let px = 0; px < TILE_SIZE; px++) {
            const lng = ((tile.x + (px + 0.5) / TILE_SIZE) / tiles) * 360 - 180
            const col = Math.floor((lng - west) / lngStep)
            cellColOf[px] = col >= 0 && col < cols ? col : -1
          }
          const cellRowOf = new Int32Array(TILE_SIZE)
          const pixelMeters = new Float64Array(TILE_SIZE)
          for (let py = 0; py < TILE_SIZE; py++) {
            const lat = latitudeAt((tile.y + (py + 0.5) / TILE_SIZE) / tiles)
            const row = Math.floor((lat - south) / latStep)
            cellRowOf[py] = row >= 0 && row < rows ? row : -1
            pixelMeters[py] = metersPerPixel(zoom, lat)
          }

          for (let py = 0; py < TILE_SIZE; py++) {
            const row = cellRowOf[py]
            if (row === -1) continue
            for (let px = 0; px < TILE_SIZE; px++) {
              const col = cellColOf[px]
              if (col === -1) continue
              const height = heights[py * TILE_SIZE + px]
              if (Number.isNaN(height)) continue
              const cell = row * cols + col
              const isLand = height > 0
              all.heightSum[cell] += height
              all.heightCount[cell]++
              if (isLand) {
                land.heightSum[cell] += height
                land.heightCount[cell]++
              }

              // Steepness to the pixel to the right and the one below, when
              // both are in this same cell and hold a height
              const right =
                px + 1 < TILE_SIZE && cellColOf[px + 1] === col
                  ? heights[py * TILE_SIZE + px + 1]
                  : NaN
              const below =
                py + 1 < TILE_SIZE && cellRowOf[py + 1] === row
                  ? heights[(py + 1) * TILE_SIZE + px]
                  : NaN
              if (!Number.isNaN(right) && !Number.isNaN(below)) {
                const grade = Math.hypot(right - height, below - height) / pixelMeters[py]
                all.slopeSum[cell] += grade
                all.slopeCount[cell]++
                if (isLand && right > 0 && below > 0) {
                  land.slopeSum[cell] += grade
                  land.slopeCount[cell]++
                }
              }
            }
          }
        },
        { concurrency: gridApiConfig.elevationConcurrency, onProgress }
      )

      const elevation = new Float32Array(size)
      const roughness = new Float32Array(size)
      for (let cell = 0; cell < size; cell++) {
        // The tiles carry the sea floor's depth out at sea. A cell that is
        // mostly land is read from its land alone: averaged in, the sea floor
        // would sink a coastal cell's height and turn its shore into a cliff.
        // A cell mostly below sea level — the sea, or land that really is
        // below it, like Death Valley — is read from every pixel.
        const totals =
          land.heightCount[cell] * 2 >= all.heightCount[cell] && land.heightCount[cell] ? land : all
        const count = totals.heightCount[cell]
        elevation[cell] = count ? Math.round(totals.heightSum[cell] / count) : NaN
        // A cell with heights but too few pixels to measure steepness across
        // (a sliver at a tile's edge) counts as level rather than unknown
        roughness[cell] = count
          ? totals.slopeCount[cell]
            ? totals.slopeSum[cell] / totals.slopeCount[cell]
            : 0
          : NaN
      }
      return { elevation, roughness }
    }

    return { zoom, requestCount: jobs.length, fetch: fetchElevations }
  }

  return { planElevations }
}
