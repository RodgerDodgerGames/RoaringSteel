/**
 * Land Cover API Composable (useLandCoverAPI.js)
 *
 * Gets the land cover under each grid cell from the USGS Annual National Land
 * Cover Database (Annual NLCD), and turns it into a building cost.
 *
 * The NLCD server draws its map as pictures (a WMS "GetMap"), and those
 * pictures are what this reads: each class has its own color, so a pixel's
 * color says what the ground is there. One 1024-pixel picture covers
 * thousands of cells, so a state takes a handful of requests where asking
 * about one point at a time took one request per cell.
 *
 * The pictures are drawn at exactly `pixelsPerCell` pixels across a cell,
 * and a cell is read from every pixel inside it: its cost is the average of
 * its land pixels' costs, so a cell that is half forest and half grassland
 * costs halfway between. The server does not average when it draws a
 * coarse picture — each pixel is the class at one spot — so a cell's couple
 * of hundred pixels are a sample of its ground, not one point standing in
 * for all of it.
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
import { fetchWithRetries, mapWithConcurrency, RequestError } from '@/composables/utils'
import { fetchImagePixels } from '@/composables/setup/imagePixels'
import { WATER_LAND_COVER } from '@/composables/map/water'

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
 * Lays out the pictures that cover a grid: a grid of square images,
 * `landCoverImageSize` pixels a side, over the grid's rectangle from its
 * north-west corner, at exactly `pixelsPerCell` pixels to a cell each way.
 * The last image in each row and column is cut short at the grid's edge.
 *
 * With a whole number of pixels to a cell, the cell a pixel falls in is found
 * by arithmetic: see `cellOfPixel`.
 *
 * @param {Object} shape - The grid's rows, cols, south, west, latStep and
 *   lngStep (see cellGrid.js)
 * @returns {Array<{west: number, north: number, east: number, south: number,
 *   width: number, height: number, left: number, top: number}>} The images,
 *   each with its edges and size, and `left` and `top`: where its first
 *   pixel sits among the pixels of the whole grid
 */
export function landCoverImages({ rows, cols, south, west, latStep, lngStep }) {
  const size = gridApiConfig.landCoverImageSize
  const perCell = gridApiConfig.pixelsPerCell
  const lngPerPixel = lngStep / perCell
  const latPerPixel = latStep / perCell
  const north = south + rows * latStep
  const totalWidth = cols * perCell
  const totalHeight = rows * perCell

  const images = []
  for (let top = 0; top < totalHeight; top += size) {
    for (let left = 0; left < totalWidth; left += size) {
      const width = Math.min(size, totalWidth - left)
      const height = Math.min(size, totalHeight - top)
      const imageWest = west + left * lngPerPixel
      const imageNorth = north - top * latPerPixel
      images.push({
        west: imageWest,
        north: imageNorth,
        east: imageWest + width * lngPerPixel,
        south: imageNorth - height * latPerPixel,
        width,
        height,
        left,
        top
      })
    }
  }
  return images
}

/**
 * The cell a pixel of a land cover image falls in.
 * @param {Object} image - From `landCoverImages`
 * @param {number} px - The pixel's column in the image
 * @param {number} py - The pixel's row in the image, from the top
 * @param {Object} shape - The grid's rows and cols
 * @returns {number} The cell's index (see cellGrid.js)
 */
export function cellOfPixel(image, px, py, { rows, cols }) {
  const perCell = gridApiConfig.pixelsPerCell
  const col = Math.floor((image.left + px) / perCell)
  // Pictures run from the north; the grid's rows from the south
  const row = rows - 1 - Math.floor((image.top + py) / perCell)
  return row * cols + col
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
   * server's list of years is checked first. Every new game needs it, so it
   * is tried a few times when the server fails (see `fetchWithRetries`).
   *
   * @param {number} year - The year wanted (the data window's middle year)
   * @returns {Promise<number>} The year to draw
   * @throws {RequestError} When the server answers with a failure
   * @throws {Error} When the server cannot be reached or lists no years
   */
  async function landCoverYearFor(year) {
    const params = new URLSearchParams({
      SERVICE: 'WMS',
      VERSION: '1.3.0',
      REQUEST: 'GetCapabilities'
    })
    const response = await fetchWithRetries(`${landCoverApiUrl}?${params.toString()}`, {
      timeoutMs: gridApiConfig.landCoverYearsTimeoutMs
    })
    if (!response.ok) {
      throw new RequestError(`Land cover server answered ${response.status}`, response.status)
    }
    const served = nearestYear(landCoverYears(await response.text()), year)
    if (served == null) {
      throw new Error('Land cover server lists no years')
    }
    return served
  }

  /**
   * Works out which pictures a grid needs, before anything is fetched, so the
   * progress bar can know the size of the job up front.
   *
   * @param {Object} shape - The grid's rows, cols, south, west, latStep and
   *   lngStep (see cellGrid.js)
   * @param {number} year - The year of land cover, one the server has (see
   *   `landCoverYearFor`)
   * @returns {{requestCount: number, fetch: Function}} The plan: how many
   *   pictures it takes, and `fetch(onProgress)` to get them
   */
  function planLandCover(shape, year) {
    const images = landCoverImages(shape)

    /**
     * Fetches the pictures and works out each cell's land cover cost from
     * every pixel in it.
     *
     * Water (open water, and permanent ice, which is crossed the same way) is
     * counted apart from land: a cell that is at least half water is a water
     * cell, costed as water (see water.js); any other cell costs the average
     * of its land pixels, its water left out. Pixels with no data — beyond the
     * US border, or out at sea — are not counted at all.
     *
     * Two kinds of missing are kept apart. A cell no pixel has data for is
     * simply null. A cell whose picture failed to load is null too, but is
     * also counted in `failed`: the grid store fails setup when too many
     * pictures failed, and must not mistake a region that reaches over the
     * border for one whose downloads broke.
     *
     * @param {Function} [onProgress] - Called with (pictures done, in all)
     * @returns {Promise<{costs: Array<number|null>, failed: number}>} One
     *   cost per cell, in the grid's order, and how many cells' pictures
     *   failed and left them with nothing
     */
    async function fetchLandCover(onProgress = null) {
      const size = shape.rows * shape.cols
      const landSum = new Float64Array(size)
      const landCount = new Uint32Array(size)
      const waterCount = new Uint32Array(size)
      const lost = new Uint8Array(size)
      // The class of each color seen, so each distinct color (the pictures
      // have about sixteen) is matched against the legend once
      const classOfColor = new Map()

      await mapWithConcurrency(
        images,
        async (image) => {
          let pixels
          try {
            pixels = await fetchImagePixels(getMapUrl(image, year), {
              timeoutMs: gridApiConfig.landCoverTimeoutMs
            })
            // A picture at another size than asked for (an error page drawn as
            // an image, say) would put every cell on the wrong pixels
            if (pixels.width !== image.width || pixels.height !== image.height) {
              throw new Error(`Land cover image came back ${pixels.width}x${pixels.height}`)
            }
          } catch (error) {
            console.error('Error fetching land cover image:', error)
            for (let py = 0; py < image.height; py++) {
              for (let px = 0; px < image.width; px++) lost[cellOfPixel(image, px, py, shape)] = 1
            }
            return
          }

          const { data, width } = pixels
          for (let py = 0; py < image.height; py++) {
            for (let px = 0; px < width; px++) {
              const o = (py * width + px) * 4
              const color =
                ((data[o] << 24) | (data[o + 1] << 16) | (data[o + 2] << 8) | data[o + 3]) >>> 0
              let code = classOfColor.get(color)
              if (code === undefined) {
                code = landCoverClass(data[o], data[o + 1], data[o + 2], data[o + 3])
                classOfColor.set(color, code)
              }
              const cost = nlcdCostMap[code]
              if (cost === undefined) continue
              const cell = cellOfPixel(image, px, py, shape)
              if (cost === WATER_LAND_COVER) {
                waterCount[cell]++
              } else {
                landSum[cell] += cost
                landCount[cell]++
              }
            }
          }
        },
        { concurrency: gridApiConfig.landCoverConcurrency, onProgress }
      )

      const costs = new Array(size).fill(null)
      let failed = 0
      for (let cell = 0; cell < size; cell++) {
        const counted = landCount[cell] + waterCount[cell]
        if (counted === 0) {
          if (lost[cell]) failed++
          continue
        }
        costs[cell] =
          waterCount[cell] * 2 >= counted
            ? WATER_LAND_COVER
            : Math.round(landSum[cell] / landCount[cell])
      }
      return { costs, failed }
    }

    return { requestCount: images.length, fetch: fetchLandCover }
  }

  return { landCoverYearFor, planLandCover }
}
