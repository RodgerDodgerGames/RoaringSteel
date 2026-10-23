/**
 * Water Mask Tests
 *
 * The map shades the grid cells the game counts as water, so players can see
 * where a bridge would be needed. Only water inside the region is shaded;
 * outside it the map is grayed out already.
 */

import { describe, it, expect } from 'vitest'
import { waterCellBounds } from '@/composables/map/waterMask'
import { nlcdCostMap } from '@/config/nlcd'

const lake = { id: '0-0', centroid: { lat: 40, lng: -100 }, landCover: nlcdCostMap[11] }
const farm = { id: '0-1', centroid: { lat: 40, lng: -99.9 }, landCover: nlcdCostMap[82] }
const everywhere = () => true

describe('waterCellBounds', () => {
  it('should shade water cells and leave land alone', () => {
    expect(waterCellBounds([lake, farm], everywhere)).toHaveLength(1)
  })

  it("should shade a water cell's whole square, around its center", () => {
    const [[[south, west], [north, east]]] = waterCellBounds([lake], everywhere)

    expect(south).toBeLessThan(40)
    expect(north).toBeGreaterThan(40)
    expect(west).toBeLessThan(-100)
    expect(east).toBeGreaterThan(-100)
    expect(north - 40).toBeCloseTo(40 - south)
  })

  it('should leave out water outside the region', () => {
    expect(waterCellBounds([lake], () => false)).toEqual([])
  })
})
