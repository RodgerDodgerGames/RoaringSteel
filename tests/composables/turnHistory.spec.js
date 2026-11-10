/**
 * Turn History Tests
 *
 * The turn history in words: a turn as one sentence (the summary), a turn as
 * a line per thing done (the full history), and the track a turn built, read
 * off the board with the towns each section joined.
 */

import { describe, it, expect } from 'vitest'
import { sectionsBuilt, summarizeTurn, turnLines } from '@/composables/turnHistory'
import { townsByKey } from '@/composables/townEntry'

const names = { 1: 'Ann', 2: 'Bo', 3: 'Cy' }
const nameOf = (id) => names[id]

/** A turn of Ann's in round 4, doing the given things */
const turn = (events, extra = {}) => ({ round: 4, playerId: 1, events, won: false, ...extra })

describe('turnHistory', () => {
  describe('summarizeTurn', () => {
    it("should tell the train's business in order, then where it ended up", () => {
      const text = summarizeTurn(
        turn([
          { type: 'move', town: 'Pueblo', arrived: true, paid: [] },
          { type: 'deliver', industry: 'Coal', town: 'Pueblo', payoff: 12000 },
          { type: 'pickup', industry: 'Beef', town: 'Pueblo' },
          { type: 'move', town: 'Denver', arrived: false, paid: [] }
        ]),
        nameOf
      )

      expect(text).toBe(
        'Ann delivered Coal to Pueblo for $12,000, picked up Beef in Pueblo, and headed for Denver.'
      )
    })

    it('should leave out a run whose last stop already names the town', () => {
      const text = summarizeTurn(
        turn([
          { type: 'move', town: 'Pueblo', arrived: true, paid: [] },
          { type: 'drop', industry: 'Wine', town: 'Pueblo' }
        ]),
        nameOf
      )

      expect(text).toBe('Ann dropped Wine in Pueblo.')
    })

    it('should add up the track fees paid to each player over the turn', () => {
      const text = summarizeTurn(
        turn([
          { type: 'move', town: 'Pueblo', arrived: false, paid: [{ ownerId: 2, amount: 1000 }] },
          {
            type: 'move',
            town: 'Pueblo',
            arrived: true,
            paid: [
              { ownerId: 2, amount: 1000 },
              { ownerId: 3, amount: 1000 }
            ]
          }
        ]),
        nameOf
      )

      expect(text).toBe('Ann ran to Pueblo and paid Bo $2,000 and Cy $1,000 in track fees.')
    })

    it("should add up the turn's track into one figure, with every town it reached", () => {
      const text = summarizeTurn(
        turn([
          { type: 'build', cost: 5000, reached: ['Denver'] },
          { type: 'build', cost: 3000, reached: [] },
          { type: 'build', cost: 2000, reached: ['Boulder', 'Golden'] }
        ]),
        nameOf
      )

      expect(text).toBe('Ann built $10,000 of track, reaching Denver, Boulder, and Golden.')
    })

    it('should tell an upgrade, with the train it replaced', () => {
      const text = summarizeTurn(
        turn([{ type: 'upgrade', from: 'Freight', to: 'Fast Freight' }]),
        nameOf
      )

      expect(text).toBe('Ann upgraded their Freight to a Fast Freight.')
    })

    it('should tell a turn spent throwing in the hand as only that', () => {
      expect(summarizeTurn(turn([{ type: 'discard' }]), nameOf)).toBe(
        'Ann threw in their demand cards for new ones.'
      )
    })

    it('should say when a player did nothing', () => {
      expect(summarizeTurn(turn([]), nameOf)).toBe('Ann passed.')
    })

    it('should say when the turn won the game', () => {
      const text = summarizeTurn(
        turn([{ type: 'deliver', industry: 'Coal', town: 'Pueblo', payoff: 12000 }], { won: true }),
        nameOf
      )

      expect(text).toBe('Ann delivered Coal to Pueblo for $12,000, and won the game!')
    })
  })

  describe('turnLines', () => {
    it('should give a line for each thing done, in order', () => {
      const lines = turnLines(
        turn([
          { type: 'place', town: 'Pueblo' },
          { type: 'move', town: 'Denver', arrived: true, paid: [{ ownerId: 2, amount: 1000 }] },
          { type: 'move', town: 'Boulder', arrived: false, paid: [] },
          { type: 'build', cost: 5000, reached: ['Golden'] },
          { type: 'build', cost: 3000, reached: [] }
        ]),
        nameOf
      )

      expect(lines).toEqual([
        'Put the train in Pueblo',
        'Ran to Denver, paying Bo $1,000 in track fees',
        'Headed for Boulder, stopping short',
        'Built $5,000 of track, reaching Golden',
        'Built $3,000 of track'
      ])
    })

    it('should end with the win, for a winning turn', () => {
      expect(turnLines(turn([], { won: true }), nameOf)).toEqual(['Won the game!'])
    })

    it('should say when a player did nothing', () => {
      expect(turnLines(turn([]), nameOf)).toEqual(['Passed'])
    })
  })

  describe('sectionsBuilt', () => {
    // Towns along the equator, a degree apart
    const towns = ['West', 'Middle', 'East', 'Far'].map((name, i) => ({
      name,
      lat: 0,
      lon: i,
      size: 'small'
    }))
    const byKey = townsByKey(towns)
    const at = (name) => ({ lat: 0, lng: towns.findIndex((t) => t.name === name) })
    const section = (turn, cost, ...stops) => ({ turn, cost, coordinates: stops.map(at) })

    it("should give only the round's sections, each with what it cost", () => {
      const segments = [section(2, 4000, 'West', 'Middle'), section(3, 6000, 'Middle', 'East')]

      expect(sectionsBuilt(segments, 3, byKey)).toEqual([
        { type: 'build', cost: 6000, reached: ['East'] }
      ])
    })

    it('should not count a town reached already, in an earlier turn or this one', () => {
      const segments = [
        section(2, 4000, 'West', 'Middle'),
        section(3, 6000, 'Middle', 'East', 'Far'),
        // Back into Far from the other side: nothing new
        section(3, 1000, 'Far', 'East')
      ]

      expect(sectionsBuilt(segments, 3, byKey)).toEqual([
        { type: 'build', cost: 6000, reached: ['East', 'Far'] },
        { type: 'build', cost: 1000, reached: [] }
      ])
    })

    it('should count the town a first section starts from', () => {
      expect(sectionsBuilt([section(0, 4000, 'West', 'Middle')], 0, byKey)).toEqual([
        { type: 'build', cost: 4000, reached: ['West', 'Middle'] }
      ])
    })

    it('should give nothing for a round with no building', () => {
      expect(sectionsBuilt([section(2, 4000, 'West', 'Middle')], 5, byKey)).toEqual([])
    })
  })
})
