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
 * and at most a third as many as there are pairs, so on most boards it
 * leaves some pairs out (a bench of three boards, 2026-11-18, dealt 55–79% of
 * them). The cheap demands are dealt before the rest: every pair that pays
 * under `cheapUnder` goes into the deck as far as it has room (three to a
 * card, never two to one town on a card), and the weighted draw fills the
 * rest. Early in a game those are the only deliveries a player can
 * afford to build for, and a board has few of them. They are dealt out
 * first, one to a card in turn, so they are spread across the deck rather
 * than bunched on cards of their own, and the weighted draw fills each
 * card's other places.
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
 *   (town, commodity name) => dollars (see payoffs.js). Asked of every pair,
 *   so the cheap ones can be found.
 * @param {Object} [options]
 * @param {Function} [options.random] - Draws a number in [0, 1); Math.random
 *   unless a test needs a fixed deck
 * @param {number} [options.cardsPerTown] - See `demandDeckConfig`
 * @param {number} [options.cheapUnder] - Every pair paying less than this
 *   goes into the deck, as far as it has room; none are sure to unless it is
 *   given
 * @returns {Array<{id: number, demands: Array<{destination: string,
 *   industry: string, payoff: number}>}>} The deck, top first, its cards
 *   numbered from 1
 */
export function buildDemandDeck(
  towns,
  payoffOf,
  { random = Math.random, cardsPerTown = demandDeckConfig.cardsPerTown, cheapUnder = 0 } = {}
) {
  const pairs = demandPairs(towns).map((pair) => ({
    ...pair,
    payoff: payoffOf(pair.town, pair.industry)
  }))
  const size = Math.min(towns.length * cardsPerTown, Math.floor(pairs.length / DEMANDS_PER_CARD))
  const cheap = []
  const dear = []
  pairs.forEach((pair) => (pair.payoff < cheapUnder ? cheap : dear).push(pair))

  // The cards, and whether a card can take a pair: not full, and not
  // already sending a demand to the pair's town
  const cards = Array.from({ length: size }, () => [])
  const fits = (card, pair) =>
    card.length < DEMANDS_PER_CARD && !card.some((taken) => taken.town === pair.town)

  // The cheap pairs are dealt first, in their weighted order, round the
  // cards in turn, so they are spread one to a card before any card gets a
  // second. One that no card can take (every card full, or with its town on
  // it) is left out: there is no room for it.
  let next = 0
  weightedOrder(cheap, random).forEach((pair) => {
    for (let tried = 0; tried < size; tried++) {
      const card = cards[(next + tried) % size]
      if (fits(card, pair)) {
        card.push(pair)
        next = (next + tried + 1) % size
        return
      }
    }
  })

  // Then each card is filled from the dear pairs in their weighted order:
  // the first going to towns not already on it. The ones passed over stay
  // where they are, for later cards. A card that cannot be filled is left
  // out, and its pairs go back to the front of the order for the cards
  // after it, so a cheap pair dealt to it is not lost with it.
  const order = weightedOrder(dear, random)
  const filled = []
  cards.forEach((card) => {
    for (let i = 0; i < order.length && card.length < DEMANDS_PER_CARD; i++) {
      if (fits(card, order[i])) {
        card.push(order[i])
        order.splice(i, 1)
        i--
      }
    }
    if (card.length === DEMANDS_PER_CARD) filled.push(card)
    else order.unshift(...card)
  })

  // A cheap pair still left over came off a card that could not be filled
  // at the end of the deck. It takes the place of a dear pair on a card
  // that has room for its town, and the dear pair is left out instead.
  order
    .filter((pair) => pair.payoff < cheapUnder)
    .forEach((pair) => {
      for (const card of filled) {
        const dearAt = card.findIndex((taken) => !(taken.payoff < cheapUnder))
        const others = card.filter((_, i) => i !== dearAt)
        if (dearAt !== -1 && !others.some((taken) => taken.town === pair.town)) {
          card[dearAt] = pair
          return
        }
      }
    })

  // Each card's demands shuffled, so a card's cheap demand is not always
  // the first on it
  const deck = filled.map((card) =>
    shuffle(card, random).map(({ town, industry, payoff }) => ({
      destination: town.name,
      industry,
      payoff
    }))
  )
  return shuffle(deck, random).map((demands, index) => ({ id: index + 1, demands }))
}
