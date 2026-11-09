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

  describe('isBuildingRound', () => {
    it('should be a building round for the first two rounds only', () => {
      expect(gameStore.isBuildingRound).toBe(true)

      gameStore.advanceTurn()
      expect(gameStore.isBuildingRound).toBe(true)

      gameStore.advanceTurn()
      expect(gameStore.isBuildingRound).toBe(false)
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

  describe('game settings', () => {
    it('should let track start in any town in a new game until told otherwise', () => {
      expect(gameStore.gameSettings).toEqual({ requireMajorCityStart: false })
    })

    it("should take only the game settings from the player's settings", () => {
      gameStore.setGameSettings({ requireMajorCityStart: true, theme: 'dark', pinLimit: 2 })

      expect(gameStore.gameSettings).toEqual({ requireMajorCityStart: true })
    })

    it("should keep its own copy, untouched by later changes to the player's settings", () => {
      const settings = { requireMajorCityStart: true }
      gameStore.setGameSettings(settings)

      settings.requireMajorCityStart = false

      expect(gameStore.gameSettings.requireMajorCityStart).toBe(true)
    })

    it('should go on playing a save made before game settings existed by the rules it was played by', () => {
      // Track had to start in a major city then
      gameStore.setGameState({ region: { name: 'Old' }, turn: 4 })

      expect(gameStore.gameSettings).toEqual({ requireMajorCityStart: true })
    })

    it('should give a game setting a save does not know its default', () => {
      gameStore.setGameState({ region: { name: 'Newer' }, settings: {} })

      expect(gameStore.gameSettings).toEqual({ requireMajorCityStart: false })
    })

    it('should go back to the defaults on reset', () => {
      gameStore.setGameSettings({ requireMajorCityStart: true })

      gameStore.reset()

      expect(gameStore.gameSettings.requireMajorCityStart).toBe(false)
    })
  })

  describe('dismissed help', () => {
    it('should remember each help screen dismissed, once', () => {
      gameStore.dismissHelp('building')
      gameStore.dismissHelp('removing')
      gameStore.dismissHelp('building')

      expect(gameStore.dismissedHelp).toEqual(['building', 'removing'])
    })

    it('should ignore anything in a save that is not a help screen name', () => {
      gameStore.setGameState({ dismissedHelp: ['building', 7, null] })

      expect(gameStore.dismissedHelp).toEqual(['building'])
    })
  })
})
