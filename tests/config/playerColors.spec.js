/**
 * Player Colors Tests
 *
 * Towns are drawn in plum (TOWN_COLOR). A player whose color is too close
 * to it would see their track blend into every town it runs through, so no
 * player color may come near the towns'. Nothing else would catch a new
 * color added to the list that breaks this; it would only show on the map.
 *
 * "Close" is measured as the distance between two colors in CIELAB, a color
 * space laid out so that equal distances look about equally different to
 * the eye (the CIE76 color difference, ΔE). Around 2 is the smallest
 * difference most people notice; colors 40 or more apart are easy to tell
 * apart at a glance, even as a thin line next to a small shape.
 */

import { describe, it, expect } from 'vitest'
import { playerColors } from '@/config/playerColors'
import { TOWN_COLOR } from '@/composables/map/townIcons'

/**
 * How far apart a player color must be from the towns' plum. Set between
 * the pink taken out of the list (37 from plum, judged too close by eye)
 * and the purple kept in it (43, judged far enough).
 */
const MIN_DIFFERENCE_FROM_TOWNS = 40

/**
 * A hex color's position in CIELAB: lightness, then green–red, then
 * blue–yellow. Converts sRGB to linear light, then to CIE XYZ (D65 white),
 * then to Lab, using the standard formulas.
 * @param {string} hex - A color as '#RRGGBB'
 * @returns {Array<number>} [L, a, b]
 */
function toLab(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

/**
 * The CIE76 color difference: the straight-line distance between two
 * colors in CIELAB.
 * @param {string} a - A color as '#RRGGBB'
 * @param {string} b - Another color as '#RRGGBB'
 * @returns {number} ΔE, 0 for the same color
 */
function colorDifference(a, b) {
  const [l1, a1, b1] = toLab(a)
  const [l2, a2, b2] = toLab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

describe('colorDifference', () => {
  it('should measure a color against itself as no difference', () => {
    expect(colorDifference('#8A4D76', '#8A4D76')).toBe(0)
  })

  it('should measure black against white as the full lightness range', () => {
    expect(colorDifference('#000000', '#FFFFFF')).toBeCloseTo(100, 0)
  })
})

describe('playerColors', () => {
  it('should turn away the pink that was taken out for being too close to the towns', () => {
    expect(colorDifference('#FF9FC8', TOWN_COLOR)).toBeLessThan(MIN_DIFFERENCE_FROM_TOWNS)
  })

  it.each(playerColors)('should keep %s easy to tell apart from the towns', (color) => {
    expect(colorDifference(color, TOWN_COLOR)).toBeGreaterThanOrEqual(MIN_DIFFERENCE_FROM_TOWNS)
  })
})
