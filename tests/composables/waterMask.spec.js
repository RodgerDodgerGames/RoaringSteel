/**
 * Water Mask Tests
 *
 * The map shades every grid cell the game counts as water, as a square
 * around the cell's center, so players can see where a bridge is needed.
 */

import { describe, it, expect } from 'vitest'
import { waterSquares } from '@/composables/map/waterMask'
import { nlcdCostMap } from '@/config/nlcd'

const lake = { id: '0-0', centroid: { lat: 40, lng: -100 }, landCover: nlcdCostMap[11] }
const farm = { id: '0-1', centroid: { lat: 40, lng: -99.9 }, landCover: nlcdCostMap[82] }

describe('waterSquares', () => {
  it('should shade water cells and leave land alone', () => {
    expect(waterSquares([lake, farm])).toHaveLength(1)
  })

  it("should shade a water cell's whole square, around its center", () => {
    const [[corners]] = waterSquares([lake])
    const lats = corners.map(([lat]) => lat)
    const lngs = corners.map(([, lng]) => lng)

    expect(Math.min(...lats)).toBeLessThan(40)
    expect(Math.max(...lats)).toBeGreaterThan(40)
    expect(Math.min(...lngs)).toBeLessThan(-100)
    expect(Math.max(...lngs)).toBeGreaterThan(-100)
  })
})
