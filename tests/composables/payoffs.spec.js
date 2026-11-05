/**
 * Payoff Tests
 *
 * A demand pays by how far its commodity has to come: the straight-line
 * distance from the nearest town producing it, at gameRules.payoffs.perKm,
 * times a long-haul bonus that grows exponentially with the haul's share of
 * the map's span, rounded, and never under the minimum.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { haulKm, mapSpanKm, longHaulMultiplier, demandPayoff } from '@/composables/payoffs'
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
  // The bonus and its steepness are tuning knobs, so pin them for these
  // tests: they check the rule's shape, not whatever the knobs are set to today
  const tuned = { ...gameRules.payoffs.longHaul }
  beforeEach(() => {
    Object.assign(gameRules.payoffs.longHaul, { maxBonus: 1, steepness: 2 })
  })
  afterEach(() => {
    Object.assign(gameRules.payoffs.longHaul, tuned)
  })

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

  describe('mapSpanKm', () => {
    it('should measure between the two towns furthest apart', () => {
      // Greeley is 1 degree north of Denver and Pueblo 2 degrees south
      expect(mapSpanKm([denver, near, far])).toBeCloseTo(3 * KM_PER_DEGREE, 0)
    })

    it('should be 0 with fewer than two towns', () => {
      expect(mapSpanKm([denver])).toBe(0)
      expect(mapSpanKm([])).toBe(0)
    })
  })

  describe('longHaulMultiplier', () => {
    const span = 1000

    it('should add nothing to a haul of no length', () => {
      expect(longHaulMultiplier(0, span)).toBe(1)
    })

    it('should give the full bonus to a haul across the whole map', () => {
      expect(longHaulMultiplier(span, span)).toBeCloseTo(2, 10)
    })

    it('should hold most of the bonus back for the longest hauls', () => {
      // The exponential shape: a half-map haul earns well under half the bonus
      expect(longHaulMultiplier(span / 2, span)).toBeGreaterThan(1)
      expect(longHaulMultiplier(span / 2, span)).toBeLessThan(1.5)
    })

    it('should climb faster the longer the haul', () => {
      // Each further quarter of the map adds more bonus than the one before
      const quarters = [0, 1, 2, 3, 4].map((q) => longHaulMultiplier((q * span) / 4, span))
      const steps = quarters.slice(1).map((value, i) => value - quarters[i])

      steps.slice(1).forEach((step, i) => expect(step).toBeGreaterThan(steps[i]))
    })

    it('should hold more back for the longest hauls when steeper', () => {
      const gentle = longHaulMultiplier(span / 2, span)
      gameRules.payoffs.longHaul.steepness = 4

      expect(longHaulMultiplier(span / 2, span)).toBeLessThan(gentle)
      expect(longHaulMultiplier(span, span)).toBeCloseTo(2, 10)
    })

    it('should grow in a straight line at a steepness of 0', () => {
      gameRules.payoffs.longHaul.steepness = 0

      expect(longHaulMultiplier(span / 4, span)).toBeCloseTo(1.25, 10)
      expect(longHaulMultiplier(span, span)).toBe(2)
    })

    it('should meet the straight line smoothly as steepness shrinks toward 0', () => {
      gameRules.payoffs.longHaul.steepness = 1e-6

      expect(longHaulMultiplier(span / 4, span)).toBeCloseTo(1.25, 5)
    })

    it('should use the straight line for a negative steepness', () => {
      gameRules.payoffs.longHaul.steepness = -2

      expect(longHaulMultiplier(span / 4, span)).toBeCloseTo(1.25, 10)
    })

    it('should not pay past the full bonus for a haul longer than the span', () => {
      expect(longHaulMultiplier(2 * span, span)).toBeCloseTo(2, 10)
    })

    it('should scale with the configured bonus', () => {
      gameRules.payoffs.longHaul.maxBonus = 2

      expect(longHaulMultiplier(span, span)).toBeCloseTo(3, 10)
    })

    it('should add nothing when the bonus is turned off', () => {
      gameRules.payoffs.longHaul.maxBonus = 0

      expect(longHaulMultiplier(span, span)).toBe(1)
    })

    it('should add nothing on a map with no span', () => {
      expect(longHaulMultiplier(0, 0)).toBe(1)
    })
  })

  describe('demandPayoff', () => {
    const towns = [denver, near, far]
    const spanKm = mapSpanKm(towns)

    it('should pay the per-km rate times the full bonus for a haul across the whole map', () => {
      // With only Denver and Pueblo, the Steel haul is the map's whole span
      const { perKm, roundTo } = gameRules.payoffs
      const km = 2 * KM_PER_DEGREE
      const expected = Math.round((km * perKm * 2) / roundTo) * roundTo

      expect(demandPayoff(denver, 'Steel', [denver, far], mapSpanKm([denver, far]))).toBe(expected)
    })

    it('should pay more for a commodity that has to come further', () => {
      expect(demandPayoff(denver, 'Steel', towns, spanKm)).toBeGreaterThan(
        demandPayoff(denver, 'Beef', towns, spanKm)
      )
    })

    it('should pay more per km for a longer haul', () => {
      // Steel comes twice as far as Beef, so it pays more than twice as much
      expect(demandPayoff(denver, 'Steel', towns, spanKm)).toBeGreaterThan(
        2 * demandPayoff(denver, 'Beef', towns, spanKm)
      )
    })

    it('should never pay less than the minimum, however close the producer', () => {
      const nextDoor = town('Aurora', 39.71, ['Beef'])

      const map = [denver, nextDoor]

      expect(demandPayoff(denver, 'Beef', map, mapSpanKm(map))).toBe(gameRules.payoffs.minimum)
    })

    it('should pay the minimum when nothing else produces the commodity', () => {
      expect(demandPayoff(denver, 'Wine', [denver], 0)).toBe(gameRules.payoffs.minimum)
    })
  })
})
