/**
 * Victory Tests
 *
 * A player wins with both the winning cash and their own track joining
 * enough of the region's major cities: Empire Builder's six of seven, kept
 * as a share and rounded up.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { majorCitiesNeeded, useVictory } from '@/composables/victory'
import { usePlayerStore } from '@/stores/players'
import { useGameStore } from '@/stores/game'
import { useTownsStore } from '@/stores/towns'
import { useTrackStore } from '@/stores/track'
import { gameRules } from '@/config/game'

describe('victory', () => {
  describe('majorCitiesNeeded', () => {
    it.each([
      [7, 6],
      [8, 7],
      [10, 9],
      [6, 6],
      [3, 3],
      [1, 1],
      [0, 0]
    ])('of %i major cities, should ask for %i to be joined', (count, needed) => {
      expect(majorCitiesNeeded(count)).toBe(needed)
    })
  })

  describe('useVictory', () => {
    const city = (name, lng) => ({
      name,
      msa: name,
      lat: 0,
      lon: lng,
      size: 'large',
      industries: []
    })

    beforeEach(() => {
      usePlayerStore().addPlayer({ name: 'Ann', color: 'red', cash: gameRules.victory.cash })
      useTownsStore().setTowns([city('A', 0), city('B', 0.3)])
      useTrackStore().addSegment({
        ownerId: 1,
        coordinates: [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 0.3 }
        ]
      })
    })

    it('should report how close a player is', () => {
      expect(useVictory().progress(1)).toEqual({
        cash: gameRules.victory.cash,
        cashNeeded: gameRules.victory.cash,
        citiesJoined: 2,
        citiesNeeded: 2,
        hasWon: true
      })
    })

    it('should declare a player who has won the winner', () => {
      expect(useVictory().checkForWinner(1)).toBe(true)

      expect(useGameStore().winnerId).toBe(1)
    })

    it('should not declare a player short of the cash', () => {
      usePlayerStore().updatePlayer(1, { cash: gameRules.victory.cash - 1 })

      expect(useVictory().checkForWinner(1)).toBe(false)
      expect(useGameStore().isOver).toBe(false)
    })

    it('should not declare a player whose track misses a city', () => {
      useTownsStore().setTowns([city('A', 0), city('B', 0.3), city('C', 0.6)])

      expect(useVictory().checkForWinner(1)).toBe(false)
    })

    it('should not replace a winner already declared', () => {
      useGameStore().declareWinner(2)

      expect(useVictory().checkForWinner(1)).toBe(false)
      expect(useGameStore().winnerId).toBe(2)
    })
  })
})
