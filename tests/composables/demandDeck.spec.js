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

  it('should send each demand on a card to a different town', () => {
    const deck = buildDemandDeck(TOWNS, payoffOf, { random: seeded(11) })

    deck.forEach(({ demands }) => {
      expect(new Set(demands.map((d) => d.destination)).size).toBe(3)
    })
  })

  it('should let a card ask for the same commodity more than once, as the draw falls', () => {
    // Some card, in one of a few decks, asks for one commodity twice
    const repeats = [1, 2, 3, 4, 5, 6, 7, 8].some((seed) =>
      buildDemandDeck(TOWNS, payoffOf, { random: seeded(seed) }).some(
        ({ demands }) => new Set(demands.map((d) => d.industry)).size < 3
      )
    )

    expect(repeats).toBe(true)
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

describe('buildDemandDeck with cheap demands', () => {
  // One card per town: 6 cards, 18 of the board's 34 demands
  const small = { cardsPerTown: 1 }
  /** Fruit is cheap to bring anywhere; everything else dear */
  const fruitCheap = (destination, industry) => (industry === 'Fruit' ? 10000 : 90000)
  const seeds = Array.from({ length: 20 }, (_, i) => i + 1)

  it('should put every demand paying under the threshold in the deck, whatever the draw', () => {
    // Five towns want Fruit, which only Boise makes
    seeds.forEach((seed) => {
      const deck = buildDemandDeck(TOWNS, fruitCheap, {
        ...small,
        random: seeded(seed),
        cheapUnder: 35000
      })
      const fruit = demandsOf(deck).filter((demand) => demand.endsWith(':Fruit'))

      expect(fruit).toHaveLength(5)
    })
  })

  it('should leave the cheap demands to the draw without a threshold', () => {
    const counts = seeds.map(
      (seed) =>
        demandsOf(buildDemandDeck(TOWNS, fruitCheap, { ...small, random: seeded(seed) })).filter(
          (demand) => demand.endsWith(':Fruit')
        ).length
    )

    // Fruit is made in one town only, so the draw weighs it light: most
    // decks leave some out
    expect(counts.filter((count) => count < 5).length).toBeGreaterThan(seeds.length / 2)
  })

  it('should deal the cheap demands out across the cards, not bunch them', () => {
    // Five demands to five towns, dealt one to a card: five cards, where
    // bunched they would fill two
    seeds.forEach((seed) => {
      const deck = buildDemandDeck(TOWNS, fruitCheap, {
        ...small,
        random: seeded(seed),
        cheapUnder: 35000
      })

      expect(deck.filter((card) => card.demands.some((d) => d.industry === 'Fruit'))).toHaveLength(
        5
      )
    })
  })

  it('should keep every cheap demand in a full-size deck, whatever the draw', () => {
    // Regression: the deck stopped at the first card it could not fill,
    // dropping the cheap demands already dealt to the cards after it
    const threeCheap = (destination, industry) =>
      ['Fruit', 'Coal', 'Cattle'].includes(industry) ? 10000 : 90000
    const cheapCount = demandPairs(TOWNS).filter(({ industry }) =>
      ['Fruit', 'Coal', 'Cattle'].includes(industry)
    ).length

    Array.from({ length: 200 }, (_, i) => i + 1).forEach((seed) => {
      const deck = buildDemandDeck(TOWNS, threeCheap, { random: seeded(seed), cheapUnder: 35000 })

      expect(deck.flatMap((card) => card.demands).filter((d) => d.payoff < 35000)).toHaveLength(
        cheapCount
      )
    })
  })

  it('should fill the deck with cheap demands alone when there are more than it holds', () => {
    // Everything but Fruit is cheap: 29 cheap demands for 18 places
    const fruitDear = (destination, industry) => (industry === 'Fruit' ? 90000 : 10000)

    seeds.forEach((seed) => {
      const deck = buildDemandDeck(TOWNS, fruitDear, {
        ...small,
        random: seeded(seed),
        cheapUnder: 35000
      })

      expect(demandsOf(deck).some((demand) => demand.endsWith(':Fruit'))).toBe(false)
    })
  })

  it('should give each demand the payoff it was priced at', () => {
    const deck = buildDemandDeck(TOWNS, fruitCheap, {
      ...small,
      random: seeded(3),
      cheapUnder: 35000
    })

    deck
      .flatMap((card) => card.demands)
      .forEach((d) => expect(d.payoff).toBe(d.industry === 'Fruit' ? 10000 : 90000))
  })
})
