/**
 * Payoff Tests
 *
 * A demand pays by how far its commodity has to come: the straight-line
 * distance from the nearest town producing it, at gameRules.payoffs.perKm,
 * rounded, and never under the minimum.
 */

import { describe, it, expect } from 'vitest'
import { haulKm, demandPayoff } from '@/composables/payoffs'
import { gameRules } from '@/config/game'

// Along one meridian a degree of latitude is about 111.2 km, so towns placed
// on it sit a known distance apart
const KM_PER_DEGREE = 111.19

const town = (name, lat, industries = []) => ({
  name,
  lat,
  lon: -105,
  industries: industries.map((industryName) => ({ name: industryName }))
})

describe('payoffs', () => {
  const denver = town('Denver', 39.7)
  const near = town('Greeley', 40.7, ['Beef']) // 1 degree north
  const far = town('Pueblo', 37.7, ['Beef', 'Steel']) // 2 degrees south

  describe('haulKm', () => {
    it('should measure from the nearest town producing the commodity', () => {
      expect(haulKm(denver, 'Beef', [denver, near, far])).toBeCloseTo(KM_PER_DEGREE, 0)
    })

    it('should use a farther producer when it is the only one', () => {
      expect(haulKm(denver, 'Steel', [denver, near, far])).toBeCloseTo(2 * KM_PER_DEGREE, 0)
    })

    it('should not count the destination itself as a producer', () => {
      const steelTown = town('Steeltown', 39.7, ['Steel'])

      expect(haulKm(steelTown, 'Steel', [steelTown, far])).toBeCloseTo(2 * KM_PER_DEGREE, 0)
    })

    it('should give null when no other town produces the commodity', () => {
      expect(haulKm(denver, 'Wine', [denver, near, far])).toBeNull()
    })
  })

  describe('demandPayoff', () => {
    it('should pay per km from the nearest producer, rounded', () => {
      const { perKm, roundTo } = gameRules.payoffs
      const expected = Math.round((KM_PER_DEGREE * perKm) / roundTo) * roundTo

      expect(demandPayoff(denver, 'Beef', [denver, near, far])).toBe(expected)
    })

    it('should pay more for a commodity that has to come further', () => {
      const towns = [denver, near, far]

      expect(demandPayoff(denver, 'Steel', towns)).toBeGreaterThan(
        demandPayoff(denver, 'Beef', towns)
      )
    })

    it('should never pay less than the minimum, however close the producer', () => {
      const nextDoor = town('Aurora', 39.71, ['Beef'])

      expect(demandPayoff(denver, 'Beef', [denver, nextDoor])).toBe(gameRules.payoffs.minimum)
    })

    it('should pay the minimum when nothing else produces the commodity', () => {
      expect(demandPayoff(denver, 'Wine', [denver])).toBe(gameRules.payoffs.minimum)
    })
  })
})
