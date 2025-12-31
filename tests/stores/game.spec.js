/**
 * Game Store Tests
 *
 * Tests for the game state store including:
 * - Region selection
 * - Turn advancement
 * - Initial state
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGameStore } from '@/stores/game'

describe('Game Store', () => {
  let gameStore

  beforeEach(() => {
    // Suppress console.log in tests
    vi.spyOn(console, 'log').mockImplementation(() => {})
    gameStore = useGameStore()
  })

  describe('Initial State', () => {
    it('should start with null region', () => {
      expect(gameStore.region).toBeNull()
    })

    it('should start with turn 0', () => {
      expect(gameStore.turn).toBe(0)
    })
  })

  describe('setRegion', () => {
    it('should set a simple region object', () => {
      const region = { name: 'Northeast', states: ['NY', 'PA', 'NJ'] }

      gameStore.setRegion(region)

      expect(gameStore.region).toEqual(region)
    })

    it('should set a GeoJSON region', () => {
      const geoJsonRegion = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'Test Region' },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [-74.0, 40.7],
                  [-73.9, 40.7],
                  [-73.9, 40.8],
                  [-74.0, 40.8],
                  [-74.0, 40.7]
                ]
              ]
            }
          }
        ]
      }

      gameStore.setRegion(geoJsonRegion)

      expect(gameStore.region).toEqual(geoJsonRegion)
    })

    it('should overwrite existing region', () => {
      gameStore.setRegion({ name: 'First' })
      gameStore.setRegion({ name: 'Second' })

      expect(gameStore.region.name).toBe('Second')
    })

    it('should allow setting region to null', () => {
      gameStore.setRegion({ name: 'Test' })
      gameStore.setRegion(null)

      expect(gameStore.region).toBeNull()
    })
  })

  describe('advanceTurn', () => {
    it('should increment turn by 1', () => {
      gameStore.advanceTurn()

      expect(gameStore.turn).toBe(1)
    })

    it('should increment turn multiple times', () => {
      gameStore.advanceTurn()
      gameStore.advanceTurn()
      gameStore.advanceTurn()

      expect(gameStore.turn).toBe(3)
    })

    it('should continue incrementing from current turn', () => {
      // Advance 5 times
      for (let i = 0; i < 5; i++) {
        gameStore.advanceTurn()
      }

      expect(gameStore.turn).toBe(5)

      gameStore.advanceTurn()

      expect(gameStore.turn).toBe(6)
    })
  })

  describe('State Persistence', () => {
    it('should maintain region and turn independently', () => {
      gameStore.setRegion({ name: 'Midwest' })
      gameStore.advanceTurn()
      gameStore.advanceTurn()

      expect(gameStore.region.name).toBe('Midwest')
      expect(gameStore.turn).toBe(2)

      gameStore.setRegion({ name: 'West Coast' })

      expect(gameStore.region.name).toBe('West Coast')
      expect(gameStore.turn).toBe(2)
    })
  })
})
