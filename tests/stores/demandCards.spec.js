/**
 * Demand Cards Store Tests
 *
 * Every player holds a hand of three demand cards, dealt from the deck. These
 * tests cover building the deck, dealing hands from it, and restoring both
 * from a save — including saves made before hands existed, which carried only
 * a bare list of cards.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDemandCardsStore, HAND_SIZE } from '@/stores/demandCards'
import { useTownsStore } from '@/stores/towns'

/**
 * A card with an id and placeholder contracts, for tests that only care
 * which card ends up where.
 * @param {number} id - The card's id
 * @returns {Object} A demand card
 */
function card(id) {
  return {
    id,
    demands: [
      { destination: `Town ${id}A`, industry: 'Coal', payoff: 10 },
      { destination: `Town ${id}B`, industry: 'Beef', payoff: 20 },
      { destination: `Town ${id}C`, industry: 'Wine', payoff: 30 }
    ]
  }
}

/**
 * A deck of cards numbered 1..count, top of the deck first.
 * @param {number} count - How many cards
 * @returns {Array} The cards
 */
function deckOf(count) {
  return Array.from({ length: count }, (_, i) => card(i + 1))
}

/** Ids of the cards in a hand, for compact assertions */
const idsOf = (cards) => cards.map((c) => c.id)

describe('demandCards store', () => {
  let store

  beforeEach(() => {
    // Deck generation and dealing log progress; keep test output readable
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    store = useDemandCardsStore()
  })

  describe('generateDemandCards', () => {
    /** Four towns, each producing something no other town does */
    const towns = [
      { name: 'Denver', lat: 39.7, lon: -105.0, industries: [{ name: 'Coal' }] },
      { name: 'Pueblo', lat: 38.3, lon: -104.6, industries: [{ name: 'Steel' }] },
      { name: 'Greeley', lat: 40.4, lon: -104.7, industries: [{ name: 'Beef' }] },
      { name: 'Aspen', lat: 39.2, lon: -106.8, industries: [{ name: 'Tourism' }] }
    ]

    beforeEach(() => {
      useTownsStore().setTowns(towns)
    })

    it('should build a deck of six cards per town, each with a unique id', () => {
      store.generateDemandCards()

      expect(store.drawPile).toHaveLength(towns.length * 6)
      expect(new Set(idsOf(store.drawPile)).size).toBe(store.drawPile.length)
    })

    it('should give every card three contracts', () => {
      store.generateDemandCards()

      store.drawPile.forEach((c) => expect(c.demands).toHaveLength(3))
    })

    it('should clear the hands left over from a previous game', () => {
      store.setDeck({ drawPile: deckOf(5), hands: { 1: [card(99)] } })

      store.generateDemandCards()

      expect(store.handOf(1)).toEqual([])
    })

    it('should not leave the last deck to be dealt from when there are no towns', () => {
      useTownsStore().setTowns([])
      store.setDeck({ drawPile: deckOf(5), hands: { 1: [card(99)] } })

      store.generateDemandCards()

      expect(store.drawPile).toEqual([])
      expect(store.handOf(1)).toEqual([])
    })
  })

  describe('dealHands', () => {
    it('should deal every player a full hand from the top of the deck', () => {
      store.setDeck({ drawPile: deckOf(10) })

      store.dealHands([1, 2, 3])

      // One card each per pass round the table, as at a real deal
      expect(idsOf(store.handOf(1))).toEqual([1, 4, 7])
      expect(idsOf(store.handOf(2))).toEqual([2, 5, 8])
      expect(idsOf(store.handOf(3))).toEqual([3, 6, 9])
    })

    it('should take the dealt cards out of the deck', () => {
      store.setDeck({ drawPile: deckOf(10) })

      store.dealHands([1, 2, 3])

      expect(idsOf(store.drawPile)).toEqual([10])
    })

    it('should not deal to a player who already holds a full hand', () => {
      store.setDeck({ drawPile: deckOf(5), hands: { 1: [card(91), card(92), card(93)] } })

      store.dealHands([1, 2])

      expect(idsOf(store.handOf(1))).toEqual([91, 92, 93])
      expect(store.handOf(2)).toHaveLength(HAND_SIZE)
      expect(store.drawPile).toHaveLength(2)
    })

    it('should top up a short hand rather than replace it', () => {
      store.setDeck({ drawPile: deckOf(5), hands: { 1: [card(91)] } })

      store.dealHands([1])

      expect(idsOf(store.handOf(1))).toEqual([91, 1, 2])
    })

    it('should share out a short deck evenly between the players', () => {
      store.setDeck({ drawPile: deckOf(4) })

      store.dealHands([1, 2])

      expect(store.handOf(1)).toHaveLength(2)
      expect(store.handOf(2)).toHaveLength(2)
      expect(store.drawPile).toHaveLength(0)
    })
  })

  describe('handOf', () => {
    it('should return an empty hand for a player who has not been dealt one', () => {
      expect(store.handOf(42)).toEqual([])
    })

    it('should find a hand whose player id came back from a save as a string key', () => {
      // JSON turns numeric object keys into strings
      store.setDeck(JSON.parse(JSON.stringify({ drawPile: [], hands: { 2: [card(7)] } })))

      expect(idsOf(store.handOf(2))).toEqual([7])
    })
  })

  describe('setDeck', () => {
    it('should restore the deck and hands from a save', () => {
      store.setDeck({ drawPile: deckOf(2), hands: { 1: [card(5)] } })

      expect(idsOf(store.drawPile)).toEqual([1, 2])
      expect(idsOf(store.handOf(1))).toEqual([5])
    })

    it('should give ids to cards from a save made before hands existed', () => {
      // Old saves held each card as a bare list of its three contracts
      const oldCard = card(0).demands

      store.setDeck({ drawPile: [oldCard, oldCard] })

      expect(store.drawPile).toEqual([
        { id: 1, demands: oldCard },
        { id: 2, demands: oldCard }
      ])
    })

    it('should refuse a deck with no draw pile and leave the store alone', () => {
      store.setDeck({ drawPile: deckOf(3) })

      expect(store.setDeck({ hands: {} })).toBe(false)

      expect(store.drawPile).toHaveLength(3)
    })
  })

  describe('reset', () => {
    it('should empty the deck and every hand', () => {
      store.setDeck({ drawPile: deckOf(3), hands: { 1: [card(9)] } })

      store.reset()

      expect(store.drawPile).toEqual([])
      expect(store.handOf(1)).toEqual([])
    })
  })
})
