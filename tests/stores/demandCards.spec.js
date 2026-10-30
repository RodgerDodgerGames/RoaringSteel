/**
 * Demand Cards Store Tests
 *
 * Every player holds a hand of three demand cards, dealt from the deck. These
 * tests cover building the deck, dealing hands from it, and restoring both
 * from a save.
 *
 * They also cover the demand lines a player picks out to see on the map:
 * pinned lines, each in its own color, and the line under the pointer.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { useDemandCardsStore, HAND_SIZE } from '@/stores/demandCards'
import { useTownsStore } from '@/stores/towns'
import { usePlayerStore } from '@/stores/players'
import { useSettingsStore } from '@/stores/settings'
import { PIN_COLORS } from '@/config/demands'

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
    // The pin limit is a setting remembered in the browser
    localStorage.clear()
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

  describe('pinned demand lines', () => {
    let playerStore

    /** Ann (player 1, whose turn it is) holds cards 1–3; Bo (player 2) holds 4–6 */
    beforeEach(() => {
      playerStore = usePlayerStore()
      playerStore.setPlayers([
        { id: 1, name: 'Ann', isTurn: true },
        { id: 2, name: 'Bo', isTurn: false }
      ])
      store.setDeck({
        drawPile: deckOf(0),
        hands: { 1: [card(1), card(2), card(3)], 2: [card(4), card(5), card(6)] }
      })
    })

    /** Passes the turn from Ann to Bo */
    function passTurnToBo() {
      playerStore.setPlayers([
        { id: 1, name: 'Ann', isTurn: false },
        { id: 2, name: 'Bo', isTurn: true }
      ])
    }

    /** The pins a player holds, as [cardId, line] pairs */
    const pinnedOf = (playerId) => store.pinsOf(playerId).map((pin) => [pin.cardId, pin.line])

    it('should pin a line in the hand of the player whose turn it is', () => {
      store.togglePin(2, 1)

      expect(pinnedOf(1)).toEqual([[2, 1]])
      expect(store.pinColor(1, 2, 1)).toBe(PIN_COLORS[0])
    })

    it('should unpin a pinned line when it is clicked again', () => {
      store.togglePin(2, 1)
      store.togglePin(2, 1)

      expect(pinnedOf(1)).toEqual([])
      expect(store.pinColor(1, 2, 1)).toBeNull()
    })

    it('should give each pinned line its own color', () => {
      store.togglePin(1, 0)
      store.togglePin(1, 2)
      store.togglePin(3, 1)

      expect([store.pinColor(1, 1, 0), store.pinColor(1, 1, 2), store.pinColor(1, 3, 1)]).toEqual(
        PIN_COLORS.slice(0, 3)
      )
    })

    it('should drop the oldest pin when one more line is pinned than the limit allows', () => {
      // The default limit is three
      store.togglePin(1, 0)
      store.togglePin(2, 0)
      store.togglePin(3, 0)

      store.togglePin(1, 1)

      expect(pinnedOf(1)).toEqual([
        [2, 0],
        [3, 0],
        [1, 1]
      ])
      // The new pin takes the color the dropped one gave up
      expect(store.pinColor(1, 1, 1)).toBe(PIN_COLORS[0])
    })

    it('should give a new pin the first color no other pin is using', () => {
      store.togglePin(1, 0)
      store.togglePin(2, 0)
      store.togglePin(1, 0)

      store.togglePin(3, 0)

      expect(store.pinColor(1, 3, 0)).toBe(PIN_COLORS[0])
    })

    it("should not pin a line from another player's hand", () => {
      // What a click on a hand being peeked at would ask for
      store.togglePin(4, 0)

      expect(pinnedOf(1)).toEqual([])
      expect(pinnedOf(2)).toEqual([])
    })

    it("should keep each player's pins to themselves, across turns", () => {
      store.togglePin(1, 0)
      passTurnToBo()

      store.togglePin(5, 2)

      expect(pinnedOf(1)).toEqual([[1, 0]])
      expect(pinnedOf(2)).toEqual([[5, 2]])
    })

    it('should drop the oldest pins when the limit is lowered', async () => {
      store.togglePin(1, 0)
      store.togglePin(2, 0)
      store.togglePin(3, 0)

      useSettingsStore().settings.pinLimit = 1
      await nextTick()

      expect(pinnedOf(1)).toEqual([[3, 0]])
    })

    it('should tell which color the next pin would get', () => {
      store.togglePin(1, 0)
      expect(store.nextPinColor(1)).toBe(PIN_COLORS[1])

      // At the limit, the next pin takes the oldest pin's color
      store.togglePin(2, 0)
      store.togglePin(3, 0)
      expect(store.nextPinColor(1)).toBe(PIN_COLORS[0])
    })

    it('should be cleared with the hands, so a new deck starts with none', () => {
      store.togglePin(1, 0)

      store.reset()

      expect(store.pinsOf(1)).toEqual([])
    })

    it('should be restored from a save', () => {
      const pins = { 1: [{ cardId: 2, line: 1, slot: 0 }] }

      store.setDeck({ drawPile: deckOf(0), hands: { 1: [card(2)] }, pins })

      expect(store.pinColor(1, 2, 1)).toBe(PIN_COLORS[0])
    })

    it('should leave out pins a damaged save cannot have meant', () => {
      const pins = {
        // Not a list of pins at all
        1: { cardId: 2, line: 1, slot: 0 },
        // A color past the end of the colors, a line past the end of a
        // card, and a good pin
        2: [
          { cardId: 4, line: 0, slot: PIN_COLORS.length },
          { cardId: 4, line: 3, slot: 1 },
          { cardId: 5, line: 2, slot: 2 }
        ]
      }

      store.setDeck({ drawPile: deckOf(0), hands: { 1: [card(2)], 2: [card(4), card(5)] }, pins })

      expect(pinnedOf(1)).toEqual([])
      expect(pinnedOf(2)).toEqual([[5, 2]])
      expect(store.markedLines.lines).toEqual([])
    })

    it('should start with none on a save made before pins existed', () => {
      store.togglePin(1, 0)

      store.setDeck({ drawPile: deckOf(0), hands: { 1: [card(1)] } })

      expect(store.pinsOf(1)).toEqual([])
    })
  })

  describe('marked lines', () => {
    beforeEach(() => {
      usePlayerStore().setPlayers([
        { id: 1, name: 'Ann', isTurn: true },
        { id: 2, name: 'Bo', isTurn: false }
      ])
      store.setDeck({ drawPile: deckOf(0), hands: { 1: [card(1), card(2)], 2: [card(4)] } })
    })

    it("should mark the active player's pinned lines, each in its color", () => {
      store.togglePin(1, 0)
      store.togglePin(2, 2)

      expect(store.markedLines).toEqual({
        isHovering: false,
        lines: [
          { destination: 'Town 1A', industry: 'Coal', color: PIN_COLORS[0] },
          { destination: 'Town 2C', industry: 'Wine', color: PIN_COLORS[1] }
        ]
      })
    })

    it('should mark only the line under the pointer, in the color pinning it would give', () => {
      store.togglePin(1, 0)

      store.hoverLine(2, 1)

      expect(store.markedLines).toEqual({
        isHovering: true,
        lines: [{ destination: 'Town 2B', industry: 'Beef', color: PIN_COLORS[1] }]
      })
    })

    it('should mark a pinned line under the pointer in its own color', () => {
      store.togglePin(1, 0)
      store.togglePin(2, 1)

      store.hoverLine(1, 0)

      expect(store.markedLines.lines).toEqual([
        { destination: 'Town 1A', industry: 'Coal', color: PIN_COLORS[0] }
      ])
    })

    it('should go back to the pinned lines when the pointer leaves', () => {
      store.togglePin(1, 0)
      store.hoverLine(2, 1)

      store.endHover()

      expect(store.markedLines.isHovering).toBe(false)
      expect(store.markedLines.lines).toHaveLength(1)
    })

    it("should not mark a line from another player's hand", () => {
      store.togglePin(1, 0)

      store.hoverLine(4, 0)

      expect(store.markedLines.isHovering).toBe(false)
      expect(store.markedLines.lines).toEqual([
        { destination: 'Town 1A', industry: 'Coal', color: PIN_COLORS[0] }
      ])
    })
  })

  describe('discardCard', () => {
    beforeEach(() => {
      store.setDeck({ drawPile: deckOf(4), hands: { 1: [card(91), card(92), card(93)] } })
    })

    it('should put the card on the discard pile and draw a replacement', () => {
      expect(store.discardCard(1, 92)).toBe(true)

      expect(idsOf(store.handOf(1))).toEqual([91, 93, 1])
      expect(idsOf(store.discardPile)).toEqual([92])
      expect(idsOf(store.drawPile)).toEqual([2, 3, 4])
    })

    it('should drop the player pins on the card', () => {
      usePlayerStore().addPlayer({ name: 'Alice', color: 'red' })
      usePlayerStore().startGame()
      store.togglePin(92, 0)
      store.togglePin(91, 1)

      store.discardCard(1, 92)

      expect(store.pinsOf(1).map((pin) => pin.cardId)).toEqual([91])
    })

    it('should refuse a card the player does not hold', () => {
      expect(store.discardCard(1, 1)).toBe(false)

      expect(idsOf(store.handOf(1))).toEqual([91, 92, 93])
      expect(store.discardPile).toEqual([])
    })

    it('should shuffle the discard pile into a new deck when the deck runs out', () => {
      store.setDeck({
        drawPile: [],
        discardPile: [card(5)],
        hands: { 1: [card(91), card(92), card(93)] }
      })

      store.discardCard(1, 91)

      expect(idsOf(store.handOf(1))).toEqual([92, 93, 5])
      expect(idsOf(store.discardPile)).toEqual([91])
    })

    it('should deal the card played back only when there is no other card anywhere', () => {
      store.setDeck({ drawPile: [], hands: { 1: [card(91)] } })

      store.discardCard(1, 91)

      expect(idsOf(store.handOf(1))).toEqual([91])
    })

    it('should top a short hand back up to three', () => {
      store.setDeck({ drawPile: deckOf(4), hands: { 1: [card(91)] } })

      store.discardCard(1, 91)

      expect(idsOf(store.handOf(1))).toEqual([1, 2, 3])
    })
  })

  describe('discardHand', () => {
    it('should throw in the whole hand and deal a new one', () => {
      store.setDeck({ drawPile: deckOf(4), hands: { 1: [card(91), card(92), card(93)] } })

      store.discardHand(1)

      expect(idsOf(store.handOf(1))).toEqual([1, 2, 3])
      expect(idsOf(store.discardPile)).toEqual([91, 92, 93])
    })

    // The bug: the hand went on the discard pile first, so with the deck
    // empty it was shuffled straight back and dealt to the same player
    it('should not deal back the cards thrown in when the deck has run out', () => {
      store.setDeck({
        drawPile: [],
        discardPile: [card(5), card(6), card(7)],
        hands: { 1: [card(91), card(92), card(93)] }
      })

      store.discardHand(1)

      expect(idsOf(store.handOf(1)).sort()).toEqual([5, 6, 7])
      expect(idsOf(store.discardPile)).toEqual([91, 92, 93])
    })

    it('should make up a full hand from the thrown-in cards when the rest run short', () => {
      store.setDeck({ drawPile: [card(5)], hands: { 1: [card(91), card(92), card(93)] } })

      store.discardHand(1)

      expect(idsOf(store.handOf(1))[0]).toBe(5)
      expect(store.handOf(1)).toHaveLength(3)
    })

    it('should drop all the player pins', () => {
      usePlayerStore().addPlayer({ name: 'Alice', color: 'red' })
      usePlayerStore().startGame()
      store.setDeck({ drawPile: deckOf(4), hands: { 1: [card(91)] } })
      store.togglePin(91, 0)

      store.discardHand(1)

      expect(store.pinsOf(1)).toEqual([])
    })
  })

  describe('discard pile in a save', () => {
    it('should be restored from a save', () => {
      store.setDeck({ drawPile: deckOf(1), discardPile: [card(50)] })

      expect(idsOf(store.discardPile)).toEqual([50])
    })

    it('should start empty for a save from before cards could be played', () => {
      store.setDeck({ drawPile: deckOf(1) })

      expect(store.discardPile).toEqual([])
    })

    it('should be cleared by reset', () => {
      store.setDeck({ drawPile: deckOf(1), discardPile: [card(50)] })

      store.reset()

      expect(store.discardPile).toEqual([])
    })
  })
})
