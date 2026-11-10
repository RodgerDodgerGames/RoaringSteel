/**
 * Demand Deck (demandDeck.js)
 *
 * Builds the demand deck: cards of three demands, each a commodity wanted in
 * a town.
 *
 * Every demand on the board is a pair of a town and a commodity some other
 * town on the board makes. Each pair is on at most one card, so a deck never
 * asks for the same thing in the same place twice. The three demands on a
 * card go to three different towns; they may ask for the same commodity,
 * as the draw falls.
 *
 * Which pairs make it into the deck, and in what order, is drawn at random,
 * weighted two ways, as the deck has always been:
 * - a town that makes little wants more: a town's weight is
 *   1 / (1 + the number of things it makes);
 * - a commodity made in many towns is wanted more often: a commodity's
 *   weight is how many towns make it.
 * A pair's weight is the two multiplied. The pairs are put in a random order
 * in which heavier pairs tend to come first (each pair's place is drawn as
 * random^(1 / weight), highest first), and the cards are made out of that
 * order. The finished cards are then shuffled: the weights choose which
 * demands make it into the deck, but a heavy demand is no likelier to be
 * near the top than a light one.
 *
 * The deck has at most `cardsPerTown` cards per town (see config/demands.js),
 * and at most a third as many as there are pairs.
 *
 * Pure functions over plain data, so they are tested without stores.
 *
 * @module composables/demandDeck
 */

import { demandDeckConfig } from '@/config/demands'

/** How many demands a card offers */
const DEMANDS_PER_CARD = 3

/**
 * Every demand the board has: each town paired with each commodity made in
 * some other town, with the pair's weight.
 * @param {Array<Object>} towns - The towns on the board, each with name and
 *   industries ([{name}])
 * @returns {Array<{town: Object, industry: string, weight: number}>} The pairs
 */
export function demandPairs(towns) {
  // How many towns make each commodity
  const makers = new Map()
  towns.forEach((town) =>
    town.industries.forEach(({ name }) => makers.set(name, (makers.get(name) ?? 0) + 1))
  )

  return towns.flatMap((town) => {
    const townWeight = 1 / (1 + town.industries.length)
    const makes = new Set(town.industries.map(({ name }) => name))
    return [...makers.entries()]
      .filter(([industry]) => !makes.has(industry))
      .map(([industry, count]) => ({ town, industry, weight: townWeight * count }))
  })
}

/**
 * The pairs in a random order, heavier ones tending to come first.
 * @param {Array<{weight: number}>} pairs - The pairs
 * @param {Function} random - Draws a number in [0, 1)
 * @returns {Array<Object>} The same pairs, reordered
 */
function weightedOrder(pairs, random) {
  return pairs
    .map((pair) => ({ pair, key: random() ** (1 / pair.weight) }))
    .sort((a, b) => b.key - a.key)
    .map(({ pair }) => pair)
}

/**
 * Shuffles a list in place, every order equally likely (Fisher-Yates).
 * @param {Array} items - The list; reordered
 * @param {Function} random - Draws a number in [0, 1)
 * @returns {Array} The same list
 */
function shuffle(items, random) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

/**
 * Builds the demand deck for a board.
 *
 * @param {Array<Object>} towns - The towns on the board, each with name and
 *   industries ([{name}])
 * @param {Function} payoffOf - What delivering a commodity to a town pays:
 *   (town, commodity name) => dollars (see payoffs.js)
 * @param {Object} [options]
 * @param {Function} [options.random] - Draws a number in [0, 1); Math.random
 *   unless a test needs a fixed deck
 * @param {number} [options.cardsPerTown] - See `demandDeckConfig`
 * @returns {Array<{id: number, demands: Array<{destination: string,
 *   industry: string, payoff: number}>}>} The deck, top first, its cards
 *   numbered from 1
 */
export function buildDemandDeck(
  towns,
  payoffOf,
  { random = Math.random, cardsPerTown = demandDeckConfig.cardsPerTown } = {}
) {
  const pairs = demandPairs(towns)
  const size = Math.min(towns.length * cardsPerTown, Math.floor(pairs.length / DEMANDS_PER_CARD))
  const order = weightedOrder(pairs, random)

  const deck = []
  while (deck.length < size) {
    // The first pairs left in the order that go to towns not already on the
    // card. The ones passed over stay where they are, for later cards.
    const card = []
    for (let i = 0; i < order.length && card.length < DEMANDS_PER_CARD; i++) {
      const pair = order[i]
      const isRepeat = card.some((taken) => taken.town === pair.town)
      if (!isRepeat) {
        card.push(pair)
        order.splice(i, 1)
        i--
      }
    }
    // What is left cannot make a card of its own; the deck stops short
    if (card.length < DEMANDS_PER_CARD) break

    deck.push(
      card.map(({ town, industry }) => ({
        destination: town.name,
        industry,
        payoff: payoffOf(town, industry)
      }))
    )
  }
  return shuffle(deck, random).map((demands, index) => ({ id: index + 1, demands }))
}
