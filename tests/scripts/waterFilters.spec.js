/**
 * Water Filters Tests
 *
 * Tests for which of Natural Earth's rivers and lakes
 * scripts/build-water-data.mjs keeps: rivers by rank, lakes by their whole
 * size, and lake centerlines only where their lake is not kept.
 *
 * The lakes are squares at the equator, where a degree is about 69.1 miles
 * each way, so a square 0.1° on a side is about 47.7 square miles.
 */

import { describe, it, expect } from 'vitest'
import {
  MAX_RIVER_RANK,
  MIN_LAKE_SQUARE_MILES,
  isMajorRiver,
  isBigLake,
  lakeSquareMiles,
  centerlineOutsideLakes
} from '../../scripts/waterFilters.mjs'

/**
 * The ring of a square with its southwest corner at a point.
 * @param {number} west - Its west edge, in degrees
 * @param {number} side - Its side, in degrees
 * @returns {Array<Array<number>>} A closed [lng, lat] ring
 */
function squareRing(west, side) {
  return [
    [west, 0],
    [west + side, 0],
    [west + side, side],
    [west, side],
    [west, 0]
  ]
}

/**
 * The side, in degrees, of a square at the equator of about this many
 * square miles (a degree there is about 69.1 miles).
 * @param {number} squareMiles - The area wanted
 * @returns {number} The side
 */
const sideFor = (squareMiles) => Math.sqrt(squareMiles) / 69.1

/** A Natural Earth-shaped lake made of these polygons (each a list of rings) */
function lake(...polygons) {
  return {
    type: 'Feature',
    properties: { name: 'Test Lake', scalerank: 12 },
    geometry:
      polygons.length === 1
        ? { type: 'Polygon', coordinates: polygons[0] }
        : { type: 'MultiPolygon', coordinates: polygons }
  }
}

/** A Natural Earth-shaped river of a rank */
const river = (scalerank) => ({
  type: 'Feature',
  properties: { name: 'Test River', scalerank },
  geometry: {
    type: 'LineString',
    coordinates: [
      [0, 0],
      [1, 1]
    ]
  }
})

describe('isMajorRiver', () => {
  it('should keep a river ranked up to the cutoff, and drop the next rank', () => {
    expect(isMajorRiver(river(MAX_RIVER_RANK))).toBe(true)
    expect(isMajorRiver(river(MAX_RIVER_RANK + 1))).toBe(false)
  })
})

describe('lakeSquareMiles', () => {
  it('should measure a lake in square miles', () => {
    expect(lakeSquareMiles(lake([squareRing(0, 0.1)]))).toBeCloseTo(47.7, 0)
  })

  it('should leave out an island in the lake', () => {
    const withIsland = lake([squareRing(0, 0.1), squareRing(0.025, 0.05).reverse()])

    // The island is a quarter of the square
    expect(lakeSquareMiles(withIsland)).toBeCloseTo(47.7 * 0.75, 0)
  })

  it('should be 0 for a lake with no outline', () => {
    expect(lakeSquareMiles({ type: 'Feature', properties: {}, geometry: null })).toBe(0)
  })
})

describe('isBigLake', () => {
  it('should keep a lake a little over the cutoff, and drop one a little under', () => {
    expect(isBigLake(lake([squareRing(0, sideFor(MIN_LAKE_SQUARE_MILES * 1.1))]))).toBe(true)
    expect(isBigLake(lake([squareRing(0, sideFor(MIN_LAKE_SQUARE_MILES * 0.9))]))).toBe(false)
  })

  it('should judge a lake in parts by its whole size, not by its parts', () => {
    // Two parts, each 60% of the cutoff: neither is big alone, both together are
    const side = sideFor(MIN_LAKE_SQUARE_MILES * 0.6)
    const parts = lake([squareRing(0, side)], [squareRing(1, side)])

    expect(isBigLake(parts)).toBe(true)
  })

  it('should drop a lake with no outline', () => {
    expect(isBigLake({ type: 'Feature', properties: {}, geometry: null })).toBe(false)
  })
})

describe('centerlineOutsideLakes', () => {
  /** A lake centerline through these [lng, lat] points */
  const centerline = (coordinates) => ({
    type: 'Feature',
    properties: { name: 'Test River', scalerank: 5, featurecla: 'Lake Centerline' },
    geometry: { type: 'LineString', coordinates }
  })
  // A kept lake from 1° to 2° east, 0° to 1° north
  const keptLake = lake([squareRing(1, 1)])

  it('should cut out the stretch over a kept lake and keep the river either side', () => {
    const line = centerline([
      [0, 0.5],
      [0.5, 0.5],
      [1.2, 0.5],
      [1.8, 0.5],
      [2.5, 0.5],
      [3, 0.5]
    ])

    const left = centerlineOutsideLakes(line, [keptLake])

    // The step from 1.2 to 1.8 is over the lake; the steps reaching its
    // shores have their midpoints outside it, so they stay
    expect(left.geometry).toEqual({
      type: 'MultiLineString',
      coordinates: [
        [
          [0, 0.5],
          [0.5, 0.5],
          [1.2, 0.5]
        ],
        [
          [1.8, 0.5],
          [2.5, 0.5],
          [3, 0.5]
        ]
      ]
    })
    expect(left.properties.name).toBe('Test River')
  })

  it('should keep the whole line through a lake that was dropped', () => {
    const line = centerline([
      [0, 0.5],
      [1.5, 0.5],
      [3, 0.5]
    ])

    // The lake it runs through is not among the kept ones
    expect(centerlineOutsideLakes(line, []).geometry.coordinates).toEqual([
      [
        [0, 0.5],
        [1.5, 0.5],
        [3, 0.5]
      ]
    ])
  })

  it('should leave nothing of a line wholly over a kept lake', () => {
    const line = centerline([
      [1.2, 0.5],
      [1.5, 0.5],
      [1.8, 0.5]
    ])

    expect(centerlineOutsideLakes(line, [keptLake])).toBeNull()
  })

  it('should leave nothing of a line with no course', () => {
    expect(centerlineOutsideLakes({ ...centerline([]), geometry: null }, [keptLake])).toBeNull()
  })
})
