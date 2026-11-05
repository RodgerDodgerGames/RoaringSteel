/**
 * Board Scale Tests
 *
 * A board's size is the square root of its area. Its size sets how many
 * turns a speed-9 train takes to cross it, read off anchor points in the
 * settings along a power curve, and from that its speed unit: the distance a
 * train covers per point of speed per turn.
 */

import { describe, it, expect } from 'vitest'
import { boardSizeKm, turnsToCross, boardScaleFor, formatDistance } from '@/composables/boardScale'
import { boardConfig } from '@/config/board'

/** A square region `degrees` on a side, sitting on the equator */
const square = (west, degrees) => ({
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [west, 0],
        [west + degrees, 0],
        [west + degrees, degrees],
        [west, degrees],
        [west, 0]
      ]
    ]
  }
})

// A degree near the equator is about 111 km each way
const KM_PER_DEGREE = 111.2

const ANCHORS = [
  { sizeKm: 250, turns: 6 },
  { sizeKm: 519, turns: 10 },
  { sizeKm: 1240, turns: 15 }
]

describe('boardScale', () => {
  describe('boardSizeKm', () => {
    it('should be the side of a square region', () => {
      expect(boardSizeKm(square(0, 2))).toBeCloseTo(2 * KM_PER_DEGREE, -1)
    })

    it('should add up the area of every part of a region', () => {
      const twoSquares = { type: 'FeatureCollection', features: [square(0, 1), square(5, 1)] }

      // Two equal squares: the area doubles, the size grows by √2
      expect(boardSizeKm(twoSquares)).toBeCloseTo(Math.SQRT2 * boardSizeKm(square(0, 1)), 6)
    })

    it('should be 0 for no region', () => {
      expect(boardSizeKm(null)).toBe(0)
    })
  })

  describe('turnsToCross', () => {
    it('should give each anchor its own number of turns', () => {
      ANCHORS.forEach(({ sizeKm, turns }) => {
        expect(turnsToCross(sizeKm, ANCHORS)).toBeCloseTo(turns, 10)
      })
    })

    it('should take more turns on a bigger board, but fewer than in proportion', () => {
      const small = turnsToCross(300, ANCHORS)
      const big = turnsToCross(600, ANCHORS)

      expect(big).toBeGreaterThan(small)
      expect(big).toBeLessThan(2 * small)
    })

    it('should follow a power curve between anchors', () => {
      // Halfway between two anchors on a log scale is halfway in turns on a
      // log scale too: the geometric means match
      const between = Math.sqrt(250 * 519)

      expect(turnsToCross(between, ANCHORS)).toBeCloseTo(Math.sqrt(6 * 10), 10)
    })

    it('should carry the curve of the nearest two anchors past either end', () => {
      // On a power curve each doubling multiplies the turns by the same amount
      const turns = (size) => turnsToCross(size, ANCHORS)

      expect(turns(4960) / turns(2480)).toBeCloseTo(turns(2480) / turns(1240), 10)
      expect(turns(125) / turns(62.5)).toBeCloseTo(turns(250) / turns(125), 10)
    })

    it('should not care what order the anchors are listed in', () => {
      const shuffled = [ANCHORS[2], ANCHORS[0], ANCHORS[1]]

      expect(turnsToCross(400, shuffled)).toBeCloseTo(turnsToCross(400, ANCHORS), 10)
    })

    it('should read the anchors from the settings by default', () => {
      const [{ sizeKm, turns }] = boardConfig.turnsToCross

      expect(turnsToCross(sizeKm)).toBeCloseTo(turns, 10)
    })
  })

  describe('boardScaleFor', () => {
    it('should let a reference-speed train cross the board in its turns', () => {
      const scale = boardScaleFor(square(0, 3))

      expect(boardConfig.referenceSpeed * scale.speedUnitKm * scale.turnsToCross).toBeCloseTo(
        scale.sizeKm,
        6
      )
    })

    it('should give a smaller board a shorter speed unit and fewer turns', () => {
      const small = boardScaleFor(square(0, 2))
      const big = boardScaleFor(square(0, 8))

      expect(small.speedUnitKm).toBeLessThan(big.speedUnitKm)
      expect(small.turnsToCross).toBeLessThan(big.turnsToCross)
    })

    it('should play a game with no region at the fallback size', () => {
      expect(boardScaleFor(null).sizeKm).toBe(boardConfig.fallbackSizeKm)
    })
  })

  describe('formatDistance', () => {
    it('should give a distance in speed points, not km', () => {
      expect(formatDistance(50, 5, 'up')).toBe('10')
    })

    it('should round a distance to cover up, to the tenth', () => {
      expect(formatDistance(50.8, 5, 'up')).toBe('10.2')
    })

    it('should round a distance left down, to the tenth', () => {
      expect(formatDistance(49.6, 5, 'down')).toBe('9.9')
    })

    it('should only show a town as within reach when the train can reach it', () => {
      // Every pair of distances, in 0.1 km steps: whenever the town is shown
      // no further than the distance left, it really is no further
      for (let leftKm = 40; leftKm <= 50; leftKm += 0.1) {
        for (let awayKm = 40; awayKm <= 50; awayKm += 0.1) {
          const shownLeft = Number(formatDistance(leftKm, 5.77, 'down'))
          const shownAway = Number(formatDistance(awayKm, 5.77, 'up'))
          if (shownAway <= shownLeft) expect(awayKm).toBeLessThanOrEqual(leftKm + 1e-9)
        }
      }
    })

    it('should not let floating-point noise push a whole distance up or down', () => {
      const km = 0.1 * 3 * 5.77

      expect(formatDistance(km, 5.77, 'up')).toBe('0.3')
      expect(formatDistance(km, 5.77, 'down')).toBe('0.3')
    })
  })
})
