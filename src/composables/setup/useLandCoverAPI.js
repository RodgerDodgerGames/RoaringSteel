/**
 * Land Cover API Composable (useLandCoverAPI.js)
 *
 * Gets the land cover under each grid cell from the USGS National Land Cover
 * Database (NLCD), and turns it into a building cost.
 *
 * The NLCD server draws its map as pictures (a WMS "GetMap"), and those
 * pictures are what this reads: each class has its own color, so the pixel
 * under a cell's center says what the cell is. One 1024-pixel picture covers
 * thousands of cells, so a state takes a handful of requests where asking
 * about one point at a time took one request per cell.
 *
 * The pictures are drawn at the same detail as the elevation tiles, about
 * `pixelsPerCell` pixels across a cell.
 *
 * API: https://www.mrlc.gov/geoserver (NLCD 2021 Land Cover)
 * Cost mapping: See @/config/nlcd.js for terrain cost values
 *
 * @module composables/setup/useLandCoverAPI
 */

import { nlcdCostMap, nlcdLegendColors } from '@/config/nlcd'
import { gridApiConfig } from '@/config/grid'
import { mapWithConcurrency } from '@/composables/utils'
import { fetchImagePixels } from '@/composables/setup/imagePixels'
import {
  metersToLatitudeDegrees,
  metersToLongitudeDegrees
} from '@/composables/setup/useMapSupport'

const landCoverApiUrl = 'https://www.mrlc.gov/geoserver/mrlc_display/NLCD_2021_Land_Cover_L48/ows'
const LAYER = 'mrlc_display:NLCD_2021_Land_Cover_L48'

/**
 * How far a pixel's color may be from a legend color and still count as that
 * class (straight-line distance in red/green/blue). The server's colors sit
 * within about 7 of the legend's; the closest two legend colors are 26
 * apart, so 12 takes in every real pixel without ever picking the wrong class.
 * Anything further off — the white the server draws where it has no data,
 * outside the US — matches nothing.
 */
const MAX_COLOR_DISTANCE = 12

/** The legend as [class, red, green, blue], for the nearest-color search */
const LEGEND = Object.entries(nlcdLegendColors).map(([code, rgb]) => [Number(code), ...rgb])

/**
 * The NLCD class a pixel's color stands for.
 * @param {number} red - 0 to 255
 * @param {number} green - 0 to 255
 * @param {number} blue - 0 to 255
 * @param {number} alpha - 0 to 255; a transparent pixel has no data
 * @returns {number|null} The class (11, 21, ...), or null for no data
 */
export function landCoverClass(red, green, blue, alpha) {
  if (alpha === 0) return null
  let match = null
  let nearest = MAX_COLOR_DISTANCE ** 2
  LEGEND.forEach(([code, r, g, b]) => {
    const distance = (red - r) ** 2 + (green - g) ** 2 + (blue - b) ** 2
    if (distance <= nearest) {
      nearest = distance
      match = code
    }
  })
  return match
}

/**
 * Lays out the pictures that cover a set of cells: a grid of square images,
 * `landCoverImageSize` pixels a side at the given detail, starting at the
 * cells' north-west corner. The last image in each row and column is cut
 * short to what the cells need.
 *
 * Each image's edges are worked out from its pixel count, so every pixel is
 * exactly `lngPerPixel` wide and `latPerPixel` tall and a cell's pixel is
 * found by arithmetic.
 *
 * @param {Array<{lat: number, lng: number}>} locations - Cell centers
 * @param {number} lngPerPixel - Degrees of longitude per pixel
 * @param {number} latPerPixel - Degrees of latitude per pixel
 * @returns {Array<{west: number, north: number, east: number, south: number,
 *   width: number, height: number, cells: Array}>} The images, each with the
 *   cells it covers as {index, px, py}
 */
export function landCoverImages(locations, lngPerPixel, latPerPixel) {
  if (locations.length === 0) return []
  const size = gridApiConfig.landCoverImageSize
  const lngs = locations.map(({ lng }) => lng)
  const lats = locations.map(({ lat }) => lat)
  // Half a pixel's margin, so no cell center sits on an image's outer edge
  const west = Math.min(...lngs) - lngPerPixel / 2
  const north = Math.max(...lats) + latPerPixel / 2
  const columnsNeeded = Math.floor((Math.max(...lngs) - west) / lngPerPixel) + 1
  const rowsNeeded = Math.floor((north - Math.min(...lats)) / latPerPixel) + 1

  const images = new Map()
  locations.forEach((location, index) => {
    const column = Math.floor((location.lng - west) / lngPerPixel)
    const row = Math.floor((north - location.lat) / latPerPixel)
    const imageColumn = Math.floor(column / size)
    const imageRow = Math.floor(row / size)
    const key = `${imageColumn},${imageRow}`
    if (!images.has(key)) {
      const width = Math.min(size, columnsNeeded - imageColumn * size)
      const height = Math.min(size, rowsNeeded - imageRow * size)
      const imageWest = west + imageColumn * size * lngPerPixel
      const imageNorth = north - imageRow * size * latPerPixel
      images.set(key, {
        west: imageWest,
        north: imageNorth,
        east: imageWest + width * lngPerPixel,
        south: imageNorth - height * latPerPixel,
        width,
        height,
        cells: []
      })
    }
    images.get(key).cells.push({ index, px: column % size, py: row % size })
  })
  return [...images.values()]
}

/**
 * The address of one land cover picture.
 * @param {Object} image - From `landCoverImages`
 * @returns {string} The URL
 */
function getMapUrl({ west, south, east, north, width, height }) {
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: LAYER,
    STYLES: '',
    // Plain longitude/latitude, so pixels are evenly spaced in degrees
    CRS: 'CRS:84',
    BBOX: `${west},${south},${east},${north}`,
    WIDTH: width,
    HEIGHT: height,
    FORMAT: 'image/png'
  })
  return `${landCoverApiUrl}?${params.toString()}`
}

/**
 * Composable for the land cover download.
 * @returns {{planLandCover: Function}}
 */
export function useLandCoverAPI() {
  /**
   * Works out which pictures a set of cells needs, before anything is
   * fetched, so the progress bar can know the size of the job up front.
   *
   * @param {Array<{lat: number, lng: number}>} locations - Cell centers
   * @param {number} cellMeters - Width of a cell, in meters
   * @returns {{requestCount: number, fetch: Function}} The plan: how many
   *   pictures it takes, and `fetch(onProgress)` to get them
   */
  function planLandCover(locations, cellMeters) {
    const meanLat = locations.reduce((sum, { lat }) => sum + lat, 0) / (locations.length || 1)
    const lngPerPixel = metersToLongitudeDegrees(cellMeters, meanLat) / gridApiConfig.pixelsPerCell
    const latPerPixel = metersToLatitudeDegrees(cellMeters) / gridApiConfig.pixelsPerCell
    const images = landCoverImages(locations, lngPerPixel, latPerPixel)

    /**
     * Fetches the pictures and reads each cell's land cover cost.
     *
     * Two kinds of missing are kept apart. A cell the NLCD has no data for
     * (outside the US) is simply null. A cell whose picture failed to load
     * is null too, but is also counted in `failed`: the grid store fails
     * setup when too many pictures failed, and must not mistake a region that
     * reaches over the border for one whose downloads broke.
     *
     * @param {Function} [onProgress] - Called with (pictures done, in all)
     * @returns {Promise<{costs: Array<number|null>, failed: number}>} One
     *   cost per location, in order, and how many cells' pictures failed
     */
    async function fetchLandCover(onProgress = null) {
      const costs = new Array(locations.length).fill(null)
      let failed = 0
      await mapWithConcurrency(
        images,
        async (image) => {
          try {
            const { width, data } = await fetchImagePixels(getMapUrl(image), {
              timeoutMs: gridApiConfig.landCoverTimeoutMs
            })
            image.cells.forEach(({ index, px, py }) => {
              const offset = (py * width + px) * 4
              const code = landCoverClass(
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3]
              )
              costs[index] = nlcdCostMap[code] ?? null
            })
          } catch (error) {
            console.error('Error fetching land cover image:', error)
            failed += image.cells.length
          }
        },
        { concurrency: gridApiConfig.landCoverConcurrency, onProgress }
      )
      return { costs, failed }
    }

    return { requestCount: images.length, fetch: fetchLandCover }
  }

  return { planLandCover }
}
