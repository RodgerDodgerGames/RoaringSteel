/**
 * useLandCoverAPI Composable Tests
 *
 * How a pixel's color is read as an NLCD class, how a set of cells is laid
 * out over land cover pictures, and how the pictures become one cost per
 * cell. The image download itself needs a browser, so it is stood in for
 * with pixels made here. Also which year of land cover a game gets, from the
 * years the server lists.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockFetchImagePixels = vi.hoisted(() => vi.fn())
vi.mock('@/composables/setup/imagePixels', () => ({ fetchImagePixels: mockFetchImagePixels }))

// The server's list of years comes from a plain fetch
const mockFetch = vi.hoisted(() => vi.fn())
vi.stubGlobal('fetch', mockFetch)

// Retries without the pause between them
vi.mock('@/composables/utils', async (importOriginal) => {
  const utils = await importOriginal()
  return {
    ...utils,
    fetchWithRetries: (url, options) => utils.fetchWithRetries(url, { ...options, pauseMs: 0 })
  }
})

import {
  cellOfPixel,
  landCoverClass,
  landCoverImages,
  landCoverYears,
  nearestYear,
  useLandCoverAPI
} from '@/composables/setup/useLandCoverAPI'
import { nlcdCostMap, nlcdLegendColors } from '@/config/nlcd'
import { gridApiConfig } from '@/config/grid'
import { isRefusal } from '@/composables/utils'

/** A picture filled with one color */
function imageOf(width, height, [r, g, b], alpha = 255) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let offset = 0; offset < data.length; offset += 4) data.set([r, g, b, alpha], offset)
  return { width, height, data }
}

/** A stand-in server that answers every picture request in one color */
function answerWith(rgb) {
  return async (url) => {
    const params = new URL(url).searchParams
    return imageOf(Number(params.get('WIDTH')), Number(params.get('HEIGHT')), rgb)
  }
}

/**
 * A GetCapabilities answer listing the given years, in the form the Annual
 * NLCD server writes them (checked against its real answer, 2026-10-28)
 */
function capabilitiesWith(years) {
  const times = years.map((year) => `${year}-01-01T00:00:00.000Z`).join(',')
  return (
    '<?xml version="1.0" encoding="UTF-8"?><WMS_Capabilities version="1.3.0"><Capability>' +
    '<Layer><Name>Land-Cover-Native_conus_year_data</Name>' +
    `<Dimension name="time" default="current" units="ISO8601">${times}</Dimension>` +
    '</Layer></Capability></WMS_Capabilities>'
  )
}

/** Every year Annual NLCD has today */
const ANNUAL_NLCD_YEARS = Array.from({ length: 41 }, (_, i) => 1985 + i)

const hex = (color) => [0, 2, 4].map((i) => parseInt(color.slice(i, i + 2), 16))

describe('landCoverClass', () => {
  it('should read every legend color as its own class', () => {
    Object.entries(nlcdLegendColors).forEach(([code, rgb]) => {
      expect(landCoverClass(...rgb, 255)).toBe(Number(code))
    })
  })

  it("should read the server's own, slightly shifted, colors as the right classes", () => {
    // Every color found in a real pull of Massachusetts from the NLCD's other
    // server, mrlc.gov (2026-10-26), none of them exactly the legend's
    const sampled = {
      '476ba0': 11,
      ddc9c9: 21,
      d89382: 22,
      ed0000: 23,
      aa0000: 24,
      b2ada3: 31,
      '68aa63': 41,
      '1c6330': 42,
      b5c98e: 43,
      ccba7c: 52,
      e2e2c1: 71,
      dbd83d: 81,
      aa7028: 82,
      bad8ea: 90,
      '70a3ba': 95
    }
    Object.entries(sampled).forEach(([color, code]) => {
      expect(landCoverClass(...hex(color), 255)).toBe(code)
    })
  })

  it('should read the white drawn where there is no data as no class', () => {
    expect(landCoverClass(255, 255, 255, 255)).toBeNull()
  })

  it('should read a transparent pixel as no class', () => {
    expect(landCoverClass(...nlcdLegendColors[41], 0)).toBeNull()
  })
})

/** A grid of 2 by 2 cells, 0.1 degrees a side, unless told otherwise */
const shapeOf = ({ rows = 2, cols = 2 } = {}) => ({
  rows,
  cols,
  south: 44.9,
  west: -93.3,
  latStep: 0.1,
  lngStep: 0.1
})

describe('landCoverImages', () => {
  const perCell = gridApiConfig.pixelsPerCell
  const size = gridApiConfig.landCoverImageSize

  it('should cover a small grid with one picture, its pixels a whole number to a cell', () => {
    const shape = shapeOf()
    const [image, ...more] = landCoverImages(shape)

    expect(more).toHaveLength(0)
    expect(image.width).toBe(2 * perCell)
    expect(image.height).toBe(2 * perCell)
    expect(image.west).toBeCloseTo(shape.west)
    expect(image.east).toBeCloseTo(shape.west + 2 * shape.lngStep)
    expect(image.north).toBeCloseTo(shape.south + 2 * shape.latStep)
  })

  it('should split a grid too wide for one picture across more', () => {
    const cols = Math.ceil(size / perCell) + 1
    const images = landCoverImages(shapeOf({ cols }))

    expect(images).toHaveLength(2)
    // The second is cut short at the grid's edge
    expect(images[1].width).toBe(cols * perCell - size)
    expect(images[1].left).toBe(size)
  })

  it('should put every pixel in the cell under it', () => {
    const shape = shapeOf({ rows: 3, cols: Math.ceil(size / perCell) + 1 })
    const images = landCoverImages(shape)
    const lngPerPixel = shape.lngStep / perCell
    const latPerPixel = shape.latStep / perCell

    images.forEach((image) => {
      ;[
        [0, 0],
        [image.width - 1, image.height - 1],
        [Math.floor(image.width / 2), 3]
      ].forEach(([px, py]) => {
        const lng = image.west + (px + 0.5) * lngPerPixel
        const lat = image.north - (py + 0.5) * latPerPixel
        const cell = cellOfPixel(image, px, py, shape)
        const row = Math.floor((lat - shape.south) / shape.latStep)
        const col = Math.floor((lng - shape.west) / shape.lngStep)
        expect(cell).toBe(row * shape.cols + col)
      })
    })
  })

  it('should lay out nothing for a grid with no cells', () => {
    expect(landCoverImages(shapeOf({ rows: 0 }))).toEqual([])
  })
})

describe('useLandCoverAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const FOREST = hex('68aa63')
  const GRASS = hex('dfdfc2')
  const WATER = hex('466b9f')

  /**
   * A stand-in server that colors each picture's pixels by where they are in
   * the whole grid, so a test can paint parts of cells
   */
  function paint(colorAt) {
    return async (url) => {
      const params = new URL(url).searchParams
      const width = Number(params.get('WIDTH'))
      const height = Number(params.get('HEIGHT'))
      const data = new Uint8ClampedArray(width * height * 4)
      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++)
          data.set([...colorAt(px, py), 255], (py * width + px) * 4)
      }
      return { width, height, data }
    }
  }

  it('should cost a cell of one class at that class', async () => {
    mockFetchImagePixels.mockImplementation(answerWith(FOREST))
    const { planLandCover } = useLandCoverAPI()

    const result = await planLandCover(shapeOf(), 2023).fetch()

    expect(result).toEqual({ costs: Array(4).fill(nlcdCostMap[41]), failed: 0 })
  })

  it('should cost a cell of mixed ground at the average of its pixels', async () => {
    // The west half of every cell forest, the east half grassland
    const half = gridApiConfig.pixelsPerCell / 2
    mockFetchImagePixels.mockImplementation(
      paint((px) => (px % gridApiConfig.pixelsPerCell < half ? FOREST : GRASS))
    )
    const { planLandCover } = useLandCoverAPI()

    const { costs } = await planLandCover(shapeOf(), 2023).fetch()

    expect(costs).toEqual(Array(4).fill(Math.round((nlcdCostMap[41] + nlcdCostMap[71]) / 2)))
  })

  it('should average open water into a cell like any other ground', async () => {
    // The west column of cells three-quarters water, the east a quarter
    const perCell = gridApiConfig.pixelsPerCell
    mockFetchImagePixels.mockImplementation(
      paint((px) => {
        const along = px % perCell
        const isWestCell = px < perCell
        return along < (isWestCell ? 0.75 : 0.25) * perCell ? WATER : GRASS
      })
    )
    const { planLandCover } = useLandCoverAPI()

    const { costs } = await planLandCover(shapeOf({ rows: 1 }), 2023).fetch()

    // The water track bridges comes from the game's water data, not the
    // land cover: here open water is just wet ground, part of the average
    const mix = (water) => Math.round(water * nlcdCostMap[11] + (1 - water) * nlcdCostMap[71])
    expect(costs).toEqual([mix(0.75), mix(0.25)])
  })

  it('should leave a cell with no data null without counting it as a failure', async () => {
    // Beyond the border the NLCD has nothing; that is not a broken download
    mockFetchImagePixels.mockImplementation(answerWith([255, 255, 255]))
    const { planLandCover } = useLandCoverAPI()

    const result = await planLandCover(shapeOf(), 2023).fetch()

    expect(result).toEqual({ costs: [null, null, null, null], failed: 0 })
  })

  it('should count the cells of a failed picture and still finish the rest', async () => {
    // Wide enough to need two pictures
    const cols = Math.ceil(gridApiConfig.landCoverImageSize / gridApiConfig.pixelsPerCell) + 1
    mockFetchImagePixels
      .mockRejectedValueOnce(new Error('Request timed out after 30000ms'))
      .mockImplementationOnce(answerWith(hex('dbd83d')))
    const { planLandCover } = useLandCoverAPI()
    const plan = planLandCover(shapeOf({ rows: 1, cols }), 2023)

    const { costs, failed } = await plan.fetch()

    expect(plan.requestCount).toBe(2)
    expect(failed).toBe(cols - 1)
    expect(costs.at(-1)).toBe(nlcdCostMap[81])
    expect(costs.slice(0, -1).every((cost) => cost === null)).toBe(true)
  })

  it('should count a picture that comes back at the wrong size as failed', async () => {
    // An error drawn as an image, say: every cell would read the wrong pixels
    mockFetchImagePixels.mockResolvedValue(imageOf(256, 256, FOREST))
    const { planLandCover } = useLandCoverAPI()

    const result = await planLandCover(shapeOf(), 2023).fetch()

    expect(result).toEqual({ costs: [null, null, null, null], failed: 4 })
  })

  it("should ask the Annual NLCD server for a picture of the area in the game's year", async () => {
    mockFetchImagePixels.mockImplementation(answerWith(FOREST))
    const shape = shapeOf()
    const { planLandCover } = useLandCoverAPI()

    await planLandCover(shape, 2023).fetch()

    const url = new URL(mockFetchImagePixels.mock.calls[0][0])
    expect(url.origin).toBe('https://dmsdata.cr.usgs.gov')
    expect(url.searchParams.get('LAYERS')).toBe('Land-Cover-Native_conus_year_data')
    expect(url.searchParams.get('TIME')).toBe('2023')
    expect(url.searchParams.get('REQUEST')).toBe('GetMap')
    expect(url.searchParams.get('CRS')).toBe('CRS:84')
    expect(url.searchParams.get('FORMAT')).toBe('image/png')
    const [west, south, east, north] = url.searchParams.get('BBOX').split(',').map(Number)
    expect(west).toBeCloseTo(shape.west)
    expect(south).toBeCloseTo(shape.south)
    expect(east).toBeCloseTo(shape.west + 2 * shape.lngStep)
    expect(north).toBeCloseTo(shape.south + 2 * shape.latStep)
  })

  it('should report progress once per picture', async () => {
    mockFetchImagePixels.mockImplementation(answerWith(FOREST))
    const onProgress = vi.fn()
    const { planLandCover } = useLandCoverAPI()

    await planLandCover(shapeOf(), 2023).fetch(onProgress)

    expect(onProgress.mock.calls).toEqual([[1, 1]])
  })
})

describe('landCoverYears', () => {
  it("should list the years in the server's time dimension", () => {
    expect(landCoverYears(capabilitiesWith(ANNUAL_NLCD_YEARS))).toEqual(ANNUAL_NLCD_YEARS)
  })

  it('should list nothing, rather than one wrong year, for times given as a range', () => {
    const ranged = capabilitiesWith([]).replace(
      '></Dimension>',
      '>1985-01-01T00:00:00.000Z/2025-01-01T00:00:00.000Z/P1Y</Dimension>'
    )
    expect(landCoverYears(ranged)).toEqual([])
  })

  it('should list nothing when the server describes no time dimension', () => {
    expect(landCoverYears('<WMS_Capabilities><Layer></Layer></WMS_Capabilities>')).toEqual([])
  })
})

describe('nearestYear', () => {
  it('should take the year asked for when it is there', () => {
    expect(nearestYear(ANNUAL_NLCD_YEARS, 2023)).toBe(2023)
  })

  it('should take the closest year when the one asked for is not there', () => {
    expect(nearestYear(ANNUAL_NLCD_YEARS, 2027)).toBe(2025)
    expect(nearestYear(ANNUAL_NLCD_YEARS, 1970)).toBe(1985)
  })

  it('should take the earlier of two equally close years', () => {
    expect(nearestYear([2019, 2021], 2020)).toBe(2019)
    expect(nearestYear([2021, 2019], 2020)).toBe(2019)
  })

  it('should be null for no years', () => {
    expect(nearestYear([], 2023)).toBeNull()
  })
})

describe('landCoverYearFor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should ask the server for its description, and pick from the years it lists', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => capabilitiesWith([2019, 2020, 2021])
    })
    const { landCoverYearFor } = useLandCoverAPI()

    await expect(landCoverYearFor(2023)).resolves.toBe(2021)
    const url = new URL(mockFetch.mock.calls[0][0])
    expect(url.origin).toBe('https://dmsdata.cr.usgs.gov')
    expect(url.searchParams.get('REQUEST')).toBe('GetCapabilities')
  })

  it('should fail when the server answers with an error', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, text: async () => '' })
    const { landCoverYearFor } = useLandCoverAPI()

    await expect(landCoverYearFor(2023)).rejects.toThrow('503')
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('should try again when the server fails, and use the answer that works', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => '' })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => capabilitiesWith([2021, 2023])
      })
    const { landCoverYearFor } = useLandCoverAPI()

    await expect(landCoverYearFor(2023)).resolves.toBe(2023)
  })

  it('should fail as a refusal when the server turns the request down', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => '' })
    const { landCoverYearFor } = useLandCoverAPI()

    const failure = await landCoverYearFor(2023).catch((error) => error)

    expect(isRefusal(failure)).toBe(true)
  })

  it('should fail when the server lists no years', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<WMS_Capabilities></WMS_Capabilities>'
    })
    const { landCoverYearFor } = useLandCoverAPI()

    await expect(landCoverYearFor(2023)).rejects.toThrow('no years')
  })
})
