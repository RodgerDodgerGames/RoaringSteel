/**
 * Train Status Tests
 *
 * The words the dock uses for where a train is and where it is heading: how
 * long a run takes ("this turn", "2 turns"), and the whereabouts sentence,
 * in a town or stopped on the track, with or without a heading (a town or a
 * point on the track), and with a heading no track leads to any more; and
 * the same sentence in pieces, with every town it names marked so the Train
 * section can set the names in the board's style.
 */

import { describe, it, expect } from 'vitest'
import {
  turnsText,
  spacesText,
  whereabouts,
  whereaboutsParts,
  trackPointName,
  trackPointTitle
} from '@/composables/trainStatus'

const omaha = { name: 'Omaha' }
const denver = { name: 'Denver' }

/** A heading to Denver that takes some turns */
const toDenver = (turns, runsNow) => ({ town: denver, route: { turns, runsNow } })

describe('trainStatus', () => {
  describe('turnsText', () => {
    it('should say "this turn" for a run that ends this turn', () => {
      expect(turnsText({ turns: 1, runsNow: true })).toBe('this turn')
    })

    it('should count turns when the first is not this one', () => {
      expect(turnsText({ turns: 1, runsNow: false })).toBe('1 turn')
    })

    it('should count more than one turn in the plural', () => {
      expect(turnsText({ turns: 3, runsNow: true })).toBe('3 turns')
    })
  })

  describe('spacesText', () => {
    it('should give a distance in spaces, rounded up to a tenth', () => {
      expect(spacesText(23.01, 10)).toBe('2.4 spaces')
    })

    it('should say "1 space", not "1 spaces"', () => {
      expect(spacesText(10, 10)).toBe('1 space')
    })
  })

  describe('trackPointName', () => {
    it('should name a point by the town nearest it', () => {
      expect(trackPointName({ near: omaha, isEnd: false })).toBe('the track near Omaha')
    })

    it('should call an end of the line one', () => {
      expect(trackPointName({ near: omaha, isEnd: true })).toBe('the end of the line near Omaha')
    })

    it('should do without a town when no track leads to one', () => {
      expect(trackPointName({ near: null, isEnd: false })).toBe('a point on the track')
      expect(trackPointName({ near: null, isEnd: true })).toBe('the end of the line')
    })
  })

  describe('trackPointTitle', () => {
    it('should name a point on its own, without "the" or "a"', () => {
      expect(trackPointTitle({ near: omaha, isEnd: true })).toBe('End of the line near Omaha')
      expect(trackPointTitle({ near: omaha, isEnd: false })).toBe('Track near Omaha')
      expect(trackPointTitle({ near: null, isEnd: false })).toBe('Point on the track')
    })
  })

  describe('whereabouts', () => {
    it('should say a train not placed is not on the board', () => {
      expect(whereabouts({ placed: false, town: null, heading: null })).toBe('Not on the board yet')
    })

    it('should name the town a train with no heading is in', () => {
      expect(whereabouts({ placed: true, town: omaha, heading: null })).toBe('In Omaha')
    })

    it('should say how far by track a train stopped on the line is from the nearest town', () => {
      const nearest = { town: omaha, km: 24 }
      expect(
        whereabouts({ placed: true, town: null, heading: null, nearest, speedUnitKm: 10 })
      ).toBe('Stopped on the track 2.4 spaces away from Omaha')
    })

    it('should say "1 space", not "1 spaces"', () => {
      const nearest = { town: omaha, km: 10 }
      expect(
        whereabouts({ placed: true, town: null, heading: null, nearest, speedUnitKm: 10 })
      ).toBe('Stopped on the track 1 space away from Omaha')
    })

    it('should say only "Stopped on the track" when no track leads to a town', () => {
      expect(whereabouts({ placed: true, town: null, heading: null })).toBe('Stopped on the track')
    })

    it('should give the heading, not the nearest town, for a train on its way', () => {
      const nearest = { town: omaha, km: 24 }
      expect(
        whereabouts({
          placed: true,
          town: null,
          heading: toDenver(2, true),
          nearest,
          speedUnitKm: 10
        })
      ).toBe('Heading toward Denver, expected to arrive in 2 turns')
    })

    it('should say where a train between towns is heading, and when it gets there', () => {
      expect(whereabouts({ placed: true, town: null, heading: toDenver(2, true) })).toBe(
        'Heading toward Denver, expected to arrive in 2 turns'
      )
      expect(whereabouts({ placed: true, town: null, heading: toDenver(1, true) })).toBe(
        'Heading toward Denver, expected to arrive this turn'
      )
    })

    it('should name both the town a train is in and the one it is heading for', () => {
      expect(whereabouts({ placed: true, town: omaha, heading: toDenver(1, false) })).toBe(
        'In Omaha, heading toward Denver (1 turn)'
      )
    })

    it('should name a point on the track a train is heading for by its nearest town', () => {
      const heading = {
        town: null,
        point: { near: denver, isEnd: true },
        route: { turns: 2, runsNow: true }
      }

      expect(whereabouts({ placed: true, town: null, heading })).toBe(
        'Heading toward the end of the line near Denver, expected to arrive in 2 turns'
      )
    })

    it('should say when no track leads to the heading any more', () => {
      const lost = { town: denver, route: null }

      expect(whereabouts({ placed: true, town: null, heading: lost })).toBe(
        'Heading toward Denver, but no track leads there now'
      )
      expect(whereabouts({ placed: true, town: omaha, heading: lost })).toBe(
        'In Omaha, heading toward Denver, but no track leads there now'
      )
    })
  })

  describe('whereaboutsParts', () => {
    /** The pieces marked as town names, in order */
    const townsIn = (parts) => parts.filter(({ isTown }) => isTown).map(({ text }) => text)

    it('should mark the town a train is in', () => {
      expect(townsIn(whereaboutsParts({ placed: true, town: omaha, heading: null }))).toEqual([
        'Omaha'
      ])
    })

    it('should mark both the town a train is in and the one it is heading for', () => {
      const parts = whereaboutsParts({ placed: true, town: omaha, heading: toDenver(1, false) })

      expect(townsIn(parts)).toEqual(['Omaha', 'Denver'])
    })

    it('should mark the nearest town of a train stopped on the line', () => {
      const nearest = { town: omaha, km: 24 }
      const parts = whereaboutsParts({
        placed: true,
        town: null,
        heading: null,
        nearest,
        speedUnitKm: 10
      })

      expect(townsIn(parts)).toEqual(['Omaha'])
    })

    it('should mark the town a point on the track is named by', () => {
      const heading = {
        town: null,
        point: { near: denver, isEnd: false },
        route: { turns: 1, runsNow: true }
      }

      expect(townsIn(whereaboutsParts({ placed: true, town: null, heading }))).toEqual(['Denver'])
    })

    it('should mark nothing when no town is named', () => {
      expect(townsIn(whereaboutsParts({ placed: false, town: null, heading: null }))).toEqual([])
      expect(townsIn(whereaboutsParts({ placed: true, town: null, heading: null }))).toEqual([])
    })
  })
})
