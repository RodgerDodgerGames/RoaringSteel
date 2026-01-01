/**
 * Map Store Tests
 *
 * Tests for the map state store including:
 * - Map reference management
 * - Zoom and center controls
 * - Drawing state management
 * - Towns layer management
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useMapStore } from '@/stores/map'

describe('Map Store', () => {
  let mapStore

  beforeEach(() => {
    mapStore = useMapStore()
  })

  describe('Initial State', () => {
    it('should start with null map', () => {
      expect(mapStore.map).toBeNull()
    })

    it('should start with default zoom level of 3', () => {
      expect(mapStore.mapZoom).toBe(3)
    })

    it('should start with default center at [40, -100]', () => {
      expect(mapStore.mapCenter).toEqual([40, -100])
    })

    it('should start with null towns layer', () => {
      expect(mapStore.townsLayer).toBeNull()
    })

    it('should start with drawing inactive', () => {
      expect(mapStore.isDrawingActive).toBe(false)
    })
  })

  describe('setMap', () => {
    it('should set the map reference', () => {
      const mockMap = { id: 'test-map', getZoom: () => 5 }

      mapStore.setMap(mockMap)

      expect(mapStore.map).toEqual(mockMap)
    })

    it('should allow setting map to null', () => {
      mapStore.setMap({ id: 'test' })
      mapStore.setMap(null)

      expect(mapStore.map).toBeNull()
    })
  })

  describe('setMapZoom', () => {
    it('should set zoom level', () => {
      mapStore.setMapZoom(10)

      expect(mapStore.mapZoom).toBe(10)
    })

    it('should allow any zoom value', () => {
      mapStore.setMapZoom(1)
      expect(mapStore.mapZoom).toBe(1)

      mapStore.setMapZoom(18)
      expect(mapStore.mapZoom).toBe(18)
    })
  })

  describe('setMapCenter', () => {
    it('should set map center coordinates', () => {
      mapStore.setMapCenter([37.7749, -122.4194])

      expect(mapStore.mapCenter).toEqual([37.7749, -122.4194])
    })

    it('should handle different coordinate formats', () => {
      // US coordinates
      mapStore.setMapCenter([40.7128, -74.006])
      expect(mapStore.mapCenter).toEqual([40.7128, -74.006])

      // European coordinates
      mapStore.setMapCenter([51.5074, -0.1278])
      expect(mapStore.mapCenter).toEqual([51.5074, -0.1278])
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
    it('should set the towns layer', () => {
      const mockLayer = {
        getLayers: () => [],
        addLayer: () => {},
        removeLayer: () => {}
      }

      mapStore.setTownsLayer(mockLayer)

      expect(mapStore.townsLayer).toEqual(mockLayer)
    })

    it('should allow clearing the towns layer', () => {
      mapStore.setTownsLayer({ id: 'layer' })
      mapStore.setTownsLayer(null)

      expect(mapStore.townsLayer).toBeNull()
    })
  })

  describe('State Independence', () => {
    it('should maintain all states independently', () => {
      const mockMap = { id: 'map' }
      const mockLayer = { id: 'layer' }

      mapStore.setMap(mockMap)
      mapStore.setMapZoom(12)
      mapStore.setMapCenter([35, -80])
      mapStore.setIsDrawingActive(true)
      mapStore.setTownsLayer(mockLayer)

      expect(mapStore.map).toEqual(mockMap)
      expect(mapStore.mapZoom).toBe(12)
      expect(mapStore.mapCenter).toEqual([35, -80])
      expect(mapStore.isDrawingActive).toBe(true)
      expect(mapStore.townsLayer).toEqual(mockLayer)
    })
  })
})
