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
 * Each card's three demands come from three pools of payoffs, one from
 * each: the bottom, middle and upper bands of every demand the board has,
 * ranked by what it pays (see `demandDeckConfig.pools`). So every card
 * offers a short, cheap haul a player can start on early, one in the
 * middle, and one from the dear end for later in the game. The bands
 * overlap, so a demand near a boundary may be dealt as either pool's.
 *
 * Which pairs of a pool make it into the deck, and in what order, is drawn
 * at random, weighted three ways:
 * - a bigger town wants more: major cities most, then medium towns (see
 *   `demandDeckConfig.sizeWeights`);
 * - a town that makes little wants more, so one that makes nothing still
 *   turns up on cards: 1 / (1 + the number of things it makes), softened by
 *   raising it to `demandDeckConfig.makesLittlePower`;
 * - a commodity made in many towns is wanted more often: a commodity's
 *   weight is how many towns make it.
 * A pair's weight is the three multiplied. The pairs are put in a random
 * order in which heavier pairs tend to come first (each pair's place is
 * drawn as random^(1 / weight), highest first); each pool takes its own
 * pairs in that order, and each card takes the first of each pool's that it
 * can.
 * The finished cards are then shuffled, and so is each card's three: the
 * weights choose which demands make it into the deck, but a heavy demand is
 * no likelier to be near the top than a light one, nor a cheap demand to be
 * a card's first.
 *
 * The deck has at most `cardsPerTown` cards per town (see config/demands.js),
 * and at most a third as many as there are pairs, so on most boards it
 * leaves some pairs out (a bench of four boards, 2026-11-18, dealt 29–78%
 * of them). On a board with few pairs for its
 * towns, a pool can run out before the deck is full, or have left only
 * pairs for towns already on the card being made; the deck then stops
 * short, at the cards it could fill. The middle pool, which shares pairs
 * with both the others, is dealt first on each card, so they do not take
 * what it shares before it can. That does not keep every pool full: the
 * middle takes shared pairs too, so a pool with a narrow band can still
 * run out first, whether the middle's or one beside it.
 *
 * Pure functions over plain data, so they are tested without stores.
 *
 * @module composables/demandDeck
 */

import { demandDeckConfig } from '@/config/demands'

/**
 * How much a town wants, for the draw: its size's weight times its weight
 * for making little (see the module's notes).
 * @param {Object} town - The town, with size and industries
 * @param {{large: number, medium: number, small: number}} sizeWeights - See
 *   `demandDeckConfig`
 * @param {number} makesLittlePower - See `demandDeckConfig`
 * @returns {number} The weight; a town without a size counts as small
 */
function townWeight({ size, industries }, sizeWeights, makesLittlePower) {
  const forSize = sizeWeights[size] ?? sizeWeights.small
  const forMakingLittle = (1 / (1 + industries.length)) ** makesLittlePower
  return forSize * forMakingLittle
}

/**
 * Every demand the board has: each town paired with each commodity made in
 * some other town, with the pair's weight.
 * @param {Array<Object>} towns - The towns on the board, each with name,
 *   size and industries ([{name}])
 * @param {Object} [options]
 * @param {{large: number, medium: number, small: number}} [options.sizeWeights] -
 *   See `demandDeckConfig`
 * @param {number} [options.makesLittlePower] - See `demandDeckConfig`
 * @returns {Array<{town: Object, industry: string, weight: number}>} The pairs
 */
export function demandPairs(
  towns,
  {
    sizeWeights = demandDeckConfig.sizeWeights,
    makesLittlePower = demandDeckConfig.makesLittlePower
  } = {}
) {
  // How many towns make each commodity
  const makers = new Map()
  towns.forEach((town) =>
    town.industries.forEach(({ name }) => makers.set(name, (makers.get(name) ?? 0) + 1))
  )

  return towns.flatMap((town) => {
    const wants = townWeight(town, sizeWeights, makesLittlePower)
    const makes = new Set(town.industries.map(({ name }) => name))
    return [...makers.entries()]
      .filter(([industry]) => !makes.has(industry))
      .map(([industry, count]) => ({ town, industry, weight: wants * count }))
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
 * @param {Array<Object>} towns - The towns on the board, each with name,
 *   size and industries ([{name}])
 * @param {Function} payoffOf - What delivering a commodity to a town pays:
 *   (town, commodity name) => dollars (see payoffs.js). Asked of every pair,
 *   so they can be ranked into the pools.
 * @param {Object} [options]
 * @param {Function} [options.random] - Draws a number in [0, 1); Math.random
 *   unless a test needs a fixed deck
 * @param {number} [options.cardsPerTown] - See `demandDeckConfig`
 * @param {Array<{from: number, to: number}>} [options.pools] - See
 *   `demandDeckConfig`: one demand on each card from each
 * @param {{large: number, medium: number, small: number}} [options.sizeWeights] -
 *   See `demandDeckConfig`
 * @param {number} [options.makesLittlePower] - See `demandDeckConfig`
 * @returns {Array<{id: number, demands: Array<{destination: string,
 *   industry: string, payoff: number}>}>} The deck, top first, its cards
 *   numbered from 1
 */
export function buildDemandDeck(
  towns,
  payoffOf,
  {
    random = Math.random,
    cardsPerTown = demandDeckConfig.cardsPerTown,
    pools = demandDeckConfig.pools,
    sizeWeights,
    makesLittlePower
  } = {}
) {
  const pairs = demandPairs(towns, { sizeWeights, makesLittlePower }).map((pair) => ({
    ...pair,
    payoff: payoffOf(pair.town, pair.industry)
  }))
  const size = Math.min(towns.length * cardsPerTown, Math.floor(pairs.length / pools.length))

  // One weighted order for every pair, so a pair in two pools comes as far
  // up each; each pool takes its own pairs from it
  const order = weightedOrder(pairs, random)
  // Where each pair stands among them all, by payoff: the share of pairs
  // ranked below it, from 0 for the lowest. Pairs paying the same are
  // ranked in their weighted order, so each pool always holds its share of
  // the pairs, even where many pay the same (the minimum, say).
  const standing = new Map(
    [...order].sort((a, b) => a.payoff - b.payoff).map((pair, rank) => [pair, rank / pairs.length])
  )
  const poolOrders = pools.map(({ from, to }) =>
    order.filter((pair) => standing.get(pair) >= from && standing.get(pair) < to)
  )
  // The pools are dealt from the middle out: a middle pool shares pairs with
  // the pools on both sides, so it would run short if the others took what
  // it shares with them first. It can drain a narrow pool beside it instead.
  const middle = (pools.length - 1) / 2
  const dealOrder = poolOrders
    .map((poolOrder, i) => ({ poolOrder, fromMiddle: Math.abs(i - middle) }))
    .sort((a, b) => a.fromMiddle - b.fromMiddle)
    .map(({ poolOrder }) => poolOrder)

  // Each card takes, from each pool in turn, the first pair not already
  // dealt and not to a town already on it. Each pool's pairs before its
  // `start` are all dealt, so its search starts there.
  const dealt = new Set()
  const starts = dealOrder.map(() => 0)
  const cards = []
  while (cards.length < size) {
    const card = []
    dealOrder.forEach((poolOrder, p) => {
      if (card.length < p) return
      while (starts[p] < poolOrder.length && dealt.has(poolOrder[starts[p]])) starts[p]++
      for (let i = starts[p]; i < poolOrder.length; i++) {
        const pair = poolOrder[i]
        if (!dealt.has(pair) && !card.some((taken) => taken.town === pair.town)) {
          card.push(pair)
          dealt.add(pair)
          return
        }
      }
    })
    // A pool with nothing left for a card has as good as run dry: what it
    // has left goes only to the towns already on the card. The deck stops
    // there, at the cards it could fill.
    if (card.length < pools.length) break
    cards.push(card)
  }

  // Each card's demands shuffled, so its cheap demand is not always first
  const deck = cards.map((card) =>
    shuffle(card, random).map(({ town, industry, payoff }) => ({
      destination: town.name,
      industry,
      payoff
    }))
  )
  return shuffle(deck, random).map((demands, index) => ({ id: index + 1, demands }))
}
