/**
 * Map Views Tests
 *
 * Where the Plan and Build views look: the region's box, how far past it the
 * Build view may pan, and where the Build view opens. And, since the Plan
 * view cannot pan to show a town's popup, where the popup goes instead.
 */

import { describe, it, expect } from 'vitest'
import {
  regionBounds,
  panLimits,
  buildViewStart,
  buildZoomRange,
  buildViewAt
} from '@/composables/map/mapViews'
import { metersPerPixel } from '@/composables/setup/useElevationTiles'
import { mapViewConfig } from '@/config/map'

/**
 * How many pixels across a cell is drawn at a zoom, at the equator.
 * @param {number} cellKm - The cell's width
 * @param {number} zoom - The map's zoom
 * @returns {number} Width in px
 */
const cellPixelsAt = (cellKm, zoom) => (cellKm * 1000) / metersPerPixel(zoom, 0)

/** A Colorado-shaped rectangle: 37–41°N, 109–102°W */
const colorado = {
  type: 'Feature',
  properties: { NAME: 'Colorado', STATE: '08' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-109, 37],
        [-102, 37],
        [-102, 41],
        [-109, 41],
        [-109, 37]
      ]
    ]
  }
}

const bounds = [
  [37, -109],
  [41, -102]
]

describe('mapViews', () => {
  describe('regionBounds', () => {
    it("should box the region's southwest and northeast corners", () => {
      expect(regionBounds(colorado)).toEqual(bounds)
    })

    it('should have no box without a region', () => {
      expect(regionBounds(null)).toBeNull()
    })
  })

  describe('panLimits', () => {
    it('should grow the box on every side by a share of its size', () => {
      // 4° tall and 7° wide, grown by a quarter on each side
      expect(panLimits(bounds, 0.25)).toEqual([
        [36, -110.75],
        [42, -100.25]
      ])
    })
  })

  describe('buildZoomRange', () => {
    // Written against the configured cell width rather than a number, so
    // tuning `buildCellPixels` (it went from 10 to 25) does not break them

    it('should stop at the closest zoom that draws a cell no more than buildCellPixels across', () => {
      const { min, max } = buildZoomRange(1, 0)
      // The closest zoom draws a 1 km cell no wider than the setting; one
      // level nearer would draw it wider
      expect(cellPixelsAt(1, max)).toBeLessThanOrEqual(mapViewConfig.buildCellPixels)
      expect(cellPixelsAt(1, max + 1)).toBeGreaterThan(mapViewConfig.buildCellPixels)
      // The furthest zoom is `buildZoomSteps` out from that
      expect(min).toBe(max - mapViewConfig.buildZoomSteps)
    })

    it('should keep a zoom that draws a cell exactly buildCellPixels across', () => {
      // Zoom 10 draws a cell this wide exactly buildCellPixels across at the
      // equator, so floating-point noise must not drop it to zoom 9
      const exactKm = (mapViewConfig.buildCellPixels * metersPerPixel(10, 0)) / 1000
      expect(buildZoomRange(exactKm, 0).max).toBe(10)
    })

    it('should go one zoom closer for cells half the size', () => {
      expect(buildZoomRange(0.5, 40).max).toBe(buildZoomRange(1, 40).max + 1)
    })

    it('should stop a zoom further out toward the poles, where a cell looks bigger', () => {
      // At 60° a map pixel covers half the ground it does at the equator, so
      // a cell is twice as many pixels across at the same zoom
      expect(buildZoomRange(1, 60).max).toBe(buildZoomRange(1, 0).max - 1)
    })

    it('should never go closer than the basemap draws', () => {
      expect(buildZoomRange(0.001, 0).max).toBe(18)
    })
  })

  /** The Build view's range when its cells are 10 km: zoom 6 to 9 */
  const RANGE = { min: 6, max: 9 }

  describe('buildViewStart', () => {
    it('should open one level closer than the Plan view, over the middle of the region, the first time', () => {
      // The Plan view fits Colorado at 7.47 in a desktop window
      expect(buildViewStart({ zoom: null, center: null }, bounds, 7.47, RANGE)).toEqual({
        zoom: 8,
        center: [39, -105.5]
      })
    })

    it('should open closer than the Plan view even when that fits at a whole level', () => {
      expect(buildViewStart({ zoom: null, center: null }, bounds, 7, RANGE).zoom).toBe(8)
    })

    it('should open the first time within the Build view range', () => {
      // Texas fits further out than the Build view goes; a small state closer in
      expect(buildViewStart(null, bounds, 4.2, RANGE).zoom).toBe(6)
      expect(buildViewStart(null, bounds, 9.6, RANGE).zoom).toBe(9)
    })

    it('should reopen where the player left it', () => {
      expect(buildViewStart({ zoom: 8, center: [38.3, -104.6] }, bounds, undefined, RANGE)).toEqual(
        {
          zoom: 8,
          center: [38.3, -104.6]
        }
      )
    })

    it('should open as it does the first time if left at a zoom the Build view does not go to', () => {
      // Kansas's box holds the old default center, so only the zoom gives the
      // never-updated view of an old save away
      const kansas = [
        [37, -102],
        [40, -94.5]
      ]
      expect(buildViewStart({ zoom: 3, center: [40, -100] }, kansas, 6.6, RANGE)).toEqual({
        zoom: 7,
        center: [38.5, -98.25]
      })
      expect(buildViewStart({ zoom: 12, center: [39, -105] }, bounds, 7.47, RANGE).zoom).toBe(8)
    })

    it('should reopen where the player left it just past the edge of the region', () => {
      // The Build view pans a little past the region's box, so a border town
      // can be brought away from the edge of the screen
      expect(buildViewStart({ zoom: 9, center: [41.2, -104.6] }, bounds, 7.47, RANGE)).toEqual({
        zoom: 9,
        center: [41.2, -104.6]
      })
    })

    it('should open at a whole zoom level', () => {
      expect(buildViewStart({ zoom: 7.4, center: [39, -105] }, bounds, undefined, RANGE).zoom).toBe(
        7
      )
    })

    it('should open as it does the first time if left outside the region', () => {
      // The view every save recorded before there were two views: zoom 3,
      // over Kansas
      expect(buildViewStart({ zoom: 3, center: [40, -100] }, bounds, 7.47, RANGE)).toEqual({
        zoom: 8,
        center: [39, -105.5]
      })
    })

    it('should open zoomed all the way out over the middle of the region with nothing to go on', () => {
      expect(buildViewStart(undefined, bounds, undefined, RANGE)).toEqual({
        zoom: 6,
        center: [39, -105.5]
      })
    })
  })

  describe('buildViewAt', () => {
    it('should open over the point at the zoom the Build view was left at', () => {
      expect(buildViewAt([39.7, -105], 8, RANGE)).toEqual({ zoom: 8, center: [39.7, -105] })
    })

    it('should open at the closest zoom when the Build view has not been left anywhere', () => {
      expect(buildViewAt([39.7, -105], null, RANGE)).toEqual({ zoom: 9, center: [39.7, -105] })
    })

    it('should open at the closest zoom when left at a zoom the Build view no longer goes to', () => {
      expect(buildViewAt([39.7, -105], 3, RANGE).zoom).toBe(9)
    })
  })
})
