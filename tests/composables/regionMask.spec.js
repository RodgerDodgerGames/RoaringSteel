/**
 * Region Mask Tests
 *
 * The map is grayed out everywhere but the region being played: one polygon
 * over the whole world with every ring of the region cut out of it.
 */

import { describe, it, expect } from 'vitest'
import { maskRings } from '@/composables/map/regionMask'

const ring = (x) => [
  [x, 0],
  [x + 1, 0],
  [x + 1, 1],
  [x, 0]
]

describe('maskRings', () => {
  it('should cut the region out of a ring round the world', () => {
    const region = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring(0)] } }

    const [world, hole] = maskRings(region)

    expect(world.every(([lat]) => Math.abs(lat) === 90)).toBe(true)
    // Turned from GeoJSON's [lng, lat] to Leaflet's [lat, lng]
    expect(hole).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
      [0, 0]
    ])
  })

  it('should cut out every piece of a region in several pieces', () => {
    const region = {
      type: 'Feature',
      geometry: { type: 'MultiPolygon', coordinates: [[ring(0)], [ring(5)]] }
    }

    expect(maskRings(region)).toHaveLength(3)
  })

  it("should keep a hole in the region, such as a lake, as one of the mask's rings", () => {
    const region = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring(0), ring(0.25)] }
    }

    expect(maskRings(region)).toHaveLength(3)
  })

  it('should read a region given as a collection of features', () => {
    const feature = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring(0)] } }

    expect(maskRings({ type: 'FeatureCollection', features: [feature, feature] })).toHaveLength(3)
  })

  it('should mask nothing when there is no region', () => {
    expect(maskRings(null)).toBeNull()
    expect(maskRings({ type: 'Feature', geometry: null })).toBeNull()
  })
})
