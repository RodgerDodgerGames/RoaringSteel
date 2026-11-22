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
import { demandDeckConfig } from '@/config/demands'

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

/**
 * Every demand on the board of six towns with a payoff of its own: $1,000
 * to $34,000, shuffled among the towns (each pair's place in the list,
 * times 7, wrapped round the 34 of them)
 */
const PAYOFFS = new Map(
  demandPairs(TOWNS).map(({ town, industry }, i) => [
    `${town.name}:${industry}`,
    (((i * 7) % 34) + 1) * 1000
  ])
)

/** What a demand pays: its own payoff on the six towns, $1,000 elsewhere */
const payoffOf = (destination, industry) => PAYOFFS.get(`${destination.name}:${industry}`) ?? 1000

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
    const pairs = demandPairs(TOWNS, { makesLittlePower: 0.5 })
    const weightOf = (name, industry) =>
      pairs.find((p) => p.town.name === name && p.industry === industry).weight

    // Greeley makes one thing, Denver two: Greeley wants more
    expect(weightOf('Greeley', 'Fruit')).toBeGreaterThan(weightOf('Denver', 'Fruit'))
    // Steel is made in two towns, Fruit in one: Steel is wanted more
    expect(weightOf('Greeley', 'Steel')).toBeGreaterThan(weightOf('Greeley', 'Fruit'))
  })
})

describe('demandPairs town weights', () => {
  // The tests' own, so retuning config/demands.js does not break them
  const sizeWeights = { large: 8, medium: 4, small: 1 }
  /** A town of the given size */
  const sized = (size, name, ...makes) => ({ ...town(name, ...makes), size })
  /** The weight of each town's demand for Salt, which none of them makes */
  const saltWeights = (towns, options) =>
    Object.fromEntries(
      demandPairs([...towns, sized('small', 'Saltville', 'Salt')], options)
        .filter(({ industry }) => industry === 'Salt')
        .map(({ town: t, weight }) => [t.name, weight])
    )

  it('should weigh a town up by its size', () => {
    const weights = saltWeights(
      [
        sized('large', 'Big', 'Coal'),
        sized('medium', 'Mid', 'Coal'),
        sized('small', 'Wee', 'Coal')
      ],
      { sizeWeights, makesLittlePower: 0.5 }
    )

    expect(weights.Big / weights.Wee).toBeCloseTo(8)
    expect(weights.Mid / weights.Wee).toBeCloseTo(4)
  })

  it('should count a town without a size as small', () => {
    const weights = saltWeights([town('Unsized', 'Coal'), sized('small', 'Wee', 'Coal')], {
      sizeWeights,
      makesLittlePower: 0.5
    })

    expect(weights.Unsized).toBe(weights.Wee)
  })

  it.each([
    [1, 4],
    [0.5, 2],
    [0, 1]
  ])(
    'should, at a power of %s, weigh a town making nothing %s times one making three',
    (makesLittlePower, times) => {
      const weights = saltWeights(
        [sized('small', 'Empty'), sized('small', 'Busy', 'Coal', 'Steel', 'Fruit')],
        { sizeWeights, makesLittlePower }
      )

      expect(weights.Empty / weights.Busy).toBeCloseTo(times)
    }
  )

  it('should multiply the size weight by the weight for making little', () => {
    const weights = saltWeights(
      [sized('large', 'Busy', 'Coal', 'Steel', 'Fruit'), sized('small', 'Empty')],
      { sizeWeights, makesLittlePower: 0.5 }
    )

    // 8 for its size, halved for making three things, against 1 and 1
    expect(weights.Busy / weights.Empty).toBeCloseTo(4)
  })

  it("should use the game's settings unless given others", () => {
    const weights = saltWeights([
      sized('large', 'Big', 'Coal'),
      sized('medium', 'Mid', 'Coal'),
      sized('small', 'Wee', 'Coal'),
      sized('small', 'Empty')
    ])
    const { sizeWeights: set, makesLittlePower } = demandDeckConfig

    expect(weights.Big / weights.Wee).toBeCloseTo(set.large / set.small)
    expect(weights.Mid / weights.Wee).toBeCloseTo(set.medium / set.small)
    expect(weights.Empty / weights.Wee).toBeCloseTo(2 ** makesLittlePower)
  })
})

describe('buildDemandDeck town weights', () => {
  // Thirty towns, three of them large, six medium and the rest small, each
  // making one thing of its own, but for four small towns that make nothing
  const board = Array.from({ length: 30 }, (_, i) => ({
    ...town(`Town ${i}`, ...(i < 26 ? [`Good ${i}`] : [])),
    size: i < 3 ? 'large' : i < 9 ? 'medium' : 'small'
  }))
  // A payoff for each demand that has nothing to do with the town's size
  const random = seeded(99)
  const payoffs = new Map(
    demandPairs(board).map(({ town: t, industry }) => [`${t.name}:${industry}`, random()])
  )
  /** A hundred decks for the board, of so many cards per town */
  const decksOf = (
    cardsPerTown,
    weights = { sizeWeights: { large: 5, medium: 2.5, small: 1 }, makesLittlePower: 0.5 }
  ) =>
    Array.from({ length: 100 }, (_, i) =>
      buildDemandDeck(board, (t, industry) => payoffs.get(`${t.name}:${industry}`), {
        random: seeded((i + 1) * 7919),
        cardsPerTown,
        pools: [
          { from: 0, to: 0.4 },
          { from: 0.3, to: 0.7 },
          { from: 0.6, to: 1 }
        ],
        ...weights
      })
    )
  /** How many demands the towns passed get over all the decks, per town */
  const demandsEach = (decks, towns) => {
    const names = new Set(towns.map(({ name }) => name))
    const demands = decks.flat().flatMap((card) => card.demands)
    return demands.filter(({ destination }) => names.has(destination)).length / towns.length
  }

  it('should send the most demands to large towns, then medium, then small', () => {
    // A small deck, so the weights decide much of what is dealt; and only
    // towns that make one thing, so size is all that tells them apart
    const decks = decksOf(2)
    const making = board.filter(({ industries }) => industries.length === 1)
    const [large, medium, small] = ['large', 'medium', 'small'].map((size) =>
      demandsEach(
        decks,
        making.filter((t) => t.size === size)
      )
    )

    // By a clear margin: with size ignored the three still differ by a
    // percent or so, as the draw falls
    expect(large).toBeGreaterThan(medium * 1.2)
    expect(medium).toBeGreaterThan(small * 1.2)
  })

  it('should send more demands to a small town that makes nothing than to one that makes something', () => {
    const decks = decksOf(2)
    const small = board.filter(({ size }) => size === 'small')
    const [none, one] = [0, 1].map((count) =>
      demandsEach(
        decks,
        small.filter(({ industries }) => industries.length === count)
      )
    )

    // More than the few percent it gets just by having one more demand to deal
    expect(none).toBeGreaterThan(one * 1.15)
  })

  it('should deal by the weights it is given', () => {
    // Nothing like the game's: small towns first, and making little counts cubed
    const decks = decksOf(2, {
      sizeWeights: { large: 1, medium: 1, small: 5 },
      makesLittlePower: 3
    })
    const of = (size, count) =>
      demandsEach(
        decks,
        board.filter((t) => t.size === size && t.industries.length === count)
      )

    expect(of('small', 1)).toBeGreaterThan(of('large', 1) * 1.2)
    expect(of('small', 0)).toBeGreaterThan(of('small', 1) * 1.8)
  })

  it('should still send demands to every town that makes nothing, in every deck', () => {
    const empty = board.filter(({ industries }) => industries.length === 0)

    // Six cards a town, as the game deals. A weight only makes a demand
    // likelier, so in a deck much smaller a town can be missed now and then.
    decksOf(6).forEach((deck) => {
      const wanting = new Set(deck.flatMap((card) => card.demands.map((d) => d.destination)))
      empty.forEach(({ name }) => expect(wanting).toContain(name))
    })
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
        expect(payoff).toBe(PAYOFFS.get(`${destination}:${industry}`))
      )
  })

  it('should make no cards from fewer than three towns', () => {
    const deck = buildDemandDeck([town('A', 'Coal'), town('B', 'Steel')], payoffOf)

    expect(deck).toEqual([])
  })
})

describe('buildDemandDeck pools', () => {
  const seeds = Array.from({ length: 50 }, (_, i) => i + 1)
  /** Where a payoff stands among the board's 34: the share ranked below it */
  const standing = (payoff) => (payoff / 1000 - 1) / 34

  /**
   * Whether a card's demands could be one from each pool: lowest first,
   * one in each band in turn
   */
  const onePerPool = (card, pools) =>
    card.demands
      .map(({ payoff }) => standing(payoff))
      .sort((a, b) => a - b)
      .every((place, i) => place >= pools[i].from && place < pools[i].to)

  it('should deal every card one demand from each of the bottom, middle and upper pools', () => {
    const pools = [
      { from: 0, to: 0.4 },
      { from: 0.3, to: 0.7 },
      { from: 0.6, to: 1 }
    ]
    seeds.forEach((seed) => {
      const deck = buildDemandDeck(TOWNS, payoffOf, { random: seeded(seed), pools })

      expect(deck.length).toBeGreaterThan(0)
      deck.forEach((card) => expect(onePerPool(card, pools)).toBe(true))
    })
  })

  it('should deal from the pools it is given', () => {
    const pools = [
      { from: 0, to: 0.2 },
      { from: 0.4, to: 0.6 },
      { from: 0.8, to: 1 }
    ]
    seeds.forEach((seed) => {
      const deck = buildDemandDeck(TOWNS, payoffOf, {
        random: seeded(seed),
        cardsPerTown: 1,
        pools
      })

      expect(deck.length).toBeGreaterThan(0)
      deck.forEach((card) => expect(onePerPool(card, pools)).toBe(true))
    })
  })

  it('should stop at the cards its pools can fill, each still one demand from each', () => {
    // Three narrow pools of three or four demands each: room for three
    // cards at most, under the six asked for
    const pools = [
      { from: 0, to: 0.1 },
      { from: 0.1, to: 0.2 },
      { from: 0.2, to: 0.3 }
    ]
    seeds.forEach((seed) => {
      const deck = buildDemandDeck(TOWNS, payoffOf, {
        random: seeded(seed),
        cardsPerTown: 1,
        pools
      })

      expect(deck.length).toBeGreaterThanOrEqual(2)
      expect(deck.length).toBeLessThanOrEqual(3)
      deck.forEach((card) => expect(onePerPool(card, pools)).toBe(true))
    })
  })

  it('should still fill the deck when every demand pays the same', () => {
    // Ranked in the draw's order, so each pool still holds its share
    const full = buildDemandDeck(TOWNS, payoffOf, { random: seeded(7), cardsPerTown: 1 })
    const same = buildDemandDeck(TOWNS, () => 3000, { random: seeded(7), cardsPerTown: 1 })

    expect(full).toHaveLength(TOWNS.length)
    expect(same).toHaveLength(TOWNS.length)
  })
})
