/**
 * Map Store Tests
 *
 * Tests for the map state store including:
 * - Map reference management
 * - The Plan and Build views, and where the Build view was left
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
