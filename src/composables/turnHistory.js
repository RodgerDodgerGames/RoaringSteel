/**
 * Turn History (turnHistory.js)
 *
 * Puts the game's turn history into words for the people at the table (see
 * the history store, which keeps it). Every turn can be read two ways:
 * - as a summary, one sentence for the whole turn: "Ann delivered Coal to
 *   Pueblo for $12,000, paid Bo $1,000 in track fees, and built $8,000 of
 *   track, reaching Denver.";
 * - in full, one line for each thing the player did, in the order they did
 *   it: "Ran to Pueblo, paying Bo $1,000 to run on their track", "Delivered
 *   Coal to Pueblo for $12,000", "Built $5,000 of track, reaching Denver".
 *
 * A turn is { round, playerId, events, won, hadProblem }, and each event is
 * one of:
 * - { type: 'place', town }                 the train put on the board
 * - { type: 'move', town, arrived, paid }   a run toward a town; `paid` is
 *                                           the track fees, [{ ownerId, amount }]
 * - { type: 'pickup', industry, town }
 * - { type: 'deliver', industry, town, payoff }
 * - { type: 'drop', industry, town }
 * - { type: 'upgrade', from, to }           train kinds, by name
 * - { type: 'discard' }                     the hand thrown in, the whole turn
 * - { type: 'build', cost, reached }        a section of track; `reached` is
 *                                           the towns it joined, by name
 *
 * Players are named by id when the words are made, not when the turn is
 * recorded, so a fee paid to a player always reads with the name they have.
 *
 * This module also works out the track a turn built (`sectionsBuilt`): track
 * can be torn up again until the turn ends, so it is read off the board as
 * the turn closes rather than recorded as it is laid.
 *
 * @module composables/turnHistory
 */

import { formatCurrency } from '@/composables/utils'
import { pointKey } from '@/composables/network'

/**
 * Joins phrases into an English list: "a", "a and b", "a, b, and c".
 * @param {Array<string>} parts - The phrases
 * @returns {string} The list
 */
function listOf(parts) {
  if (parts.length < 3) return parts.join(' and ')
  return `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`
}

/** A phrase with its first letter in capitals, to start a line with */
const capitalized = (text) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * The sections of track a player built in one round, each with the towns it
 * joined to their network, in the order they were built.
 *
 * A town counts as joined by the first section with a point on it — the one
 * its track runs through or ends in — so a town reached by the player's track
 * in an earlier turn is not joined again. Unlike town entry fees (see
 * townEntry.js), a major city a section merely starts from counts too: it is
 * on the player's network from then on, which is what the history is for.
 *
 * @param {Array<Object>} segments - All of one player's sections, in the
 *   order they were built, each with its `coordinates` and the `turn` (round)
 *   it was built in (see the track store)
 * @param {number} round - The round whose building is wanted
 * @param {Map<string, Object>} byKey - Towns by point key (see `townsByKey`)
 * @returns {Array<{type: 'build', cost: number, reached: Array<string>}>}
 *   The round's sections, as history events
 */
export function sectionsBuilt(segments, round, byKey) {
  const reached = new Set()
  const built = []
  segments.forEach((segment) => {
    const keys = segment.coordinates.map(pointKey)
    if (segment.turn === round) {
      // A Set, so a line that loops back through a town names it once
      const joined = new Set(keys.filter((key) => byKey.has(key) && !reached.has(key)))
      built.push({
        type: 'build',
        cost: segment.cost,
        reached: [...joined].map((key) => byKey.get(key).name)
      })
    }
    keys.forEach((key) => reached.add(key))
  })
  return built
}

/**
 * The track fees a turn paid, added up for each player paid, in the order
 * they were first paid.
 * @param {Array<Object>} events - The turn's events
 * @returns {Array<{ownerId: number, amount: number}>} The fees by player
 */
function feesPaid(events) {
  const byOwner = new Map()
  events
    .filter(({ type }) => type === 'move')
    .flatMap(({ paid }) => paid ?? [])
    .forEach(({ ownerId, amount }) => byOwner.set(ownerId, (byOwner.get(ownerId) ?? 0) + amount))
  return [...byOwner].map(([ownerId, amount]) => ({ ownerId, amount }))
}

/** A section of track in words: "built $5,000 of track, reaching Denver" */
function buildPhrase(cost, reached) {
  const reaching = reached.length ? `, reaching ${listOf(reached)}` : ''
  return `built ${formatCurrency(cost)} of track${reaching}`
}

/**
 * One event in words, as a line of its own (the full history). Lines start
 * with a capital, and the player is left out: the turn's heading names them.
 * @param {Object} event - One of the turn's events (see the module notes)
 * @param {Function} nameOf - A player's name, from their id
 * @returns {string} The line, or '' for an event of a kind it does not know
 */
export function describeEvent(event, nameOf) {
  switch (event.type) {
    case 'place':
      return `Put the train in ${event.town}`
    case 'move': {
      const run = event.arrived
        ? `Ran to ${event.town}`
        : `Headed for ${event.town}, stopping short`
      const fees = (event.paid ?? []).map(
        ({ ownerId, amount }) => `${nameOf(ownerId)} ${formatCurrency(amount)}`
      )
      return fees.length ? `${run}, paying ${listOf(fees)} in track fees` : run
    }
    case 'pickup':
      return `Picked up ${event.industry} in ${event.town}`
    case 'deliver':
      return `Delivered ${event.industry} to ${event.town} for ${formatCurrency(event.payoff)}`
    case 'drop':
      return `Dropped ${event.industry} in ${event.town}`
    case 'upgrade':
      return `Upgraded their ${event.from} to a ${event.to}`
    case 'discard':
      return 'Threw in their demand cards for new ones'
    case 'build':
      return capitalized(buildPhrase(event.cost, event.reached))
    default:
      return ''
  }
}

/**
 * A turn in full: a line for each thing the player did, in order, and a last
 * line if it won the game. A turn in which they did nothing says so.
 * @param {Object} turn - A turn of the history (see the module notes)
 * @param {Function} nameOf - A player's name, from their id
 * @returns {Array<string>} The lines
 */
export function turnLines(turn, nameOf) {
  const lines = turn.events.map((event) => describeEvent(event, nameOf)).filter(Boolean)
  if (turn.won) lines.push('Won the game!')
  return lines.length ? lines : ['Passed']
}

/**
 * A turn in a sentence (the summary history). Read for the gist, so:
 * - train business — placing it, deliveries, pickups, drops — is told in the
 *   order it was done, each naming its town;
 * - of the train's runs, only where it ended up is told, and only when its
 *   last stop has nothing else to say so;
 * - track fees are added up for each player paid;
 * - the turn's track is added up into one figure, with every town it reached.
 * A turn spent throwing in the hand is only that.
 *
 * @param {Object} turn - A turn of the history (see the module notes)
 * @param {Function} nameOf - A player's name, from their id
 * @returns {string} The sentence, starting with the player's name
 */
export function summarizeTurn(turn, nameOf) {
  const name = nameOf(turn.playerId)
  const { events } = turn
  if (events.some(({ type }) => type === 'discard')) {
    return `${name} threw in their demand cards for new ones.`
  }

  const parts = []
  events.forEach((event) => {
    switch (event.type) {
      case 'place':
        parts.push(`put their train in ${event.town}`)
        break
      case 'deliver':
        parts.push(
          `delivered ${event.industry} to ${event.town} for ${formatCurrency(event.payoff)}`
        )
        break
      case 'pickup':
        parts.push(`picked up ${event.industry} in ${event.town}`)
        break
      case 'drop':
        parts.push(`dropped ${event.industry} in ${event.town}`)
        break
      case 'upgrade':
        parts.push(`upgraded their ${event.from} to a ${event.to}`)
        break
    }
  })

  // Where the train ended up, if its last stop had nothing else to say so
  const trainEvents = events.filter(({ type }) => type !== 'build' && type !== 'upgrade')
  const lastMove = trainEvents.at(-1)?.type === 'move' ? trainEvents.at(-1) : null
  if (lastMove) {
    parts.push(lastMove.arrived ? `ran to ${lastMove.town}` : `headed for ${lastMove.town}`)
  }

  const fees = feesPaid(events)
  if (fees.length) {
    const paid = fees.map(({ ownerId, amount }) => `${nameOf(ownerId)} ${formatCurrency(amount)}`)
    parts.push(`paid ${listOf(paid)} in track fees`)
  }

  const builds = events.filter(({ type }) => type === 'build')
  if (builds.length) {
    const cost = builds.reduce((sum, build) => sum + build.cost, 0)
    parts.push(
      buildPhrase(
        cost,
        builds.flatMap((build) => build.reached)
      )
    )
  }

  const did = parts.length ? `${name} ${listOf(parts)}` : `${name} passed`
  return turn.won ? `${did}, and won the game!` : `${did}.`
}
