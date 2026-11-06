/**
 * Demand Deck Tests
 *
 * The deck is built from the board's demands — each town paired with each
 * commodity another town makes — with no pair on two cards, and no card
 * sending two demands to one town or asking twice for one commodity. Its
 * size is held to so many cards per town, and to what the pairs can fill.
 */

import { describe, it, expect } from 'vitest'
import { buildDemandDeck, demandPairs } from '@/composables/demandDeck'

/**
 * A town making the given commodities.
 * @param {string} name - The town's name
 * @param {...string} makes - What it makes
 * @returns {Object} The town
 */
const town = (name, ...makes) => ({ name, industries: makes.map((m) => ({ name: m })) })

/** Six towns, some making two things, Steel made in two of them */
const TOWNS = [
  town('Denver', 'Coal', 'Tourism'),
  town('Pueblo', 'Steel'),
  town('Greeley', 'Cattle'),
  town('Aspen', 'Lumber'),
  town('Gary', 'Steel', 'Chemicals'),
  town('Boise', 'Fruit')
]

/** A payoff that names its demand, so tests can see which pair it was for */
const payoffOf = (destination, industry) => `${destination.name}:${industry}`

/**
 * A fixed stand-in for Math.random, so a test's deck is the same every run.
 * @param {number} seed - Where to start
 * @returns {Function} Draws numbers in [0, 1)
 */
function seeded(seed) {
  let state = seed
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

/** Every demand in a deck, as "town:commodity" */
const demandsOf = (deck) =>
  deck.flatMap((card) => card.demands.map((d) => `${d.destination}:${d.industry}`))

describe('demandPairs', () => {
  it('should pair each town with every commodity made somewhere else, and only those', () => {
    const pairs = demandPairs([town('A', 'Coal'), town('B', 'Steel'), town('C', 'Coal')])

    expect(pairs.map(({ town: t, industry }) => `${t.name}:${industry}`).sort()).toEqual([
      'A:Steel',
      'B:Coal',
      'C:Steel'
    ])
  })

  it('should weigh a pair up for a town that makes less, and for a commodity made in more towns', () => {
    const pairs = demandPairs(TOWNS)
    const weightOf = (name, industry) =>
      pairs.find((p) => p.town.name === name && p.industry === industry).weight

    // Greeley makes one thing, Denver two: Greeley wants more
    expect(weightOf('Greeley', 'Fruit')).toBeGreaterThan(weightOf('Denver', 'Fruit'))
    // Steel is made in two towns, Fruit in one: Steel is wanted more
    expect(weightOf('Greeley', 'Steel')).toBeGreaterThan(weightOf('Greeley', 'Fruit'))
  })
})

describe('buildDemandDeck', () => {
  it('should never put the same demand on two cards', () => {
    const deck = buildDemandDeck(TOWNS, payoffOf, { random: seeded(7) })
    const demands = demandsOf(deck)

    expect(new Set(demands).size).toBe(demands.length)
  })

  it('should send each demand on a card to a different town, for a different commodity', () => {
    const deck = buildDemandDeck(TOWNS, payoffOf, { random: seeded(11) })

    deck.forEach(({ demands }) => {
      expect(new Set(demands.map((d) => d.destination)).size).toBe(3)
      expect(new Set(demands.map((d) => d.industry)).size).toBe(3)
    })
  })

  it('should never ask a town for a commodity it makes', () => {
    const deck = buildDemandDeck(TOWNS, payoffOf, { random: seeded(3) })

    deck
      .flatMap((card) => card.demands)
      .forEach(({ destination, industry }) => {
        const wanting = TOWNS.find((t) => t.name === destination)
        expect(wanting.industries.map((i) => i.name)).not.toContain(industry)
      })
  })

  it('should make no more cards than a third of the demands can fill', () => {
    // 6 towns × 7 commodities, less the 8 each town makes itself: 34 pairs,
    // so 11 cards at most, under the 36 that six per town would allow
    expect(demandPairs(TOWNS)).toHaveLength(34)
    const deck = buildDemandDeck(TOWNS, payoffOf, { random: seeded(5) })

    expect(deck.length).toBeLessThanOrEqual(11)
    expect(deck.length).toBeGreaterThanOrEqual(9)
  })

  it('should make no more cards per town than it is told to', () => {
    const deck = buildDemandDeck(TOWNS, payoffOf, { random: seeded(5), cardsPerTown: 1 })

    expect(deck).toHaveLength(TOWNS.length)
  })

  it('should price each demand with the payoff it is given, and number the cards from 1', () => {
    const deck = buildDemandDeck(TOWNS, payoffOf, { random: seeded(13) })

    expect(deck.map(({ id }) => id)).toEqual(deck.map((_, i) => i + 1))
    deck
      .flatMap((card) => card.demands)
      .forEach(({ destination, industry, payoff }) =>
        expect(payoff).toBe(`${destination}:${industry}`)
      )
  })

  it('should make no cards from fewer than three towns', () => {
    const deck = buildDemandDeck([town('A', 'Coal'), town('B', 'Steel')], payoffOf)

    expect(deck).toEqual([])
  })
})
