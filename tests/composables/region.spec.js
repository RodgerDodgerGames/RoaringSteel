/**
 * Region Tests
 *
 * The region being played is read the same way by the map's mask and the
 * build rules: its Polygon and MultiPolygon features, whether it is given as
 * one feature or a collection, with anything else left out.
 */

import { describe, it, expect } from 'vitest'
import { reactive } from 'vue'
import { regionPolygons, regionTest } from '@/composables/map/region'

const polygon = (x) => ({
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [x, 0],
        [x + 2, 0],
        [x + 2, 2],
        [x, 2],
        [x, 0]
      ]
    ]
  }
})

describe('regionPolygons', () => {
  it('should read a single feature', () => {
    expect(regionPolygons(polygon(0))).toHaveLength(1)
  })

  it('should read every feature of a collection', () => {
    const region = { type: 'FeatureCollection', features: [polygon(0), polygon(5)] }

    expect(regionPolygons(region)).toHaveLength(2)
  })

  it('should leave out features that are not polygons', () => {
    const region = {
      type: 'FeatureCollection',
      features: [
        polygon(0),
        { type: 'Feature', geometry: null },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] } }
      ]
    }

    expect(regionPolygons(region)).toHaveLength(1)
  })

  it('should give nothing for no region', () => {
    expect(regionPolygons(null)).toEqual([])
  })
})

describe('regionTest', () => {
  it('should tell points inside the region from points outside', () => {
    const isInRegion = regionTest(polygon(0))

    expect(isInRegion({ lat: 1, lng: 1 })).toBe(true)
    expect(isInRegion({ lat: 1, lng: 3 })).toBe(false)
  })

  it('should count every piece of a region in several pieces', () => {
    const isInRegion = regionTest({ type: 'FeatureCollection', features: [polygon(0), polygon(5)] })

    expect(isInRegion({ lat: 1, lng: 6 })).toBe(true)
    expect(isInRegion({ lat: 1, lng: 4 })).toBe(false)
  })

  it('should read a region held in the store, as a reactive object', () => {
    expect(regionTest(reactive(polygon(0)))({ lat: 1, lng: 1 })).toBe(true)
  })

  it('should count everywhere as inside when there is no region', () => {
    expect(regionTest(null)({ lat: 50, lng: 50 })).toBe(true)
  })

  it('should not be thrown by a feature that is not a polygon', () => {
    const region = {
      type: 'FeatureCollection',
      features: [polygon(0), { type: 'Feature', geometry: null }]
    }

    expect(regionTest(region)({ lat: 1, lng: 1 })).toBe(true)
  })
})
