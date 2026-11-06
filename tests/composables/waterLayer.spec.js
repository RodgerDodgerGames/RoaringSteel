/**
 * Water Layer Tests
 *
 * The drawing itself is not tested; what is worked out for it is: how thick
 * each river is drawn by its rank, which names show at a zoom, and where
 * each name goes and at what angle.
 */

import { describe, it, expect, afterEach } from 'vitest'
import {
  riverWeight,
  isLabelShown,
  clipFeatures,
  riverLabelPlaces,
  areaLabelPlaces
} from '@/composables/map/waterLayer'
import { waterStyleConfig } from '@/config/map'
import { river, lake, waterFeature } from '../utils/testWater'

describe('riverWeight', () => {
  it('should draw a river by the first class its rank falls in', () => {
    const [major, , minor] = waterStyleConfig.riverWeights

    expect(riverWeight(major.maxRank)).toBe(major.weight)
    expect(riverWeight(12)).toBe(minor.weight)
  })
})

describe('isLabelShown', () => {
  const saved = waterStyleConfig.labelZoomOffset
  afterEach(() => {
    waterStyleConfig.labelZoomOffset = saved
  })

  it('should show a name from the zoom it is given, plus the offset', () => {
    waterStyleConfig.labelZoomOffset = 1

    expect(isLabelShown(7, 7.9)).toBe(false)
    expect(isLabelShown(7, 8)).toBe(true)
  })
})

describe('clipFeatures', () => {
  it('should keep each feature its own properties when others are dropped', () => {
    const outside = river(
      [
        { lat: 50, lng: 50 },
        { lat: 51, lng: 50 }
      ],
      { name: 'Far' }
    )
    const inside = river(
      [
        { lat: 0.5, lng: -1 },
        { lat: 0.5, lng: 2 }
      ],
      { name: 'Near' }
    )

    const clipped = clipFeatures([outside, inside], [0, 0, 1, 1])

    expect(clipped.map(({ properties }) => properties.name)).toEqual(['Near'])
    expect(clipped[0].geometry.coordinates.flat(2).every((n) => n >= 0 && n <= 1)).toBe(true)
  })
})

describe('riverLabelPlaces', () => {
  it('should name a river once, halfway along its longest stretch', () => {
    const short = river(
      [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 1 }
      ],
      { name: 'Green River' }
    )
    const long = river(
      [
        { lat: 2, lng: 0 },
        { lat: 2, lng: 4 }
      ],
      { name: 'Green River' }
    )

    const places = riverLabelPlaces([short, long])

    expect(places).toHaveLength(1)
    expect(places[0]).toMatchObject({ name: 'Green River', lat: 2, lng: 2 })
  })

  it('should write along the river, never upside down', () => {
    const eastward = river(
      [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 2 }
      ],
      { name: 'East' }
    )
    const westward = river(
      [
        { lat: 1, lng: 2 },
        { lat: 1, lng: 0 }
      ],
      { name: 'West' }
    )
    const northward = river(
      [
        { lat: 0, lng: 5 },
        { lat: 2, lng: 5 }
      ],
      { name: 'North' }
    )

    const angles = Object.fromEntries(
      riverLabelPlaces([eastward, westward, northward]).map((p) => [p.name, p.angle])
    )

    expect(angles.East).toBeCloseTo(0, 6)
    expect(angles.West).toBeCloseTo(0, 6)
    expect(Math.abs(angles.North)).toBeCloseTo(90, 6)
  })

  it('should leave an unnamed river unnamed', () => {
    expect(
      riverLabelPlaces([
        river([
          { lat: 0, lng: 0 },
          { lat: 0, lng: 1 }
        ])
      ])
    ).toEqual([])
  })
})

describe('areaLabelPlaces', () => {
  it('should name each named lake and bay at a point inside it', () => {
    const corners = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 2, lng: 2 },
      { lat: 2, lng: 0 }
    ]
    const named = lake(corners, [], { name: 'Lake Granby', label: 7 })
    const unnamed = lake(corners)
    const bay = waterFeature(
      { type: 'Point', coordinates: [5, 6] },
      { name: 'Cape Cod Bay', label: 6 }
    )

    const places = areaLabelPlaces([named, unnamed], [bay])

    expect(places.map(({ name }) => name)).toEqual(['Lake Granby', 'Cape Cod Bay'])
    expect(places[0].lat).toBeGreaterThan(0)
    expect(places[0].lat).toBeLessThan(2)
    expect(places[1]).toMatchObject({ lat: 6, lng: 5, label: 6 })
  })

  it('should name a lake in pieces once, in its largest piece', () => {
    /** A square lake piece of a size, its south-west corner at (0, west) */
    const piece = (west, size) =>
      lake(
        [
          { lat: 0, lng: west },
          { lat: 0, lng: west + size },
          { lat: size, lng: west + size },
          { lat: size, lng: west }
        ],
        [],
        { name: 'Lake Charlevoix', label: 8 }
      )

    const places = areaLabelPlaces([piece(0, 0.1), piece(1, 0.5)], [])

    expect(places).toHaveLength(1)
    expect(places[0].lng).toBeGreaterThan(1)
  })
})
