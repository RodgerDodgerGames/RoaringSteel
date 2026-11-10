/**
 * Town Name Layout Tests
 *
 * In the Plan view every town's name has to be readable: never drawn over
 * another name, another town's dot or a commodity icon, and never cut off at
 * the map's edge. A name that cannot be placed that way is hidden, and it is
 * always the smaller town that gives way. If any of this broke, names would
 * pile up over each other again (or cities would lose their names to
 * villages) and nothing else would notice.
 */

import { describe, it, expect } from 'vitest'
import {
  byPriority,
  layoutTownNames,
  sideClearance,
  spotOffsets
} from '@/composables/map/townNames'
import { iconRingOffsets, iconRingRadius } from '@/composables/map/commodityIcons'

/** A big empty map, so the edges only matter where a test means them to */
const AREA = { width: 2000, height: 2000 }

/**
 * A town for the layout: a 16px dot with a 60 × 18 name and no commodity
 * icons, in the middle of the map, unless told otherwise.
 * @param {Object} fields - Fields to set
 * @returns {Object} The town
 */
function town(fields) {
  return {
    id: 'town',
    x: 1000,
    y: 1000,
    size: 'small',
    population: 1000,
    dotSize: 16,
    icons: [],
    nameWidth: 60,
    nameHeight: 18,
    ...fields
  }
}

/** The offset of each spot for the default town, by spot name */
const SPOT = (() => {
  const [below, right, left, belowRight, belowLeft] = spotOffsets(town({}))
  return { below, right, left, belowRight, belowLeft }
})()

/*
 * Where to put a blocking dot, 10px wide, to block some of the default
 * town's spots and leave the rest clear. A below-right name overlaps the
 * below spot's right half, and a below-left one its left half.
 */
/** Blocks below, below-right and below-left */
const ON_BELOW = [0, 19]
/** Blocks below and below-right, not below-left */
const ON_BELOW_RIGHT = [15, 19]
/** Blocks below and below-left, not below-right */
const ON_BELOW_LEFT = [-15, 19]
/** Blocks right */
const ON_RIGHT = [40, 0]
/** Blocks left */
const ON_LEFT = [-40, 0]

/**
 * Big towns with 10px dots at offsets from the default town, whose own
 * names are too long for the map, so hidden and out of the way.
 * @param {Array<Array<number>>} offsets - [x, y] of each blocker
 * @returns {Array<Object>} The blocking towns
 */
function blockers(offsets) {
  return offsets.map(([x, y], i) =>
    town({ id: `b${i}`, x: 1000 + x, y: 1000 + y, dotSize: 10, nameWidth: 5000, size: 'large' })
  )
}

describe('spotOffsets', () => {
  it('should hang the name just below the dot, centered, as before', () => {
    // 8px half dot, 2px gap, 9px half name
    expect(SPOT.below).toEqual({ x: 0, y: 19 })
  })

  it('should put a name beside the dot level with it, just clear of it', () => {
    // 8px half dot, 2px gap, 30px half name
    expect(SPOT.right).toEqual({ x: 40, y: 0 })
    expect(SPOT.left).toEqual({ x: -40, y: 0 })
  })

  it('should start a below-right name under the dot center, and end a below-left one there', () => {
    expect(SPOT.belowRight).toEqual({ x: 30, y: 19 })
    expect(SPOT.belowLeft).toEqual({ x: -30, y: 19 })
  })
})

describe('sideClearance', () => {
  it('should clear just the dot when no icon is level with the name', () => {
    // One icon sits straight above the dot
    const oneIcon = town({ icons: iconRingOffsets(1, iconRingRadius(16, 1)) })
    expect(sideClearance(oneIcon, 1)).toBe(8)
    expect(sideClearance(oneIcon, -1)).toBe(8)
  })

  it('should clear the icons due left and right of the dot when a town has two or more', () => {
    // Three icons: left, top and right of the dot, 21px out, each 18px wide
    const icons = iconRingOffsets(3, iconRingRadius(16, 3))
    expect(icons[0]).toEqual({ x: -19, y: 0 })
    expect(sideClearance(town({ icons }), 1)).toBe(19 + 9)
    expect(sideClearance(town({ icons }), -1)).toBe(19 + 9)
  })
})

describe('byPriority', () => {
  it('should place large towns, then medium, then small, whatever their population', () => {
    const towns = [
      town({ id: 's', size: 'small', population: 900000 }),
      town({ id: 'l', size: 'large', population: 1000 }),
      town({ id: 'm', size: 'medium', population: 500000 })
    ]
    expect(byPriority(towns).map((t) => t.id)).toEqual(['l', 'm', 's'])
  })

  it('should place the bigger population first within a size', () => {
    const towns = [town({ id: 'a', population: 10 }), town({ id: 'b', population: 20 })]
    expect(byPriority(towns).map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('should rank a town of unknown size with the small towns', () => {
    const towns = [
      town({ id: 'odd', size: 'enormous', population: 50 }),
      town({ id: 'small', size: 'small', population: 100 }),
      town({ id: 'medium', size: 'medium', population: 1 })
    ]
    expect(byPriority(towns).map((t) => t.id)).toEqual(['medium', 'small', 'odd'])
  })
})

describe('layoutTownNames', () => {
  it('should hang a lone town name below its dot', () => {
    expect(layoutTownNames([town({})], AREA).get('town')).toEqual(SPOT.below)
  })

  it('should move the smaller of two neighbors whose names would cross', () => {
    // 40px apart: the names hanging below (60px wide) would overlap
    const big = town({ id: 'big', size: 'medium' })
    const small = town({ id: 'small', x: 1040 })
    const placed = layoutTownNames([small, big], AREA)
    expect(placed.get('big')).toEqual(SPOT.below)
    expect(placed.get('small')).not.toEqual(SPOT.below)
    expect(placed.get('small')).not.toBeNull()
  })

  it('should try the spots in order: below, right, left, below-right, below-left', () => {
    // Each case blocks every spot before the expected one, and not it
    const cases = [
      { spot: 'right', blocked: [ON_BELOW] },
      { spot: 'left', blocked: [ON_BELOW, ON_RIGHT] },
      { spot: 'belowRight', blocked: [ON_BELOW_LEFT, ON_RIGHT, ON_LEFT] },
      { spot: 'belowLeft', blocked: [ON_BELOW_RIGHT, ON_RIGHT, ON_LEFT] }
    ]
    cases.forEach(({ spot, blocked }) => {
      const placed = layoutTownNames([town({}), ...blockers(blocked)], AREA)
      expect(placed.get('town')).toEqual(SPOT[spot])
    })
  })

  it("should keep a name off another town's commodity icons", () => {
    // A neighbor 60px below, clear of the name, but with an icon right
    // where the name would hang
    const neighbor = town({
      id: 'neighbor',
      size: 'large',
      y: 1060,
      nameWidth: 5000,
      icons: [{ x: 0, y: -40 }]
    })
    const placed = layoutTownNames([town({}), neighbor], AREA)
    expect(placed.get('town')).toEqual(SPOT.right)
  })

  it("should put a name beside the dot past the town's own icons", () => {
    // Blocked below by a neighbor's dot, so the name goes to the right
    const icons = iconRingOffsets(3, iconRingRadius(16, 3))
    const neighbor = town({ id: 'n', size: 'large', y: 1020, nameWidth: 5000 })
    const placed = layoutTownNames([town({ icons }), neighbor], AREA)
    // Past the right icon (19 + 9), the 2px gap, then half the name
    expect(placed.get('town')).toEqual({ x: 28 + 2 + 30, y: 0 })
  })

  it("should keep a name from being cut off at the map's edge", () => {
    // Too near the bottom for the name to hang below; to the right it fits
    const placed = layoutTownNames([town({ x: 10, y: 990 })], { width: 2000, height: 1000 })
    expect(placed.get('town')).toEqual(SPOT.right)
  })

  it('should hide the name of a small town with no clear spot, and keep the big one', () => {
    // A narrow map where only the below spot fits, and two towns on it
    const area = { width: 100, height: 200 }
    const placed = layoutTownNames(
      [town({ id: 'small', x: 50, y: 50 }), town({ id: 'large', size: 'large', x: 50, y: 50 })],
      area
    )
    expect(placed.get('large')).toEqual(SPOT.below)
    expect(placed.get('small')).toBeNull()
  })

  it('should hide a name when every spot is blocked', () => {
    const blocked = blockers([ON_BELOW_RIGHT, ON_BELOW_LEFT, ON_RIGHT, ON_LEFT])
    expect(layoutTownNames([town({}), ...blocked], AREA).get('town')).toBeNull()
  })

  it('should lay out the same board the same way every time', () => {
    const towns = [town({ id: 'a' }), town({ id: 'b', x: 1004 })]
    const first = layoutTownNames(towns, AREA)
    const second = layoutTownNames([...towns].reverse(), AREA)
    expect([...second.entries()].sort()).toEqual([...first.entries()].sort())
  })
})
