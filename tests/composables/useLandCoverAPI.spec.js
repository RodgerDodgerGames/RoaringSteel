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

describe('landCoverImages', () => {
  const lngPerPixel = 0.01
  const latPerPixel = 0.01

  it('should cover a small set of cells with one picture', () => {
    const images = landCoverImages(
      [
        { lat: 44, lng: -95 },
        { lat: 44.5, lng: -94 }
      ],
      lngPerPixel,
      latPerPixel
    )

    expect(images).toHaveLength(1)
  })

  it('should split cells too wide for one picture across more', () => {
    const size = gridApiConfig.landCoverImageSize
    const images = landCoverImages(
      [
        { lat: 44, lng: -95 },
        { lat: 44, lng: -95 + (size + 10) * lngPerPixel }
      ],
      lngPerPixel,
      latPerPixel
    )

    expect(images).toHaveLength(2)
    // The second is cut short to what its cells need
    expect(images[1].width).toBeLessThan(size)
  })

  it("should put each cell's pixel over the cell's center", () => {
    // Whatever the layout, the pixel a cell reads must be the one its center
    // falls in: the picture's west or north edge plus the pixel's place, to
    // within half a pixel. 40 cells spread wide enough to need several
    // pictures.
    const locations = []
    for (let i = 0; i < 40; i++) {
      locations.push({ lat: 40 + i * 0.37, lng: -100 + i * 0.53 })
    }
    const images = landCoverImages(locations, lngPerPixel, latPerPixel)

    expect(images.length).toBeGreaterThan(1)
    images.forEach((image) => {
      expect(image.east - image.west).toBeCloseTo(image.width * lngPerPixel)
      expect(image.north - image.south).toBeCloseTo(image.height * latPerPixel)
      image.cells.forEach(({ index, px, py }) => {
        expect(px).toBeLessThan(image.width)
        expect(py).toBeLessThan(image.height)
        const pixelLng = image.west + (px + 0.5) * lngPerPixel
        const pixelLat = image.north - (py + 0.5) * latPerPixel
        expect(Math.abs(pixelLng - locations[index].lng)).toBeLessThanOrEqual(lngPerPixel / 2)
        expect(Math.abs(pixelLat - locations[index].lat)).toBeLessThanOrEqual(latPerPixel / 2)
      })
    })
    // Every cell is in exactly one picture
    const covered = images.flatMap((image) => image.cells.map(({ index }) => index))
    expect(covered.sort((a, b) => a - b)).toEqual(locations.map((_, index) => index))
  })

  it('should lay out nothing for no cells', () => {
    expect(landCoverImages([], lngPerPixel, latPerPixel)).toEqual([])
  })
})

describe('useLandCoverAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const locations = [
    { lat: 44.98, lng: -93.27 },
    { lat: 44.9, lng: -93.1 }
  ]

  it('should turn the class under each cell into its cost', async () => {
    mockFetchImagePixels.mockImplementation(answerWith(hex('68aa63')))
    const { planLandCover } = useLandCoverAPI()

    const result = await planLandCover(locations, 10000, 2023).fetch()

    expect(result).toEqual({ costs: [nlcdCostMap[41], nlcdCostMap[41]], failed: 0 })
  })

  it('should leave a cell with no data null without counting it as a failure', async () => {
    // Beyond the border the NLCD has nothing; that is not a broken download
    mockFetchImagePixels.mockImplementation(answerWith([255, 255, 255]))
    const { planLandCover } = useLandCoverAPI()

    const result = await planLandCover(locations, 10000, 2023).fetch()

    expect(result).toEqual({ costs: [null, null], failed: 0 })
  })

  it('should count the cells of a failed picture and still finish the rest', async () => {
    // Far enough apart, at 10 km cells, to need two pictures
    const apart = [
      { lat: 44, lng: -100 },
      { lat: 44, lng: -60 }
    ]
    mockFetchImagePixels
      .mockRejectedValueOnce(new Error('Request timed out after 30000ms'))
      .mockImplementationOnce(answerWith(hex('dbd83d')))
    const { planLandCover } = useLandCoverAPI()
    const plan = planLandCover(apart, 10000, 2023)

    const result = await plan.fetch()

    expect(plan.requestCount).toBe(2)
    expect(result).toEqual({ costs: [null, nlcdCostMap[81]], failed: 1 })
  })

  it('should count a picture that comes back at the wrong size as failed', async () => {
    // An error drawn as an image, say: every cell would read the wrong pixel
    mockFetchImagePixels.mockResolvedValue(imageOf(256, 256, hex('68aa63')))
    const { planLandCover } = useLandCoverAPI()

    const result = await planLandCover(locations, 10000, 2023).fetch()

    expect(result).toEqual({ costs: [null, null], failed: 2 })
  })

  it("should ask the Annual NLCD server for a picture of the area in the game's year", async () => {
    mockFetchImagePixels.mockImplementation(answerWith(hex('68aa63')))
    const { planLandCover } = useLandCoverAPI()

    await planLandCover(locations, 10000, 2023).fetch()

    const url = new URL(mockFetchImagePixels.mock.calls[0][0])
    expect(url.origin).toBe('https://dmsdata.cr.usgs.gov')
    expect(url.searchParams.get('LAYERS')).toBe('Land-Cover-Native_conus_year_data')
    expect(url.searchParams.get('TIME')).toBe('2023')
    expect(url.searchParams.get('REQUEST')).toBe('GetMap')
    expect(url.searchParams.get('CRS')).toBe('CRS:84')
    expect(url.searchParams.get('FORMAT')).toBe('image/png')
    const [west, south, east, north] = url.searchParams.get('BBOX').split(',').map(Number)
    locations.forEach(({ lat, lng }) => {
      expect(lng).toBeGreaterThan(west)
      expect(lng).toBeLessThan(east)
      expect(lat).toBeGreaterThan(south)
      expect(lat).toBeLessThan(north)
    })
  })

  it('should report progress once per picture', async () => {
    mockFetchImagePixels.mockImplementation(answerWith(hex('68aa63')))
    const onProgress = vi.fn()
    const { planLandCover } = useLandCoverAPI()

    await planLandCover(locations, 10000, 2023).fetch(onProgress)

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
