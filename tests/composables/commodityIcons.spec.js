/**
 * Commodity Icons Tests
 *
 * Every commodity a town can produce should show a picture of its own on the
 * map, with a plain crate for anything unrecognized, and the icons around a
 * town should never cover its name or each other.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  COMMODITY_ICON_SIZE,
  commodityIconUrl,
  iconRingOffsets,
  iconRingRadius
} from '@/composables/map/commodityIcons'

/**
 * The NAICS codes in one of the industry lists the industry store can load.
 * @param {string} file - File name in public/data
 * @returns {Array<string>} The codes, as written in the file
 */
function industryCodes(file) {
  const csv = readFileSync(resolve(__dirname, '../../public/data', file), 'utf8')
  return csv
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => line.split(',')[0])
}

/** What a commodity with no icon of its own is shown as */
const crateUrl = commodityIconUrl('not-an-industry')

describe('commodityIcons', () => {
  describe('commodityIconUrl', () => {
    it('should give the plain crate a real icon file', () => {
      expect(crateUrl).toMatch(/\.svg\b/)
    })

    it.each(['label_industry_curated.csv', 'label_industry_curated_test.csv'])(
      'should have an icon of its own for every industry in %s',
      (file) => {
        const missing = industryCodes(file).filter((code) => {
          const url = commodityIconUrl(code)
          return !url || url === crateUrl
        })
        expect(missing).toEqual([])
      }
    )

    it('should have an icon of its own for Tourism', () => {
      expect(commodityIconUrl(9999)).not.toBe(crateUrl)
    })

    it('should find the icon whether the code is a number or a string', () => {
      // Codes read from CSV are strings; the Tourism code is written as a number
      expect(commodityIconUrl(2121)).toBe(commodityIconUrl('2121'))
    })

    it('should show an unknown commodity as the plain crate', () => {
      expect(commodityIconUrl(1)).toBe(crateUrl)
      expect(commodityIconUrl(undefined)).toBe(crateUrl)
    })
  })

  describe('iconRingOffsets', () => {
    it('should put a single icon straight above the dot', () => {
      expect(iconRingOffsets(1, 20)).toEqual([{ x: 0, y: -20 }])
    })

    it('should fan three icons from the left, over the top, to the right', () => {
      expect(iconRingOffsets(3, 20)).toEqual([
        { x: -20, y: 0 },
        { x: 0, y: -20 },
        { x: 20, y: 0 }
      ])
    })

    it('should keep every icon out of the space below the dot, where the name is', () => {
      for (let count = 1; count <= 4; count++) {
        iconRingOffsets(count, 26).forEach(({ y }) => expect(y).toBeLessThanOrEqual(0))
      }
    })

    it('should space icons at least an icon apart around the smallest town, however many', () => {
      // A small town's dot is 24px, the tightest ring the map draws. Towns
      // with the highest employment in an industry are given it whatever
      // they already have, so a town can hold any number of commodities.
      for (let count = 2; count <= 13; count++) {
        const offsets = iconRingOffsets(count, iconRingRadius(24, count))
        for (let i = 1; i < offsets.length; i++) {
          const gap = Math.hypot(offsets[i].x - offsets[i - 1].x, offsets[i].y - offsets[i - 1].y)
          expect(gap).toBeGreaterThanOrEqual(COMMODITY_ICON_SIZE)
        }
      }
    })

    it('should keep the ring snug around the dot when the icons fit', () => {
      expect(iconRingRadius(24, 3)).toBe(iconRingRadius(24, 1))
    })

    it('should keep every icon clear of the dot', () => {
      const dotSize = 32
      iconRingOffsets(4, iconRingRadius(dotSize, 4)).forEach(({ x, y }) => {
        // The icon's nearest edge is half an icon closer than its center
        expect(Math.hypot(x, y) - COMMODITY_ICON_SIZE / 2).toBeGreaterThan(dotSize / 2)
      })
    })

    it('should place nothing for a town with no commodities', () => {
      expect(iconRingOffsets(0, 20)).toEqual([])
    })
  })
})
