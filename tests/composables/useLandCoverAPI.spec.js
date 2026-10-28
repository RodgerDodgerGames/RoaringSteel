/**
 * useLandCoverAPI Composable Tests
 *
 * How a pixel's color is read as an NLCD class, how a set of cells is laid
 * out over land cover pictures, and how the pictures become one cost per
 * cell. The image download itself needs a browser, so it is stood in for
 * with pixels made here.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockFetchImagePixels = vi.hoisted(() => vi.fn())
vi.mock('@/composables/setup/imagePixels', () => ({ fetchImagePixels: mockFetchImagePixels }))

import {
  landCoverClass,
  landCoverImages,
  useLandCoverAPI
} from '@/composables/setup/useLandCoverAPI'
import { nlcdCostMap, nlcdLegendColors } from '@/config/nlcd'
import { gridApiConfig } from '@/config/grid'

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

const hex = (color) => [0, 2, 4].map((i) => parseInt(color.slice(i, i + 2), 16))

describe('landCoverClass', () => {
  it('should read every legend color as its own class', () => {
    Object.entries(nlcdLegendColors).forEach(([code, rgb]) => {
      expect(landCoverClass(...rgb, 255)).toBe(Number(code))
    })
  })

  it("should read the server's own, slightly shifted, colors as the right classes", () => {
    // Every color found in a real pull of Massachusetts (2026-10-26), none of
    // them exactly the legend's
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

    const result = await planLandCover(locations, 10000).fetch()

    expect(result).toEqual({ costs: [nlcdCostMap[41], nlcdCostMap[41]], failed: 0 })
  })

  it('should leave a cell with no data null without counting it as a failure', async () => {
    // Beyond the border the NLCD has nothing; that is not a broken download
    mockFetchImagePixels.mockImplementation(answerWith([255, 255, 255]))
    const { planLandCover } = useLandCoverAPI()

    const result = await planLandCover(locations, 10000).fetch()

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
    const plan = planLandCover(apart, 10000)

    const result = await plan.fetch()

    expect(plan.requestCount).toBe(2)
    expect(result).toEqual({ costs: [null, nlcdCostMap[81]], failed: 1 })
  })

  it('should count a picture that comes back at the wrong size as failed', async () => {
    // An error drawn as an image, say: every cell would read the wrong pixel
    mockFetchImagePixels.mockResolvedValue(imageOf(256, 256, hex('68aa63')))
    const { planLandCover } = useLandCoverAPI()

    const result = await planLandCover(locations, 10000).fetch()

    expect(result).toEqual({ costs: [null, null], failed: 2 })
  })

  it('should ask the NLCD server for a picture of the area', async () => {
    mockFetchImagePixels.mockImplementation(answerWith(hex('68aa63')))
    const { planLandCover } = useLandCoverAPI()

    await planLandCover(locations, 10000).fetch()

    const url = new URL(mockFetchImagePixels.mock.calls[0][0])
    expect(url.origin).toBe('https://www.mrlc.gov')
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

    await planLandCover(locations, 10000).fetch(onProgress)

    expect(onProgress.mock.calls).toEqual([[1, 1]])
  })
})
