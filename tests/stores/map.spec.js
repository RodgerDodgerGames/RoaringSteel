/**
 * Map Store Tests
 *
 * Tests for the map state store including:
 * - Map reference management
 * - The Plan and Build views, and where the Build view was left
 * - Each person's own view, handed back to them as their turn comes round
 * - Drawing state management
 * - Towns layer management
 * - Holding real Leaflet objects without leaking their listeners
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import { useMapStore } from '@/stores/map'
import { BUILD_VIEW, PLAN_VIEW } from '@/composables/map/mapViews'

describe('Map Store', () => {
  let mapStore

  beforeEach(() => {
    mapStore = useMapStore()
  })

  describe('Initial State', () => {
    it('should start with null map', () => {
      expect(mapStore.map).toBeNull()
    })

    it('should start in the Plan view', () => {
      expect(mapStore.viewMode).toBe(PLAN_VIEW)
    })

    it('should start with no Build view position', () => {
      expect(mapStore.mapZoom).toBeNull()
      expect(mapStore.mapCenter).toBeNull()
    })

    it('should start with null towns layer', () => {
      expect(mapStore.townsLayer).toBeNull()
    })

    it('should start with drawing inactive', () => {
      expect(mapStore.isDrawingActive).toBe(false)
    })
  })

  describe('setMap', () => {
    it('should hand back the very map it was given, not a proxy of it', () => {
      const mockMap = { id: 'test-map', getZoom: () => 5 }

      mapStore.setMap(mockMap)

      expect(mapStore.map).toBe(mockMap)
    })

    it('should allow setting map to null', () => {
      mapStore.setMap({ id: 'test' })
      mapStore.setMap(null)

      expect(mapStore.map).toBeNull()
    })
  })

  describe('setMapView', () => {
    it('should record where the Build view is', () => {
      mapStore.setMapView({ zoom: 8, center: [38.3, -104.6] })

      expect(mapStore.mapZoom).toBe(8)
      expect(mapStore.mapCenter).toEqual([38.3, -104.6])
    })
  })

  describe('setViewMode', () => {
    it('should switch between the Plan and Build views', () => {
      expect(mapStore.setViewMode(BUILD_VIEW)).toBe(true)
      expect(mapStore.viewMode).toBe(BUILD_VIEW)

      mapStore.setViewMode(PLAN_VIEW)
      expect(mapStore.viewMode).toBe(PLAN_VIEW)
    })

    it('should refuse a view that does not exist', () => {
      mapStore.setViewMode(BUILD_VIEW)

      expect(mapStore.setViewMode('satellite')).toBe(false)
      expect(mapStore.viewMode).toBe(BUILD_VIEW)
    })
  })

  describe('reset', () => {
    it('should go back to the Plan view and forget the Build view position', () => {
      mapStore.setViewMode(BUILD_VIEW)
      mapStore.setMapView({ zoom: 8, center: [39, -105] })

      mapStore.reset()

      expect(mapStore.viewMode).toBe(PLAN_VIEW)
      expect(mapStore.mapZoom).toBeNull()
      expect(mapStore.mapCenter).toBeNull()
    })

    it("should forget every player's kept view", () => {
      mapStore.passView({ id: 1, isBot: false }, { id: 2, isBot: false })

      mapStore.reset()

      expect(mapStore.playerViews).toEqual({})
    })
  })

  describe('setIsDrawingActive', () => {
    it('should enable drawing mode', () => {
      mapStore.setIsDrawingActive(true)

      expect(mapStore.isDrawingActive).toBe(true)
    })

    it('should disable drawing mode', () => {
      mapStore.setIsDrawingActive(true)
      mapStore.setIsDrawingActive(false)

      expect(mapStore.isDrawingActive).toBe(false)
    })

    it('should toggle drawing state', () => {
      expect(mapStore.isDrawingActive).toBe(false)

      mapStore.setIsDrawingActive(true)
      expect(mapStore.isDrawingActive).toBe(true)

      mapStore.setIsDrawingActive(false)
      expect(mapStore.isDrawingActive).toBe(false)
    })
  })

  describe('setTownsLayer', () => {
    it('should hand back the very towns layer it was given, not a proxy of it', () => {
      const mockLayer = {
        getLayers: () => [],
        addLayer: () => {},
        removeLayer: () => {}
      }

      mapStore.setTownsLayer(mockLayer)

      expect(mapStore.townsLayer).toBe(mockLayer)
    })

    it('should allow clearing the towns layer', () => {
      mapStore.setTownsLayer({ id: 'layer' })
      mapStore.setTownsLayer(null)

      expect(mapStore.townsLayer).toBeNull()
    })
  })

  /**
   * The store hands out the very Leaflet objects it was given, never a Vue
   * proxy of them. Leaflet keys each event listener on the object that added
   * it, so a layer added through a proxy but removed through the raw object
   * (or the other way round) leaves its listeners behind. They then fire on a
   * layer that is no longer on the map, and throw.
   *
   * These run against a real Leaflet map with Geoman attached, because the
   * failure lives in how Leaflet and Geoman keep track of their listeners.
   */
  describe('holding Leaflet objects', () => {
    let container
    let map

    /** One zoom step, announced to every layer the way a double-click zoom does */
    const zoomIn = () => map.fire('zoomanim', { center: L.latLng(39, -105), zoom: 7 })

    beforeEach(() => {
      container = document.createElement('div')
      document.body.appendChild(container)
      map = L.map(container)
      // happy-dom has no CSS 3D, so Leaflet turns zoom animation off and no
      // layer listens for zoom steps. In a real browser it is on.
      map._zoomAnimated = true
      map.setView([39, -105], 6)
    })

    afterEach(() => {
      map.remove()
      container.remove()
    })

    it('should not leave the drawing cursor behind when a line is finished by double-click', () => {
      mapStore.setMap(map)

      // Building track switches Geoman's line drawing on through the store...
      mapStore.map.pm.enableDraw('Line')
      // The drawing cursor is now listening for zoom steps. If it weren't
      // (e.g. Leaflet stopped honoring the zoom animation switch above), this
      // test would pass whether or not the bug was there.
      expect(map.listens('zoomanim')).toBe(true)
      // ...and Geoman switches it off by itself when a double-click finishes
      // the line. The same double-click then zooms the map in.
      map.pm.disableDraw('Line')

      expect(zoomIn).not.toThrow()
    })
  })

  describe('showInBuildView', () => {
    it('should switch to the Build view, to open over the point', () => {
      mapStore.showInBuildView([39.74, -104.99])

      expect(mapStore.viewMode).toBe(BUILD_VIEW)
      expect(mapStore.buildFocus).toEqual([39.74, -104.99])
    })

    it('should drop the point on going back to the Plan view, so a later switch reopens where the player left off', () => {
      mapStore.showInBuildView([39.74, -104.99])
      mapStore.setViewMode(PLAN_VIEW)

      expect(mapStore.buildFocus).toBeNull()
    })

    it('should drop the point once it has been used', () => {
      mapStore.showInBuildView([39.74, -104.99])
      mapStore.clearBuildFocus()

      expect(mapStore.buildFocus).toBeNull()
    })
  })

  describe('passView', () => {
    const ann = { id: 1, isBot: false }
    const bob = { id: 2, isBot: false }
    const bot = { id: 3, isBot: true }

    /** Puts the map where a player looking over Denver in the Build view has it */
    function lookOverDenver() {
      mapStore.setViewMode(BUILD_VIEW)
      mapStore.setMapView({ zoom: 9, center: [39.7, -105] })
    }

    it('should give a person back the view they ended their last turn in, Build position and all', () => {
      lookOverDenver()
      mapStore.passView(ann, bob)
      mapStore.passView(bob, ann)

      expect(mapStore.viewMode).toBe(BUILD_VIEW)
      expect(mapStore.mapZoom).toBe(9)
      expect(mapStore.mapCenter).toEqual([39.7, -105])
    })

    it('should show the Plan view to someone who has not ended a turn yet', () => {
      lookOverDenver()

      mapStore.passView(ann, bob)

      expect(mapStore.viewMode).toBe(PLAN_VIEW)
    })

    it("should not open someone's Build view over the last player's spot", () => {
      lookOverDenver()

      mapStore.passView(ann, bob)

      expect(mapStore.mapZoom).toBeNull()
      expect(mapStore.mapCenter).toBeNull()
    })

    it("should keep each person's Build position apart from the others'", () => {
      lookOverDenver()
      mapStore.passView(ann, bob)
      // Bob looks elsewhere, then ends his turn in the Plan view
      mapStore.setViewMode(BUILD_VIEW)
      mapStore.setMapView({ zoom: 8, center: [38.3, -104.6] })
      mapStore.setViewMode(PLAN_VIEW)
      mapStore.passView(bob, ann)

      expect(mapStore.mapCenter).toEqual([39.7, -105])

      mapStore.passView(ann, bob)

      // Bob is back in the Plan view he ended in, his own Build spot kept
      expect(mapStore.viewMode).toBe(PLAN_VIEW)
      expect(mapStore.mapZoom).toBe(8)
      expect(mapStore.mapCenter).toEqual([38.3, -104.6])
    })

    it("should show a computer player's turn in the Plan view", () => {
      lookOverDenver()

      mapStore.passView(ann, bot)

      expect(mapStore.viewMode).toBe(PLAN_VIEW)
    })

    it("should hand a person their own view after a computer player's turn", () => {
      lookOverDenver()
      mapStore.passView(ann, bot)
      mapStore.passView(bot, ann)

      expect(mapStore.viewMode).toBe(BUILD_VIEW)
      expect(mapStore.mapCenter).toEqual([39.7, -105])
    })

    it('should keep no view for a computer player', () => {
      mapStore.passView(bot, ann)

      expect(mapStore.playerViews).not.toHaveProperty(String(bot.id))
    })

    it('should leave the view as it was for a player who plays again', () => {
      lookOverDenver()

      mapStore.passView(ann, ann)

      expect(mapStore.viewMode).toBe(BUILD_VIEW)
      expect(mapStore.mapZoom).toBe(9)
      expect(mapStore.mapCenter).toEqual([39.7, -105])
    })

    it('should signal a move when the next player is in the same view as the last', () => {
      // Both in the Build view: the view does not change, but the spot does
      lookOverDenver()
      mapStore.passView(ann, bob)
      mapStore.setViewMode(BUILD_VIEW)
      mapStore.passView(bob, ann)
      const before = mapStore.viewHandoffs

      mapStore.passView(ann, bob)

      expect(mapStore.viewHandoffs).toBe(before + 1)
    })

    it('should drop a point the Build view was to open over', () => {
      mapStore.showInBuildView([39.74, -104.99])

      mapStore.passView(ann, bob)

      expect(mapStore.buildFocus).toBeNull()
    })
  })

  describe('setPlayerViews', () => {
    it("should put back each person's kept view from a save", () => {
      mapStore.setPlayerViews({ 2: { view: BUILD_VIEW, zoom: 9, center: [39.7, -105] } })

      mapStore.passView({ id: 1, isBot: false }, { id: 2, isBot: false })

      expect(mapStore.viewMode).toBe(BUILD_VIEW)
      expect(mapStore.mapZoom).toBe(9)
    })

    it('should keep no views from a save that has none', () => {
      mapStore.setPlayerViews({ 2: { view: BUILD_VIEW } })

      mapStore.setPlayerViews(undefined)

      expect(mapStore.playerViews).toEqual({})
    })

    it('should keep no views from a save whose views cannot be read', () => {
      mapStore.setPlayerViews([{ view: BUILD_VIEW }])

      expect(mapStore.playerViews).toEqual({})
    })

    it('should keep the view of someone who had not opened the Build view yet', () => {
      mapStore.setPlayerViews({ 2: { view: PLAN_VIEW, zoom: null, center: null } })

      expect(mapStore.playerViews).toHaveProperty('2')
    })

    it.each([
      ['a view nothing knows how to show', { view: 'satellite', zoom: 9, center: [39.7, -105] }],
      ['a center that is not [lat, lng]', { view: BUILD_VIEW, zoom: 9, center: { lat: 39.7 } }],
      ['a center with a gap in it', { view: BUILD_VIEW, zoom: 9, center: [39.7, null] }],
      ['a zoom that is not a number', { view: BUILD_VIEW, zoom: 'close', center: [39.7, -105] }]
    ])('should show the Plan view to someone whose saved view has %s', (_, kept) => {
      mapStore.setPlayerViews({ 2: kept, 3: { view: BUILD_VIEW, zoom: 9, center: [38, -104] } })

      mapStore.passView({ id: 1, isBot: false }, { id: 2, isBot: false })

      expect(mapStore.viewMode).toBe(PLAN_VIEW)
      expect(mapStore.mapCenter).toBeNull()
      // The rest of the save's views are kept
      expect(mapStore.playerViews).toHaveProperty('3')
    })
  })

  describe('State Independence', () => {
    it('should maintain all states independently', () => {
      const mockMap = { id: 'map' }
      const mockLayer = { id: 'layer' }

      mapStore.setMap(mockMap)
      mapStore.setMapView({ zoom: 7, center: [35, -80] })
      mapStore.setIsDrawingActive(true)
      mapStore.setTownsLayer(mockLayer)

      expect(mapStore.map).toEqual(mockMap)
      expect(mapStore.mapZoom).toBe(7)
      expect(mapStore.mapCenter).toEqual([35, -80])
      expect(mapStore.isDrawingActive).toBe(true)
      expect(mapStore.townsLayer).toEqual(mockLayer)
    })
  })
})
