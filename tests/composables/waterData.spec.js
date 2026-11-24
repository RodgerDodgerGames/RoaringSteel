/**
 * Water Data Tests
 *
 * The water file covers the whole country; a board uses only the water near
 * it, found by each feature's bounding box.
 */

import { describe, it, expect } from 'vitest'
import { prepareWaterData, featuresIn, riversFor } from '@/composables/map/waterData'
import { makeTestGrid, CELL } from '../utils/testGrid'
import { waterData, river } from '../utils/testWater'

describe('featuresIn', () => {
  it('should find the features that reach into an area, and only those', () => {
    const data = prepareWaterData(
      waterData({
        rivers: [
          river(
            [
              { lat: 0, lng: 0 },
              { lat: 5, lng: 5 }
            ],
            { name: 'Across' }
          ),
          river(
            [
              { lat: 10, lng: 10 },
              { lat: 11, lng: 11 }
            ],
            { name: 'Away' }
          )
        ]
      })
    )

    const found = featuresIn(data, 'rivers', [4, 4, 6, 6])

    expect(found.map(({ properties }) => properties.name)).toEqual(['Across'])
  })

  it('should find nothing without water data', () => {
    expect(featuresIn(null, 'lakes', [0, 0, 1, 1])).toEqual([])
  })
})

describe('riversFor', () => {
  const grid = makeTestGrid({ rows: 2, cols: 2 })
  const across = river([
    { lat: CELL, lng: -1 },
    { lat: CELL, lng: 1 }
  ])

  it('should index the rivers on a grid once, and again for other water data', () => {
    const data = prepareWaterData(waterData({ rivers: [across] }))

    const first = riversFor(grid, data)

    expect(riversFor(grid, data)).toBe(first)
    expect(first.pieces).toHaveLength(4)
    expect(riversFor(grid, prepareWaterData(waterData()))).not.toBe(first)
  })

  it('should have no rivers without water data', () => {
    expect(riversFor(grid, null)).toBeNull()
  })
})
