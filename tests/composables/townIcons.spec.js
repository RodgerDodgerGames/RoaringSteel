/**
 * Town Icons Tests
 *
 * Each size of town is drawn with its own icon. A town whose size is
 * missing or unknown (a damaged save) must still be drawn, as a small town,
 * rather than with no icon at all. And each town's building must stand on
 * its shape: if a size or offset is changed, a building that floats off its
 * shape, or sinks so low that it hides it, would look wrong on every map.
 */

import { describe, it, expect } from 'vitest'
import { TOWN_ICONS, townIcon, buildingPosition } from '@/composables/map/townIcons'

describe('townIcon', () => {
  it('should draw a town of unknown size as a small town', () => {
    expect(townIcon('enormous')).toBe(TOWN_ICONS.small)
    expect(townIcon(undefined)).toBe(TOWN_ICONS.small)
  })
})

describe('buildingPosition', () => {
  it.each(Object.keys(TOWN_ICONS))(
    "should stand a %s town's building on the lower half of its shape, rising above it",
    (size) => {
      const { size: shapeSize, buildingSize } = TOWN_ICONS[size]
      const { left, top } = buildingPosition(size)
      const base = top + buildingSize

      // Centered across the shape
      expect(left * 2 + buildingSize).toBeCloseTo(shapeSize)
      // Its base inside the shape, below the middle, so the shape shows round it
      expect(base).toBeGreaterThan(shapeSize / 2)
      expect(base).toBeLessThan(shapeSize)
      // And it rises above the top of the shape
      expect(top).toBeLessThan(0)
    }
  )
})
