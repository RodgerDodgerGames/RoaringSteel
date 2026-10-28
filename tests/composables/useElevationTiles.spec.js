/**
 * useElevationTiles Composable Tests
 *
 * The tile math, the terrarium decoding, and how a set of cells is turned
 * into tile downloads and back into one height per cell. The image download
 * itself needs a browser, so it is stood in for with pixels made here.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockFetchImagePixels = vi.hoisted(() => vi.fn())
vi.mock('@/composables/setup/imagePixels', () => ({ fetchImagePixels: mockFetchImagePixels }))

import {
  decodeTerrarium,
  metersPerPixel,
  tilePixel,
  useElevationTiles,
  zoomForCell
} from '@/composables/setup/useElevationTiles'

/** The color a terrarium tile stores a height as (the inverse of decoding) */
function encodeTerrarium(meters) {
  const value = meters + 32768
  return [Math.floor(value / 256), Math.floor(value % 256), Math.floor((value % 1) * 256)]
}

/**
 * A 256-pixel tile whose every pixel stores a height worked out from where
 * it is, so a test can tell which pixel a cell read.
 */
function tileOf(heightAt) {
  const data = new Uint8ClampedArray(256 * 256 * 4)
  for (let py = 0; py < 256; py++) {
    for (let px = 0; px < 256; px++) {
      const [r, g, b] = encodeTerrarium(heightAt(px, py))
      data.set([r, g, b, 255], (py * 256 + px) * 4)
    }
  }
  return { width: 256, height: 256, data }
}

describe('decodeTerrarium', () => {
  it('should decode the worked example from the format docs', () => {
    expect(decodeTerrarium(137, 219, 68)).toBe(2523.265625)
  })

  it('should read sea level as zero', () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0)
  })

  it('should read the sea floor as below zero', () => {
    expect(decodeTerrarium(...encodeTerrarium(-75))).toBe(-75)
  })
})

describe('tile math', () => {
  it('should give the published ground size of a pixel', () => {
    // From the Terrain Tiles docs: 156543.0 m at zoom 0 on the equator,
    // 864.8 m at zoom 7 at 45 degrees
    expect(metersPerPixel(0, 0)).toBeCloseTo(156543.0, 0)
    expect(metersPerPixel(7, 45)).toBeCloseTo(864.8, 0)
  })

  it('should put the map center at the middle of the single zoom-0 tile', () => {
    expect(tilePixel({ lat: 0, lng: 0 }, 0)).toEqual({ tileX: 0, tileY: 0, px: 128, py: 128 })
  })

  it('should put the map center at the corner of four tiles at zoom 1', () => {
    expect(tilePixel({ lat: 0, lng: 0 }, 1)).toEqual({ tileX: 1, tileY: 1, px: 0, py: 0 })
  })

  it('should count tiles from the west and from the north', () => {
    const northWest = tilePixel({ lat: 60, lng: -170 }, 3)
    const southEast = tilePixel({ lat: -60, lng: 170 }, 3)

    expect(northWest.tileX).toBeLessThan(southEast.tileX)
    expect(northWest.tileY).toBeLessThan(southEast.tileY)
  })

  it('should pick the coarsest zoom that puts 16 pixels across a cell', () => {
    // A 10 km cell wants 625 m pixels. In Texas zoom 7 is 1048 m, too coarse;
    // zoom 8 is 524 m.
    expect(zoomForCell(10000, 31)).toBe(8)
    // A 2 km cell in Massachusetts wants 125 m: zoom 10 is 114 m
    expect(zoomForCell(2000, 42)).toBe(10)
  })

  it('should not ask for a zoom finer than the tiles are published at', () => {
    expect(zoomForCell(1, 0)).toBe(15)
  })
})

describe('useElevationTiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch each tile once, however many cells read from it', () => {
    const { planElevations } = useElevationTiles()
    // Two cells a few km apart share a tile; one across the country does not
    const plan = planElevations(
      [
        { lat: 44.98, lng: -93.27 },
        { lat: 44.99, lng: -93.2 },
        { lat: 29.76, lng: -95.37 }
      ],
      10000
    )

    expect(plan.requestCount).toBe(2)
  })

  it('should read each cell the height of the pixel under its center', async () => {
    // Kept under the 32,767 m a tile can store
    mockFetchImagePixels.mockResolvedValue(tileOf((px, py) => px * 100 + py))
    const locations = [
      { lat: 44.98, lng: -93.27 },
      { lat: 44.9, lng: -93.1 }
    ]
    const { planElevations } = useElevationTiles()
    const plan = planElevations(locations, 10000)

    const elevations = await plan.fetch()

    const expected = locations.map((location) => {
      const { px, py } = tilePixel(location, plan.zoom)
      return px * 100 + py
    })
    expect(elevations).toEqual(expected)
  })

  it('should ask for the tile at the right address', async () => {
    mockFetchImagePixels.mockResolvedValue(tileOf(() => 0))
    const location = { lat: 44.98, lng: -93.27 }
    const { planElevations } = useElevationTiles()
    const plan = planElevations([location], 10000)

    await plan.fetch()

    const { tileX, tileY } = tilePixel(location, plan.zoom)
    expect(mockFetchImagePixels.mock.calls[0][0]).toBe(
      `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${plan.zoom}/${tileX}/${tileY}.png`
    )
  })

  it('should leave the cells of a failed tile unknown and still finish the rest', async () => {
    // null reads as "unknown", never as a sea-level 0, so the grid store can
    // tell lost data from real low ground
    mockFetchImagePixels
      .mockRejectedValueOnce(new Error('Request timed out after 20000ms'))
      .mockResolvedValueOnce(tileOf(() => 250))
    const { planElevations } = useElevationTiles()
    const plan = planElevations(
      [
        { lat: 44.98, lng: -93.27 },
        { lat: 29.76, lng: -95.37 }
      ],
      10000
    )

    const elevations = await plan.fetch()

    expect(elevations).toEqual([null, 250])
  })

  it('should report progress once per tile', async () => {
    mockFetchImagePixels.mockResolvedValue(tileOf(() => 100))
    const onProgress = vi.fn()
    const { planElevations } = useElevationTiles()
    const plan = planElevations(
      [
        { lat: 44.98, lng: -93.27 },
        { lat: 29.76, lng: -95.37 }
      ],
      10000
    )

    await plan.fetch(onProgress)

    expect(onProgress.mock.calls).toEqual([
      [1, 2],
      [2, 2]
    ])
  })

  it('should plan nothing for no cells', async () => {
    const { planElevations } = useElevationTiles()
    const plan = planElevations([], 10000)

    expect(plan.requestCount).toBe(0)
    await expect(plan.fetch()).resolves.toEqual([])
  })
})
