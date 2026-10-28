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
 * Each cell reads the one pixel under its center. The tiles are fetched at
 * the zoom where a cell is about `pixelsPerCell` pixels across, so that pixel
 * is a local average a few hundred meters wide, not a pinpoint.
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
 * `pixelsPerCell` pixels across a cell. Finer would only mean more tiles to
 * download for the one pixel each cell reads.
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
 * Composable for the elevation download.
 * @returns {{planElevations: Function}}
 */
export function useElevationTiles() {
  /**
   * Works out which tiles a set of cells needs, before anything is fetched,
   * so the progress bar can know the size of the job up front.
   *
   * @param {Array<{lat: number, lng: number}>} locations - Cell centers
   * @param {number} cellMeters - Width of a cell, in meters
   * @returns {{zoom: number, requestCount: number, fetch: Function}} The
   *   plan: how many tiles it takes, and `fetch(onProgress)` to get them,
   *   which resolves to one elevation per location — in meters, or null
   *   where that location's tile could not be had
   */
  function planElevations(locations, cellMeters) {
    const meanLat = locations.reduce((sum, { lat }) => sum + lat, 0) / (locations.length || 1)
    const zoom = zoomForCell(cellMeters, meanLat)

    // Each tile once, with the cells that read from it
    const tiles = new Map()
    locations.forEach((location, index) => {
      const { tileX, tileY, px, py } = tilePixel(location, zoom)
      const key = `${tileX}/${tileY}`
      if (!tiles.has(key)) tiles.set(key, { x: tileX, y: tileY, cells: [] })
      tiles.get(key).cells.push({ index, px, py })
    })
    const jobs = [...tiles.values()]

    /**
     * Fetches the tiles and reads each cell's height.
     *
     * A tile that fails leaves its cells null rather than failing the run:
     * null reads as "unknown", never as sea level, and the grid store judges
     * how much loss is too much. A tile that arrives at the wrong size counts
     * as failed (its pixels would not be where the math expects), and so
     * does a see-through pixel, which holds no height: decoded, it would read
     * as 32 km below sea level.
     *
     * Heights are rounded to the meter. The tiles store fractions of a meter,
     * which would carry through the cost step into every track price.
     *
     * @param {Function} [onProgress] - Called with (tiles done, tiles in all)
     * @returns {Promise<Array<number|null>>} One per location, in order
     */
    async function fetchElevations(onProgress = null) {
      const elevations = new Array(locations.length).fill(null)
      await mapWithConcurrency(
        jobs,
        async (tile) => {
          try {
            const { width, height, data } = await fetchImagePixels(tileUrl(zoom, tile.x, tile.y), {
              timeoutMs: gridApiConfig.elevationTimeoutMs
            })
            if (width !== TILE_SIZE || height !== TILE_SIZE) {
              throw new Error(`Elevation tile came back ${width}x${height}`)
            }
            tile.cells.forEach(({ index, px, py }) => {
              const offset = (py * width + px) * 4
              if (data[offset + 3] === 0) return
              elevations[index] = Math.round(
                decodeTerrarium(data[offset], data[offset + 1], data[offset + 2])
              )
            })
          } catch (error) {
            console.error('Error fetching elevation tile:', error)
          }
        },
        { concurrency: gridApiConfig.elevationConcurrency, onProgress }
      )
      return elevations
    }

    return { zoom, requestCount: jobs.length, fetch: fetchElevations }
  }

  return { planElevations }
}
