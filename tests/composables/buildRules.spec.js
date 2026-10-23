/**
 * Build Rules Tests
 *
 * Track stays inside the region being played, except into the grid cell a
 * town sits in, which may reach over the region's edge. A line breaking the
 * rule anywhere along it is refused, not just at its corners.
 */

import { describe, it, expect } from 'vitest'
import { regionContains, townCellIds, lineBlock, blockMessage } from '@/composables/map/buildRules'

/** A 2° square region, from (0, 0) to (2, 2) */
const square = {
  type: 'Feature',
  properties: { NAME: 'Squareland' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
        [0, 0]
      ]
    ]
  }
}

/** Two 1° squares a degree apart, like a state in two pieces */
const islands = {
  type: 'Feature',
  properties: { NAME: 'Islands' },
  geometry: {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0]
        ]
      ],
      [
        [
          [2, 0],
          [3, 0],
          [3, 1],
          [2, 1],
          [2, 0]
        ]
      ]
    ]
  }
}

/** One cell per degree, centered on the half degrees, from 0 to 4 east */
const grid = [0, 1, 2, 3].map((i) => ({ id: `0-${i}`, centroid: { lat: 0.5, lng: i + 0.5 } }))

describe('regionContains', () => {
  it('should tell points inside the region from points outside', () => {
    expect(regionContains(square, { lat: 1, lng: 1 })).toBe(true)
    expect(regionContains(square, { lat: 1, lng: 3 })).toBe(false)
  })

  it('should count every piece of a region in several pieces', () => {
    expect(regionContains(islands, { lat: 0.5, lng: 2.5 })).toBe(true)
    expect(regionContains(islands, { lat: 0.5, lng: 1.5 })).toBe(false)
  })

  it('should read a region given as a collection of features', () => {
    const collection = { type: 'FeatureCollection', features: [square] }

    expect(regionContains(collection, { lat: 1, lng: 1 })).toBe(true)
    expect(regionContains(collection, { lat: 1, lng: 3 })).toBe(false)
  })

  it('should count everywhere as inside when there is no region', () => {
    expect(regionContains(null, { lat: 50, lng: 50 })).toBe(true)
  })
})

describe('townCellIds', () => {
  it('should give the cell each town sits in', () => {
    const towns = [
      { lat: 0.4, lon: 0.6 },
      { lat: 0.5, lon: 3.2 }
    ]

    expect(townCellIds(towns, grid)).toEqual(new Set(['0-0', '0-3']))
  })
})

describe('lineBlock', () => {
  const rules = { grid, region: islands, townCells: new Set() }

  it('should let a line inside the region be built', () => {
    const line = [
      { lat: 0.5, lng: 0.2 },
      { lat: 0.5, lng: 0.8 }
    ]

    expect(lineBlock(line, rules)).toBeNull()
  })

  it('should refuse a line that crosses outside between two corners inside', () => {
    // Both ends are in the region; the middle crosses the gap between pieces
    const line = [
      { lat: 0.5, lng: 0.5 },
      { lat: 0.5, lng: 2.5 }
    ]

    const block = lineBlock(line, rules)

    expect(block.reason).toBe('outside')
    expect(regionContains(islands, block.point)).toBe(false)
  })

  it('should let a line reach a town whose cell is outside the region', () => {
    // A town just over the edge, in the cell between the two pieces
    const line = [
      { lat: 0.5, lng: 0.5 },
      { lat: 0.5, lng: 1.4 }
    ]

    expect(lineBlock(line, { ...rules, townCells: new Set(['0-1']) })).toBeNull()
  })

  it('should still refuse a line that goes on past the town cell', () => {
    const line = [
      { lat: 0.5, lng: 0.5 },
      { lat: 0.5, lng: 3.5 },
      { lat: 3.5, lng: 3.5 }
    ]

    expect(lineBlock(line, { ...rules, townCells: new Set(['0-1']) })).not.toBeNull()
  })
})

describe('blockMessage', () => {
  it('should name the region a line was kept inside', () => {
    expect(blockMessage({ reason: 'outside' }, 'Maryland')).toBe("Track can't go outside Maryland.")
  })
})
