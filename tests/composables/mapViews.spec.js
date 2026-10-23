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
  planPopupOffset
} from '@/composables/map/mapViews'

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

  describe('buildViewStart', () => {
    it('should open one level closer than the Plan view, over the middle of the region, the first time', () => {
      // The Plan view fits Colorado at 7.47 in a desktop window
      expect(buildViewStart({ zoom: null, center: null }, bounds, 7.47)).toEqual({
        zoom: 8,
        center: [39, -105.5]
      })
    })

    it('should open closer than the Plan view even when that fits at a whole level', () => {
      expect(buildViewStart({ zoom: null, center: null }, bounds, 7).zoom).toBe(8)
    })

    it('should open the first time within the Build view range', () => {
      // Texas fits further out than the Build view goes; a small state closer in
      expect(buildViewStart(null, bounds, 4.2).zoom).toBe(6)
      expect(buildViewStart(null, bounds, 9.6).zoom).toBe(9)
    })

    it('should reopen where the player left it', () => {
      expect(buildViewStart({ zoom: 8, center: [38.3, -104.6] }, bounds)).toEqual({
        zoom: 8,
        center: [38.3, -104.6]
      })
    })

    it('should open as it does the first time if left at a zoom the Build view does not go to', () => {
      // Kansas's box holds the old default center, so only the zoom gives the
      // never-updated view of an old save away
      const kansas = [
        [37, -102],
        [40, -94.5]
      ]
      expect(buildViewStart({ zoom: 3, center: [40, -100] }, kansas, 6.6)).toEqual({
        zoom: 7,
        center: [38.5, -98.25]
      })
      expect(buildViewStart({ zoom: 12, center: [39, -105] }, bounds, 7.47).zoom).toBe(8)
    })

    it('should reopen where the player left it just past the edge of the region', () => {
      // The Build view pans a little past the region's box, so a border town
      // can be brought away from the edge of the screen
      expect(buildViewStart({ zoom: 9, center: [41.2, -104.6] }, bounds, 7.47)).toEqual({
        zoom: 9,
        center: [41.2, -104.6]
      })
    })

    it('should open at a whole zoom level', () => {
      expect(buildViewStart({ zoom: 7.4, center: [39, -105] }, bounds).zoom).toBe(7)
    })

    it('should open as it does the first time if left outside the region', () => {
      // The view every save recorded before there were two views: zoom 3,
      // over Kansas
      expect(buildViewStart({ zoom: 3, center: [40, -100] }, bounds, 7.47)).toEqual({
        zoom: 8,
        center: [39, -105.5]
      })
    })

    it('should open zoomed all the way out over the middle of the region with nothing to go on', () => {
      expect(buildViewStart(undefined, bounds)).toEqual({ zoom: 6, center: [39, -105.5] })
    })
  })

  describe('planPopupOffset', () => {
    /** A popup the size of a small town's: name, size and one industry */
    const popup = { width: 110, height: 140 }
    /** A desktop-sized map */
    const mapSize = { x: 1100, y: 700 }

    it("should leave a popup above its town, as Leaflet places it, when there's room", () => {
      expect(planPopupOffset(popup, { x: 550, y: 400 }, mapSize)).toEqual({
        offset: [0, 7],
        showTip: true
      })
    })

    it('should drop a popup below a town near the top of the map, clear of its name', () => {
      const { offset, showTip } = planPopupOffset(popup, { x: 550, y: 60 }, mapSize)

      // Its top edge (offset less the popup's height and Leaflet's 20px tip
      // space) lands 34px below the town: past the dot and the name under it
      expect(offset).toEqual([0, 34 + 140 + 20])
      // A tip on the bottom edge would point away from the town
      expect(showTip).toBe(false)
    })

    it('should slide a popup right, off the left edge of the map', () => {
      const { offset, showTip } = planPopupOffset(popup, { x: 20, y: 400 }, mapSize)

      // Its left edge would be at 20 - 55 = -35; it is kept 8px in
      expect(offset).toEqual([43, 7])
      expect(showTip).toBe(false)
    })

    it('should slide a popup left, off the right edge of the map', () => {
      expect(planPopupOffset(popup, { x: 1090, y: 400 }, mapSize).offset).toEqual([-53, 7])
    })

    it('should put a popup on whichever side has more room when it fits neither', () => {
      const short = { x: 1100, y: 200 }

      // Nearer the bottom: more room above, though not enough
      expect(planPopupOffset(popup, { x: 550, y: 150 }, short).offset[1]).toBe(7)
      // Nearer the top: more room below
      expect(planPopupOffset(popup, { x: 550, y: 40 }, short).offset[1]).toBe(194)
    })
  })
})
