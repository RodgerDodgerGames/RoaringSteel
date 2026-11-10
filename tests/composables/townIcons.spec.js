/**
 * Town Icons Tests
 *
 * Each size of town is drawn with its own icon. A town whose size is
 * missing or unknown (a damaged save) must still be drawn, as a small town,
 * rather than with no icon at all. And each town's building must stand on
 * its shape: if a size or offset is changed, a building that floats off its
 * shape, or sinks so low that it hides it, would look wrong on every map.
 * The Build view draws every shape bigger than the Plan view, and a town's
 * name has to hang below whichever shape is drawn.
 */

import { describe, it, expect } from 'vitest'
import {
  TOWN_ICONS,
  townIcon,
  buildingPosition,
  iconClearance,
  shapeSize,
  townNameOffset
} from '@/composables/map/townIcons'
import { BUILD_VIEW, PLAN_VIEW } from '@/composables/map/mapViews'

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

describe('shapeSize', () => {
  it.each(Object.keys(TOWN_ICONS))('should draw a %s town bigger in the Build view', (size) => {
    expect(shapeSize(size, BUILD_VIEW)).toBeGreaterThan(shapeSize(size, PLAN_VIEW))
  })

  it('should draw bigger towns bigger in both views', () => {
    ;[PLAN_VIEW, BUILD_VIEW].forEach((view) => {
      expect(shapeSize('medium', view)).toBeGreaterThan(shapeSize('small', view))
      expect(shapeSize('large', view)).toBeGreaterThan(shapeSize('medium', view))
    })
  })
})

describe('iconClearance', () => {
  it.each(Object.keys(TOWN_ICONS))(
    "should keep a %s town's icons clear of its building in the Build view",
    (size) => {
      // The building's top, in px above the town's center
      const rise = shapeSize(size, BUILD_VIEW) / 2 - buildingPosition(size).top

      expect(iconClearance(size, BUILD_VIEW) / 2).toBeGreaterThanOrEqual(rise)
    }
  )

  it('should keep icons just clear of the shape in the Plan view, which has no buildings', () => {
    expect(iconClearance('large', PLAN_VIEW)).toBe(shapeSize('large', PLAN_VIEW))
  })
})

describe('townNameOffset', () => {
  it.each([PLAN_VIEW, BUILD_VIEW])(
    "should hang a town's name below its shape in the %s view",
    (view) => {
      Object.keys(TOWN_ICONS).forEach((size) => {
        const [x, y] = townNameOffset(size, view)
        expect(x).toBe(0)
        expect(y).toBeGreaterThan(shapeSize(size, view) / 2)
      })
    }
  )

  it('should hang the name lower in the Build view, under its bigger shape', () => {
    expect(townNameOffset('large', BUILD_VIEW)[1]).toBeGreaterThan(
      townNameOffset('large', PLAN_VIEW)[1]
    )
  })
})
