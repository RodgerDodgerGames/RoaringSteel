/**
 * Turn Order Tests
 *
 * The switchback start: two building rounds, the first played from the first
 * player to the last and the second back again, then normal rounds from the
 * first player to the last. Players are numbered by their place in turn
 * order, from 0.
 */

import { describe, it, expect } from 'vitest'
import { isBuildingRound, turnAfter } from '@/composables/turnOrder'

describe('turnOrder', () => {
  describe('isBuildingRound', () => {
    it('should make the first two rounds building rounds, and no others', () => {
      expect([0, 1, 2, 3].map(isBuildingRound)).toEqual([true, true, false, false])
    })
  })

  describe('turnAfter', () => {
    it('should pass play from the first player toward the last in the first round', () => {
      expect(turnAfter(0, 3, 0)).toEqual({ nextPlace: 1, endsRound: false })
    })

    it('should give the last player a second turn in a row to open the second round', () => {
      expect(turnAfter(2, 3, 0)).toEqual({ nextPlace: 2, endsRound: true })
    })

    it('should pass play back toward the first player in the second round', () => {
      expect(turnAfter(2, 3, 1)).toEqual({ nextPlace: 1, endsRound: false })
      expect(turnAfter(1, 3, 1)).toEqual({ nextPlace: 0, endsRound: false })
    })

    it('should end the building rounds with the first player, who then opens normal play', () => {
      expect(turnAfter(0, 3, 1)).toEqual({ nextPlace: 0, endsRound: true })
    })

    it('should run normal rounds from the first player to the last, and wrap', () => {
      expect(turnAfter(0, 3, 2)).toEqual({ nextPlace: 1, endsRound: false })
      expect(turnAfter(2, 3, 2)).toEqual({ nextPlace: 0, endsRound: true })
      expect(turnAfter(2, 3, 5)).toEqual({ nextPlace: 0, endsRound: true })
    })

    it("should start with the round's first player when nobody holds the turn", () => {
      expect(turnAfter(-1, 3, 0)).toEqual({ nextPlace: 0, endsRound: false })
      // The second round is played from the last player
      expect(turnAfter(-1, 3, 1)).toEqual({ nextPlace: 2, endsRound: false })
    })

    it('should end every round on each turn in a solo game', () => {
      expect(turnAfter(0, 1, 0)).toEqual({ nextPlace: 0, endsRound: true })
      expect(turnAfter(0, 1, 1)).toEqual({ nextPlace: 0, endsRound: true })
    })

    it('should have nobody to pass to with no players', () => {
      expect(turnAfter(-1, 0, 0)).toBeNull()
    })
  })
})
