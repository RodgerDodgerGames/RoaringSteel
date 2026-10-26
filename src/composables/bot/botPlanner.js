/**
 * Bot Planner (botPlanner.js)
 *
 * The decisions a computer player makes on its turn, as pure functions over
 * plain data: which demand to work toward, what to load and drop, where to
 * run the train next, and when to upgrade it. Carrying them out — and being
 * held to the rules while doing so — is left to the stores (see useBot.js).
 *
 * This first computer player aims to play correctly and quickly, not well.
 * Its plan, each turn:
 * - Work toward the demand that is cheapest to connect: the one needing the
 *   least new track to join a town producing the commodity and the town that
 *   wants it to the player's network. Only demands the player can afford to
 *   connect are worked toward, so it never spends itself into a corner.
 * - Run the train between towns on its own track only, loading what a demand
 *   in hand wants where it is produced and delivering it where it is wanted.
 * - Once it has the cash to win, join the major cities it still needs.
 * - Upgrade the train at set amounts of cash (see `BOT_UPGRADES`).
 *
 * Towns are matched to demands by name, as the demand cards and the trains
 * store match them.
 *
 * @module composables/bot/botPlanner
 */

/**
 * When the computer player changes its train: for more speed first, at
 * $80,000 in cash, and then for more room as well, at $140,000. Each change
 * costs a turn's building allowance (see config/trains.js).
 */
export const BOT_UPGRADES = Object.freeze([
  { from: 'freight', to: 'fastFreight', atCash: 80000 },
  { from: 'fastFreight', to: 'superfreight', atCash: 140000 }
])

/**
 * The kind of train to change to now, if any.
 * @param {string} type - The train's kind (a key of TRAIN_TYPES)
 * @param {number} cash - The player's cash
 * @returns {string|null} The kind to change to, or null to keep it
 */
export function upgradeFor(type, cash) {
  return BOT_UPGRADES.find((upgrade) => upgrade.from === type && cash >= upgrade.atCash)?.to ?? null
}

/**
 * Every demand line in a hand, each with the card it is on.
 * @param {Array<Object>} hand - Demand cards
 * @returns {Array<{cardId: number, line: number, demand: Object}>} The lines
 */
export function demandLines(hand) {
  return hand.flatMap((card) =>
    card.demands.map((demand, line) => ({ cardId: card.id, line, demand }))
  )
}

/**
 * Whether a town produces a commodity.
 * @param {Object} town - The town
 * @param {string} industry - The commodity's name
 * @returns {boolean} True if it does
 */
export function produces(town, industry) {
  return town.industries.some(({ name }) => name === industry)
}

/**
 * The demands worth working toward, cheapest to connect first.
 *
 * For each demand line: the cheapest town that wants it (towns sharing the
 * name are all candidates) and the cheapest town producing it — none needed
 * if the train already carries the load. A town already on the player's
 * network costs nothing; any other costs what track to it would (`costTo`).
 * A town is never its own producer: a load picked up where it is wanted
 * would make a delivery out of standing still.
 *
 * Demands that cannot be connected, or would cost more than the player has,
 * are left out. Ties go to the bigger payoff.
 *
 * @param {Array<Object>} lines - Demand lines (see `demandLines`)
 * @param {Object} board
 * @param {Array<Object>} board.towns - Every town
 * @param {Function} board.isJoined - Whether a town is on the player's network
 * @param {Function} board.costTo - What track to a town would cost
 * @param {Array<string>} board.loads - What the train carries
 * @param {number} board.cash - The player's cash
 * @returns {Array<{cardId: number, line: number, demand: Object, cost: number,
 *   toJoin: Array<Object>}>} The demands, with what connecting them costs and
 *   the towns still to be joined, cheapest of those first
 */
export function demandOptions(lines, { towns, isJoined, costTo, loads, cash }) {
  /** What joining a town costs: nothing if it is on the network already */
  const joinCost = (town) => (isJoined(town) ? 0 : costTo(town))
  /** The cheapest town to join from some candidates, or null */
  const cheapest = (candidates) =>
    candidates
      .map((town) => ({ town, cost: joinCost(town) }))
      .filter(({ cost }) => Number.isFinite(cost))
      .sort((a, b) => a.cost - b.cost)[0] ?? null

  const options = []
  lines.forEach(({ cardId, line, demand }) => {
    const destination = cheapest(towns.filter((town) => town.name === demand.destination))
    if (!destination) return

    const isCarried = loads.includes(demand.industry)
    const producer = isCarried
      ? null
      : cheapest(
          towns.filter(
            (town) => town.name !== demand.destination && produces(town, demand.industry)
          )
        )
    if (!isCarried && !producer) return

    const cost = destination.cost + (producer?.cost ?? 0)
    if (cost > cash) return

    const toJoin = [destination, producer]
      .filter((end) => end && !isJoined(end.town))
      .sort((a, b) => a.cost - b.cost)
      .map(({ town }) => town)
    options.push({ cardId, line, demand, cost, toJoin })
  })

  return options.sort((a, b) => a.cost - b.cost || b.demand.payoff - a.demand.payoff)
}

/**
 * How many of each commodity the demands in hand could use, given where the
 * train can take them: one per card that wants it in a town on the network
 * (a card pays for one of its demands, but which one is the player's choice).
 * Towns named in `excluding` do not count as destinations.
 * @param {Array<Object>} lines - Demand lines
 * @param {Set<string>} joinedNames - Names of the towns on the network
 * @param {string} [excluding] - A town name to leave out
 * @returns {Map<string, number>} How many, by commodity
 */
function usableLoads(lines, joinedNames, excluding) {
  const cardsWanting = new Map()
  lines.forEach(({ cardId, demand }) => {
    if (!joinedNames.has(demand.destination) || demand.destination === excluding) return
    if (!cardsWanting.has(demand.industry)) cardsWanting.set(demand.industry, new Set())
    cardsWanting.get(demand.industry).add(cardId)
  })
  return new Map([...cardsWanting].map(([industry, cards]) => [industry, cards.size]))
}

/**
 * How many of a commodity a list of loads holds.
 * @param {Array<string>} loads - The loads
 * @param {string} industry - The commodity
 * @returns {number} How many
 */
const countOf = (loads, industry) => loads.filter((load) => load === industry).length

/**
 * What to pick up in a town: commodities it produces that a demand in hand
 * wants delivered to another town on the network, as many as the cards
 * could use, and no more than the train has room for.
 * @param {Object} town - The town the train is in
 * @param {Object} train
 * @param {Array<string>} train.loads - What it carries
 * @param {number} train.capacity - How many loads it holds
 * @param {Array<Object>} lines - Demand lines in hand
 * @param {Set<string>} joinedNames - Names of the towns on the network
 * @returns {Array<string>} The commodities to load, one per load
 */
export function loadsToPickUp(town, { loads, capacity }, lines, joinedNames) {
  const usable = usableLoads(lines, joinedNames, town.name)
  const picked = []
  town.industries.forEach(({ name }) => {
    const wanted = (usable.get(name) ?? 0) - countOf(loads, name)
    for (let i = 0; i < wanted && loads.length + picked.length < capacity; i++) picked.push(name)
  })
  return picked
}

/**
 * What to drop: loads no demand in hand wants anywhere, which would only
 * take up room. A load wanted somewhere off the network is kept, since
 * track may yet reach there.
 * @param {Array<string>} loads - What the train carries
 * @param {Array<Object>} lines - Demand lines in hand
 * @returns {Array<string>} The loads to drop
 */
export function loadsToDrop(loads, lines) {
  const wanted = new Set(lines.map(({ demand }) => demand.industry))
  return loads.filter((load) => !wanted.has(load))
}

/**
 * Where to run the train next: the nearest town on the network where it can
 * deliver a load it carries, or load something a demand can use (see
 * `loadsToPickUp`). Only towns on the player's own network count, and only
 * ways there that pay nobody for their track: the computer player keeps to
 * its own track.
 * @param {Array<Object>} destinations - Where the train can go (see
 *   `destinations` in the trains store), nearest first
 * @param {Object} train
 * @param {Array<string>} train.loads - What it carries
 * @param {number} train.capacity - How many loads it holds
 * @param {string|null} train.here - The name of the town it is in, if any
 * @param {Array<Object>} lines - Demand lines in hand
 * @param {Set<string>} joinedNames - Names of the towns on the network
 * @returns {Object|null} The destination to head for, or null for nowhere
 */
export function nextStop(destinations, { loads, capacity, here }, lines, joinedNames) {
  return (
    destinations.find(({ town, payTo }) => {
      if (payTo.length > 0 || town.name === here || !joinedNames.has(town.name)) return false
      const delivers = lines.some(
        ({ demand }) => demand.destination === town.name && loads.includes(demand.industry)
      )
      return delivers || loadsToPickUp(town, { loads, capacity }, lines, joinedNames).length > 0
    }) ?? null
  )
}
