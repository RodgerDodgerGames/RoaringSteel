/**
 * useElevationTiles Composable Tests
 *
 * The tile math, the terrarium decoding, and how a grid is turned into tile
 * downloads and back into each cell's average height and roughness, read
 * from every pixel inside it. The image download itself needs a browser, so
 * it is stood in for with pixels made here.
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

/**
 * A grid of 10 km cells, 2 by 2, inside one zoom-8 tile over Minnesota
 * (tile 61, 92), unless told otherwise
 */
const shapeOf = ({ rows = 2, cols = 2, west = -93.5 } = {}) => ({
  rows,
  cols,
  south: 44.5,
  west,
  latStep: 0.09,
  lngStep: 0.127
})

/** The center of a cell of a shape */
const centerOf = (shape, row, col) => ({
  lat: shape.south + (row + 0.5) * shape.latStep,
  lng: shape.west + (col + 0.5) * shape.lngStep
})

describe('useElevationTiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should plan every tile that covers the grid, each once', () => {
    const { planElevations } = useElevationTiles()

    expect(planElevations(shapeOf(), 10000).requestCount).toBe(1)
    // Twelve cells east, 1.5 degrees: across into the next tile
    expect(planElevations(shapeOf({ cols: 12 }), 10000).requestCount).toBe(2)
  })

  it('should give each cell the average height of the pixels inside it', async () => {
    const shape = shapeOf()
    const { planElevations } = useElevationTiles()
    const plan = planElevations(shape, 10000)
    // Ground stepping up from 100 m to 300 m part way across the west column
    // of cells, and staying at 300 m across the east column
    const step = tilePixel(centerOf(shape, 0, 0), plan.zoom).px
    mockFetchImagePixels.mockResolvedValue(tileOf((px) => (px < step ? 100 : 300)))

    const { elevation } = await plan.fetch()

    expect(elevation[0]).toBeGreaterThan(100)
    expect(elevation[0]).toBeLessThan(300)
    expect(elevation[1]).toBe(300)
  })

  it('should measure a cell as level when its pixels are all one height', async () => {
    mockFetchImagePixels.mockResolvedValue(tileOf(() => 250))
    const { planElevations } = useElevationTiles()

    const { roughness } = await planElevations(shapeOf(), 10000).fetch()

    expect([...roughness]).toEqual([0, 0, 0, 0])
  })

  it('should measure roughness as the grade between neighboring pixels', async () => {
    const shape = shapeOf()
    const { planElevations } = useElevationTiles()
    const plan = planElevations(shape, 10000)
    // Rising 10 m with each pixel to the east
    mockFetchImagePixels.mockResolvedValue(tileOf((px) => px * 10))

    const { roughness } = await plan.fetch()

    const grade = 10 / metersPerPixel(plan.zoom, centerOf(shape, 0, 0).lat)
    roughness.forEach((value) => expect(value).toBeCloseTo(grade, 3))
  })

  it('should leave the sea floor out of a coastal cell that is mostly land', async () => {
    const shape = shapeOf()
    const { planElevations } = useElevationTiles()
    const plan = planElevations(shape, 10000)
    // Sea 40 m deep along the west edge of the west column of cells, land at
    // 5 m everywhere else: the west cells are mostly land
    const shore = tilePixel({ lat: 44.6, lng: shape.west }, plan.zoom).px + 3
    mockFetchImagePixels.mockResolvedValue(tileOf((px) => (px < shore ? -40 : 5)))

    const { elevation, roughness } = await plan.fetch()

    expect([...elevation]).toEqual([5, 5, 5, 5])
    expect([...roughness]).toEqual([0, 0, 0, 0])
  })

  it('should read a cell that is mostly below sea level from all of it', async () => {
    // The sea, or land below sea level: its height stays below zero
    mockFetchImagePixels.mockResolvedValue(tileOf((px) => (px % 4 === 0 ? 5 : -40)))
    const { planElevations } = useElevationTiles()

    const { elevation } = await planElevations(shapeOf(), 10000).fetch()

    elevation.forEach((height) => expect(height).toBeLessThan(0))
  })

  it('should ask for the tile at the right address', async () => {
    mockFetchImagePixels.mockResolvedValue(tileOf(() => 0))
    const shape = shapeOf()
    const { planElevations } = useElevationTiles()
    const plan = planElevations(shape, 10000)

    await plan.fetch()

    const { tileX, tileY } = tilePixel(centerOf(shape, 0, 0), plan.zoom)
    expect(mockFetchImagePixels.mock.calls[0][0]).toBe(
      `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${plan.zoom}/${tileX}/${tileY}.png`
    )
  })

  it('should leave the cells of a failed tile unknown and still finish the rest', async () => {
    // NaN reads as "unknown", never as a sea-level 0, so the grid store can
    // tell lost data from real low ground
    const shape = shapeOf({ rows: 1, cols: 2, west: -92.96 })
    const { planElevations } = useElevationTiles()
    const plan = planElevations(shape, 10000)
    // The grid straddles tiles 61 and 62: the west tile fails
    mockFetchImagePixels.mockImplementation(async (url) => {
      if (url.includes('/61/')) throw new Error('Request timed out after 20000ms')
      return tileOf(() => 250)
    })

    const { elevation } = await plan.fetch()

    expect(Number.isNaN(elevation[0])).toBe(true)
    expect(elevation[1]).toBe(250)
  })

  it('should round heights to the meter', async () => {
    // Fractions of a meter would carry into every cell cost and track price
    mockFetchImagePixels.mockResolvedValue(tileOf(() => 123.6))
    const { planElevations } = useElevationTiles()

    const { elevation } = await planElevations(shapeOf(), 10000).fetch()

    expect([...elevation]).toEqual([124, 124, 124, 124])
  })

  it('should treat a tile of the wrong size as failed', async () => {
    // Its pixels would not be where the tile math puts the cells
    mockFetchImagePixels.mockResolvedValue({
      width: 512,
      height: 512,
      data: new Uint8ClampedArray(512 * 512 * 4).fill(128)
    })
    const { planElevations } = useElevationTiles()

    const { elevation } = await planElevations(shapeOf(), 10000).fetch()

    expect([...elevation].every(Number.isNaN)).toBe(true)
  })

  it('should read a see-through pixel as unknown, not 32 km below sea level', async () => {
    const tile = tileOf(() => 100)
    for (let offset = 3; offset < tile.data.length; offset += 4) tile.data[offset] = 0
    mockFetchImagePixels.mockResolvedValue(tile)
    const { planElevations } = useElevationTiles()

    const { elevation } = await planElevations(shapeOf(), 10000).fetch()

    expect([...elevation].every(Number.isNaN)).toBe(true)
  })

  it('should report progress once per tile', async () => {
    mockFetchImagePixels.mockResolvedValue(tileOf(() => 100))
    const onProgress = vi.fn()
    const { planElevations } = useElevationTiles()
    const plan = planElevations(shapeOf({ cols: 12 }), 10000)

    await plan.fetch(onProgress)

    expect(onProgress.mock.calls).toEqual([
      [1, 2],
      [2, 2]
    ])
  })

  it('should plan nothing for a grid with no cells', async () => {
    const { planElevations } = useElevationTiles()
    const plan = planElevations(shapeOf({ rows: 0 }), 10000)

    expect(plan.requestCount).toBe(0)
    const { elevation } = await plan.fetch()
    expect(elevation).toHaveLength(0)
  })
})
