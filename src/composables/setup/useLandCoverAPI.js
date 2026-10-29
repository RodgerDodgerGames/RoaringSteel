/**
 * Land Cover API Composable (useLandCoverAPI.js)
 *
 * Gets the land cover under each grid cell from the USGS Annual National Land
 * Cover Database (Annual NLCD), and turns it into a building cost.
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
 * Annual NLCD has a map for every year since 1985. A game takes its land
 * cover from the middle year of its data window (see dataWindow.js), or the
 * nearest year the server has.
 *
 * API: https://dmsdata.cr.usgs.gov/geoserver (Annual NLCD land cover, CONUS)
 * Cost mapping: See @/config/nlcd.js for terrain cost values
 *
 * @module composables/setup/useLandCoverAPI
 */

import { nlcdCostMap, nlcdLegendColors } from '@/config/nlcd'
import { gridApiConfig } from '@/config/grid'
import { fetchWithTimeout, mapWithConcurrency } from '@/composables/utils'
import { fetchImagePixels } from '@/composables/setup/imagePixels'
import {
  metersToLatitudeDegrees,
  metersToLongitudeDegrees
} from '@/composables/setup/useMapSupport'

const landCoverApiUrl =
  'https://dmsdata.cr.usgs.gov/geoserver/mrlc_Land-Cover-Native_conus_year_data/wms'
const LAYER = 'Land-Cover-Native_conus_year_data'

/**
 * How far a pixel's color may be from a legend color and still count as that
 * class (straight-line distance in red/green/blue). This server draws the
 * legend's colors exactly, but the NLCD's other server drew them a few shades
 * off, so the match allows for a little drift rather than breaking on it.
 * The closest two legend colors are 26 apart, so 12 never picks the wrong
 * class. Anything further off — the white the server draws where it has no
 * data, outside the US — matches nothing.
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
  // The cells' extent. Looped rather than `Math.min(...lngs)`: spreading
  // hundreds of thousands of cells into one call overflows the stack.
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  locations.forEach(({ lat, lng }) => {
    minLng = Math.min(minLng, lng)
    maxLng = Math.max(maxLng, lng)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  })
  // Half a pixel's margin, so no cell center sits on an image's outer edge
  const west = minLng - lngPerPixel / 2
  const north = maxLat + latPerPixel / 2
  const columnsNeeded = Math.floor((maxLng - west) / lngPerPixel) + 1
  const rowsNeeded = Math.floor((north - minLat) / latPerPixel) + 1

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
 * The years a land cover server's description (its WMS "GetCapabilities"
 * answer) says it has maps for. They are listed as the layer's time
 * dimension: "1985-01-01T00:00:00.000Z,1986-01-01T00:00:00.000Z,...".
 *
 * A server can also describe its times as a range ("1985-01-01/2025-01-01/
 * P1Y"). That is not read: taken as a list, it would look like the single
 * year 1985, and every game would silently get 1985's land cover. Reading
 * nothing fails setup with an error instead.
 *
 * @param {string} capabilities - The GetCapabilities XML
 * @returns {Array<number>} The years, in the order listed; empty if none
 */
export function landCoverYears(capabilities) {
  const match = capabilities.match(/<Dimension[^>]*name="time"[^>]*>([^<]*)<\/Dimension>/)
  if (!match || match[1].includes('/')) return []
  return match[1]
    .split(',')
    .map((time) => parseInt(time.trim().slice(0, 4), 10))
    .filter(Number.isFinite)
}

/**
 * The year in a list that is closest to the one wanted. When two are equally
 * close, the earlier wins: a game should not show land cover from after its
 * own years.
 *
 * @param {Array<number>} years - The years to choose from
 * @param {number} wanted - The year wanted
 * @returns {number|null} The closest year, or null if the list is empty
 */
export function nearestYear(years, wanted) {
  let best = null
  years.forEach((year) => {
    const distance = Math.abs(year - wanted)
    const bestDistance = best == null ? Infinity : Math.abs(best - wanted)
    if (distance < bestDistance || (distance === bestDistance && year < best)) best = year
  })
  return best
}

/**
 * The address of one land cover picture.
 * @param {Object} image - From `landCoverImages`
 * @param {number} year - The year of land cover to draw
 * @returns {string} The URL
 */
function getMapUrl({ west, south, east, north, width, height }, year) {
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
    FORMAT: 'image/png',
    // A bare year is enough; the server matches it to that year's map
    TIME: String(year)
  })
  return `${landCoverApiUrl}?${params.toString()}`
}

/**
 * Composable for the land cover download.
 * @returns {{landCoverYearFor: Function, planLandCover: Function}}
 */
export function useLandCoverAPI() {
  /**
   * The year of land cover a game gets when it asks for a given year: that
   * year if the server has it, otherwise the closest one it does. A year it
   * lacks would come back as an error in place of every picture, so the
   * server's list of years is checked first.
   *
   * @param {number} year - The year wanted (the data window's middle year)
   * @returns {Promise<number>} The year to draw
   * @throws {Error} When the server cannot be reached or lists no years
   */
  async function landCoverYearFor(year) {
    const params = new URLSearchParams({
      SERVICE: 'WMS',
      VERSION: '1.3.0',
      REQUEST: 'GetCapabilities'
    })
    const response = await fetchWithTimeout(`${landCoverApiUrl}?${params.toString()}`, {
      timeoutMs: gridApiConfig.landCoverTimeoutMs
    })
    if (!response.ok) {
      throw new Error(`Land cover server answered ${response.status}`)
    }
    const served = nearestYear(landCoverYears(await response.text()), year)
    if (served == null) {
      throw new Error('Land cover server lists no years')
    }
    return served
  }

  /**
   * Works out which pictures a set of cells needs, before anything is
   * fetched, so the progress bar can know the size of the job up front.
   *
   * @param {Array<{lat: number, lng: number}>} locations - Cell centers
   * @param {number} cellMeters - Width of a cell, in meters
   * @param {number} year - The year of land cover, one the server has (see
   *   `landCoverYearFor`)
   * @returns {{requestCount: number, fetch: Function}} The plan: how many
   *   pictures it takes, and `fetch(onProgress)` to get them
   */
  function planLandCover(locations, cellMeters, year) {
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
            const { width, height, data } = await fetchImagePixels(getMapUrl(image, year), {
              timeoutMs: gridApiConfig.landCoverTimeoutMs
            })
            // A picture at another size than asked for (an error page drawn as
            // an image, say) would put every cell on the wrong pixel
            if (width !== image.width || height !== image.height) {
              throw new Error(`Land cover image came back ${width}x${height}`)
            }
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

  return { landCoverYearFor, planLandCover }
}
