/**
 * Bot Planner Tests
 *
 * The computer player's decisions, on plain data: which demand to work
 * toward, what to load and drop, where to run the train, when to upgrade.
 */

import { describe, it, expect } from 'vitest'
import {
  upgradeFor,
  demandLines,
  demandOptions,
  loadsToPickUp,
  loadsToDrop,
  nextStop
} from '@/composables/bot/botPlanner'

const town = (name, industries = []) => ({
  name,
  msa: name.toLowerCase(),
  industries: industries.map((name) => ({ name }))
})

const coalTown = town('Coaltown', ['Coal'])
const steelTown = town('Steelton', ['Steel', 'Coal'])
const farTown = town('Faraway', ['Coal'])
const towns = [coalTown, steelTown, farTown]

const card = (id, ...demands) => ({
  id,
  demands: demands.map(([destination, industry, payoff = 10000]) => ({
    destination,
    industry,
    payoff
  }))
})

/** What track to each town would cost */
const costs = { Coaltown: 1000, Steelton: 2000, Faraway: 30000 }
const board = (overrides = {}) => ({
  towns,
  isJoined: () => false,
  costTo: (t) => costs[t.name],
  loads: [],
  cash: 40000,
  ...overrides
})

describe('botPlanner', () => {
  describe('upgradeFor', () => {
    it('should upgrade to a Fast Freight at $80,000 and a Superfreight at $140,000', () => {
      expect(upgradeFor('freight', 79999)).toBeNull()
      expect(upgradeFor('freight', 80000)).toBe('fastFreight')
      expect(upgradeFor('fastFreight', 139999)).toBeNull()
      expect(upgradeFor('fastFreight', 140000)).toBe('superfreight')
      expect(upgradeFor('superfreight', 1e9)).toBeNull()
    })
  })

  describe('demandOptions', () => {
    it('should put the demand cheapest to connect first', () => {
      const lines = demandLines([card(1, ['Faraway', 'Steel']), card(2, ['Steelton', 'Coal'])])

      const [best, next] = demandOptions(lines, board())

      // Coal to Steelton from Coaltown: 2000 + 1000
      expect(best).toMatchObject({ cardId: 2, cost: 3000 })
      expect(best.toJoin.map(({ name }) => name)).toEqual(['Coaltown', 'Steelton'])
      // Steel to Faraway from Steelton: 30000 + 2000
      expect(next).toMatchObject({ cardId: 1, cost: 32000 })
    })

    it('should leave out a demand the player cannot afford to connect', () => {
      const lines = demandLines([card(1, ['Faraway', 'Steel'])])

      expect(demandOptions(lines, board({ cash: 31999 }))).toEqual([])
    })

    it('should leave out a demand that cannot be connected at all', () => {
      const lines = demandLines([card(1, ['Steelton', 'Gold'])])

      expect(demandOptions(lines, board())).toEqual([])
    })

    it('should not count the town that wants a load as its producer', () => {
      // Steelton makes Coal too, but Coal for Steelton must come from elsewhere
      const lines = demandLines([card(1, ['Steelton', 'Coal'])])

      const [option] = demandOptions(lines, board())

      expect(option.toJoin.map(({ name }) => name)).toContain('Coaltown')
    })

    it('should count towns already joined as free', () => {
      const lines = demandLines([card(1, ['Steelton', 'Coal'])])

      const [option] = demandOptions(lines, board({ isJoined: (t) => t === steelTown }))

      expect(option).toMatchObject({ cost: 1000 })
      expect(option.toJoin).toEqual([coalTown])
    })

    it('should need no producer for a load the train already carries', () => {
      const lines = demandLines([card(1, ['Faraway', 'Gold'])])

      const [option] = demandOptions(lines, board({ loads: ['Gold'] }))

      expect(option).toMatchObject({ cost: 30000 })
      expect(option.toJoin).toEqual([farTown])
    })

    it('should break a tie on the bigger payoff', () => {
      const lines = demandLines([
        card(1, ['Steelton', 'Coal', 5000]),
        card(2, ['Steelton', 'Coal', 9000])
      ])

      expect(demandOptions(lines, board())[0].cardId).toBe(2)
    })
  })

  describe('loadsToPickUp', () => {
    const joined = new Set(['Coaltown', 'Steelton'])
    const empty = { loads: [], capacity: 2 }

    it('should load what a demand wants delivered to a town on the network', () => {
      const lines = demandLines([card(1, ['Steelton', 'Coal'])])

      expect(loadsToPickUp(coalTown, empty, lines, joined)).toEqual(['Coal'])
    })

    it('should load one for each card that wants it, and no more', () => {
      const lines = demandLines([
        card(1, ['Steelton', 'Coal'], ['Faraway', 'Coal']),
        card(2, ['Steelton', 'Coal'])
      ])

      // Two cards want Coal; the train already has one
      expect(loadsToPickUp(coalTown, { loads: ['Coal'], capacity: 3 }, lines, joined)).toEqual([
        'Coal'
      ])
    })

    it('should not load more than the train holds', () => {
      const lines = demandLines([card(1, ['Steelton', 'Coal']), card(2, ['Steelton', 'Coal'])])

      expect(loadsToPickUp(coalTown, { loads: ['Beer'], capacity: 2 }, lines, joined)).toEqual([
        'Coal'
      ])
    })

    it('should not load for a town off the network', () => {
      const lines = demandLines([card(1, ['Faraway', 'Coal'])])

      expect(loadsToPickUp(coalTown, empty, lines, joined)).toEqual([])
    })

    it('should not load for a demand in the town it is loaded in', () => {
      const lines = demandLines([card(1, ['Steelton', 'Coal'])])

      expect(loadsToPickUp(steelTown, empty, lines, joined)).toEqual([])
    })
  })

  describe('loadsToDrop', () => {
    it('should drop only loads no demand wants anywhere', () => {
      const lines = demandLines([card(1, ['Faraway', 'Coal'])])

      expect(loadsToDrop(['Coal', 'Beer'], lines)).toEqual(['Beer'])
    })
  })

  describe('nextStop', () => {
    const joined = new Set(['Coaltown', 'Steelton', 'Faraway'])
    const stop = (t, km, payTo = []) => ({ town: t, km, payTo })

    it('should head for the nearest town where there is something to do', () => {
      const lines = demandLines([card(1, ['Steelton', 'Coal'])])
      const destinations = [stop(farTown, 10), stop(coalTown, 20), stop(steelTown, 30)]

      // Faraway is nearer but the empty train can only load Coal for Steelton there…
      expect(
        nextStop(destinations, { loads: [], capacity: 2, here: null }, lines, joined).town
      ).toBe(farTown)
      // …and with Coal aboard, the delivery is the only thing worth doing
      expect(
        nextStop(destinations, { loads: ['Coal'], capacity: 1, here: null }, lines, joined).town
      ).toBe(steelTown)
    })

    it("should not go anywhere that means paying for another player's track", () => {
      const lines = demandLines([card(1, ['Steelton', 'Coal'])])
      const destinations = [stop(steelTown, 10, [2])]

      expect(
        nextStop(destinations, { loads: ['Coal'], capacity: 2, here: null }, lines, joined)
      ).toBeNull()
    })

    it('should not go to a town off its own network', () => {
      const lines = demandLines([card(1, ['Steelton', 'Coal'])])
      const destinations = [stop(steelTown, 10)]

      expect(
        nextStop(destinations, { loads: ['Coal'], capacity: 2, here: null }, lines, new Set())
      ).toBeNull()
    })

    it('should stay put with nothing to do', () => {
      const lines = demandLines([card(1, ['Steelton', 'Gold'])])
      const destinations = [stop(coalTown, 10), stop(steelTown, 20)]

      expect(
        nextStop(destinations, { loads: [], capacity: 2, here: null }, lines, joined)
      ).toBeNull()
    })
  })
})
