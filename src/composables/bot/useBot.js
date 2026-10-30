/**
 * Bot (useBot.js)
 *
 * Plays a computer player's turn. Everything it does goes through the same
 * calls the player dock makes for a person — the trains store, the track
 * builder, throwing in a hand through the turn composable — so a computer
 * player is held to exactly the rules a person is, and cannot do anything a
 * person could not. What it decides to do comes from the planner (see
 * botPlanner.js) and the track it lays out from the pathfinder (see
 * botPathfinder.js).
 *
 * A turn, in order:
 * 1. In an operating round, if no demand in hand can be worked toward —
 *    none can be connected with the cash the player has — throw the hand in
 *    for a new one, which is the whole turn.
 * 2. In an operating round, run the train: place it on the network the first
 *    time, then go from town to town on the player's own track, delivering
 *    and loading, until it has run its distance or has nowhere useful to go.
 * 3. Upgrade the train, at the cash the planner says — unless the player has
 *    the cash to win and only needs cities, when the money goes on those.
 * 4. Build track with what is left of the turn's allowance: toward the major
 *    cities still needed once the player has the cash to win, otherwise
 *    toward the towns the cheapest demand still needs joined.
 *
 * The player's network is kept in one piece, so its train can get anywhere
 * on it: track starts from a major city only for the very first section, and
 * from the player's own track after that.
 *
 * Ending the turn is left to the caller (see useBotRunner.js), except when
 * the hand is thrown in, which ends the turn itself.
 *
 * @module composables/bot/useBot
 */

import { gameRules } from '@/config/game'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/players'
import { useTownsStore } from '@/stores/towns'
import { useTrackStore } from '@/stores/track'
import { useNetworkStore } from '@/stores/network'
import { useTrainsStore } from '@/stores/trains'
import { useDemandCardsStore } from '@/stores/demandCards'
import { useTrackBuilder } from '@/composables/trackBuilder'
import { useTurn } from '@/composables/useTurn'
import { useVictory } from '@/composables/victory'
import { townKey } from '@/composables/network'
import { formatCurrency } from '@/composables/utils'
import { searchBoard, costField, planLine, affordableSection } from './botPathfinder'
import {
  upgradeFor,
  demandLines,
  demandOptions,
  loadsToPickUp,
  loadsToDrop,
  nextStop
} from './botPlanner'

/**
 * The most stops a train makes in one turn. A train's run always ends long
 * before this — it stops when its distance is used up or it has nowhere
 * useful to go — so this only guards against a plan that would go round in
 * circles.
 */
const MAX_STOPS = 20

/**
 * The most sections built in one turn. Each section reaches a town or uses
 * up the money, so a few is plenty; this guards against a loop that builds
 * nothing.
 */
const MAX_SECTIONS = 4

/**
 * The most times the builder looks for a target in one turn, counting the
 * towns it gives up on because no buildable line reaches them.
 */
const MAX_PASSES = 10

/** A town's place on the map, as track points are written */
const pointOf = (town) => ({ lat: town.lat, lng: town.lon })

export function useBot() {
  const gameStore = useGameStore()
  const playerStore = usePlayerStore()
  const townsStore = useTownsStore()
  const trackStore = useTrackStore()
  const networkStore = useNetworkStore()
  const trainsStore = useTrainsStore()
  const demandCardsStore = useDemandCardsStore()
  const builder = useTrackBuilder()
  const { canDiscardHand, discardHand } = useTurn()
  const { progress } = useVictory()

  /** A player's cash */
  const cashOf = (playerId) => playerStore.players.find((p) => p.id === playerId)?.cash ?? 0

  /**
   * The towns on a player's network: those their own track has a point on.
   * @param {number} playerId - The player
   * @returns {Set<string>} The towns' ids
   */
  function joinedTownIds(playerId) {
    const { adjacency } = networkStore.network
    return new Set(
      townsStore.towns
        .filter((town) => adjacency.get(townKey(town))?.some((edge) => edge.ownerId === playerId))
        .map((town) => town.msa)
    )
  }

  /**
   * What a player holds: the towns on their network, and the demand lines
   * in their hand. Cheap to work out, so the train asks afresh at every stop.
   * @param {number} playerId - The player
   * @returns {{joined: Set<string>, isJoined: Function, joinedNames: Set<string>,
   *   lines: Array<Object>}} The towns' ids and names, and the lines
   */
  function holdings(playerId) {
    const joined = joinedTownIds(playerId)
    const isJoined = (town) => joined.has(town.msa)
    const joinedNames = new Set(townsStore.towns.filter(isJoined).map((town) => town.name))
    const lines = demandLines(demandCardsStore.handOf(playerId))
    return { joined, isJoined, joinedNames, lines }
  }

  /**
   * Everything the player needs to plan building: what they hold, the search
   * board, where they would build from, what track to anywhere would cost,
   * and the demands worth working toward (see `demandOptions`). Runs searches
   * over the whole grid, so it is only asked for when building or deciding
   * whether to throw in the hand.
   *
   * A player with track builds on from it, which keeps their network in one
   * piece so the train can reach all of it. A player with none yet may start
   * in any major city (the start rule — see trackBuilder.js), but a network
   * has to start in one of them: the city whose best demand is cheapest to
   * connect from there is picked, and planned from as though already joined.
   *
   * @param {number} playerId - The player
   * @returns {Object} The picture: `sources` to build from and the search
   *   from them (`field`, see `costField`), `isJoined` and `costTo` for any
   *   town, and the demand `options`, besides what `holdings` gives
   */
  function survey(playerId) {
    const held = holdings(playerId)
    const board = searchBoard(builder.buildRules.value, townsStore.towns)

    // Every question the plan asks of a search is what track to some town
    // would cost, or the line there, so each search stops once it has
    // reached every town
    const townPoints = townsStore.towns.map(pointOf)

    /** The plan if the player builds from these points */
    const planFrom = (sources, isJoined) => {
      const field = costField(board, sources, { targets: townPoints })
      const costTo = (town) => field.costTo(pointOf(town))
      const options = demandOptions(held.lines, {
        towns: townsStore.towns,
        isJoined,
        costTo,
        loads: trainsStore.trainOf(playerId).loads,
        cash: cashOf(playerId)
      })
      return { sources, field, isJoined, costTo, options }
    }

    const own = trackStore.segmentsForOwner(playerId).flatMap(({ coordinates }) => coordinates)
    if (own.length) return { ...held, board, ...planFrom(own, held.isJoined) }

    const starts = townsStore.towns
      .filter((town) => town.size === 'large')
      .map((city) => planFrom([pointOf(city)], (town) => town.msa === city.msa))
    const [best] = starts
      .filter(({ options }) => options.length)
      .sort((a, b) => a.options[0].cost - b.options[0].cost)
    return { ...held, board, ...(best ?? planFrom([], held.isJoined)) }
  }

  /**
   * Plays a computer player's turn (see the module notes). The caller ends
   * the turn afterwards, unless `endedTurn` says it already has.
   *
   * Every action the stores refuse is recorded in `errors`. The plan only
   * asks for what the rules allow, so a refusal means the plan and the rules
   * disagree: the turn carries on without that action, and the refusal is
   * logged so it can be found.
   *
   * @param {number} playerId - The computer player whose turn it is
   * @returns {{events: Array<Object>, errors: Array<Object>, endedTurn: boolean}}
   *   What it did, what was refused, and whether the turn has already ended
   */
  function playTurn(playerId) {
    const report = { events: [], errors: [], endedTurn: false }
    if (gameStore.isOver || playerStore.activePlayer?.id !== playerId) return report

    /** Records a refused action; true if it went through */
    const tried = (action, result) => {
      if (result.ok) return true
      report.errors.push({ action, error: result.error })
      console.warn(`Computer player ${playerId}: ${action} refused:`, result.error)
      return false
    }

    if (!gameStore.isBuildingRound) {
      if (canDiscardHand.value && shouldThrowInHand(playerId)) {
        if (discardHand()) {
          report.events.push({ type: 'discard' })
          report.endedTurn = true
          return report
        }
      }
      runTrain(playerId, report, tried)
      if (gameStore.isOver) return report
      upgradeTrain(playerId, report, tried)
    }
    buildTrack(playerId, report, tried)
    return report
  }

  /**
   * Whether the player has the cash to win and only lacks major cities, so
   * their turns go on joining those rather than on demands.
   * @param {number} playerId - The player
   * @returns {boolean} True while joining cities
   */
  function isJoiningCities(playerId) {
    const { cash, cashNeeded, citiesJoined, citiesNeeded } = progress(playerId)
    return cash >= cashNeeded && citiesJoined < citiesNeeded
  }

  /**
   * Whether the hand is no good: no demand in it can be worked toward with
   * the cash the player has, so a new hand is worth the turn. Never while
   * the player is joining cities, which needs the turn and not the hand.
   * @param {number} playerId - The player
   * @returns {boolean} True to throw it in
   */
  function shouldThrowInHand(playerId) {
    return !isJoiningCities(playerId) && survey(playerId).options.length === 0
  }

  /**
   * Runs the train for the turn: placed on the network the first time, then
   * from stop to stop, delivering and loading in each town (see the module
   * notes).
   */
  function runTrain(playerId, report, tried) {
    if (!trainsStore.trainOf(playerId).position) {
      const town = placementTown(playerId)
      // With no track of its own yet there is nowhere useful to put it
      if (!town) return
      if (!tried('place train', trainsStore.placeTrain(playerId, town.msa))) return
      report.events.push({ type: 'place', town: town.name })
    }

    for (let stop = 0; stop < MAX_STOPS && !gameStore.isOver; stop++) {
      if (trainsStore.townOf(playerId)) workTown(playerId, report, tried)
      if (gameStore.isOver || trainsStore.kmLeft(playerId) <= 0) return

      const { lines, joinedNames } = holdings(playerId)
      const train = trainsStore.trainOf(playerId)
      const destination = nextStop(
        trainsStore.destinations(playerId),
        {
          loads: train.loads,
          capacity: trainsStore.trainTypeOf(playerId).capacity,
          here: trainsStore.townOf(playerId)?.name ?? null
        },
        lines,
        joinedNames
      )
      if (!destination) return

      const result = trainsStore.moveTrain(playerId, destination.town.msa)
      if (!tried('move train', result)) return
      report.events.push({ type: 'move', town: destination.town.name, arrived: result.arrived })
      if (!result.arrived) return
    }
  }

  /**
   * Where to put the train on the board: a town on the player's network
   * where it can load something a demand wants, or failing that any town on
   * the network. Null when the player has no track yet.
   * @param {number} playerId - The player
   * @returns {Object|null} The town
   */
  function placementTown(playerId) {
    const { joined, lines, joinedNames } = holdings(playerId)
    const onNetwork = townsStore.towns.filter((town) => joined.has(town.msa))
    const emptyTrain = { loads: [], capacity: trainsStore.trainTypeOf(playerId).capacity }
    return (
      onNetwork.find((town) => loadsToPickUp(town, emptyTrain, lines, joinedNames).length) ??
      onNetwork[0] ??
      null
    )
  }

  /**
   * Does the business of the town the train is in: delivers every load a
   * demand wants here (the best payoff first, since each delivery replaces
   * its card), drops loads no demand wants, and loads what demands can use.
   */
  function workTown(playerId, report, tried) {
    const town = trainsStore.townOf(playerId)

    for (;;) {
      const [best] = trainsStore
        .deliveryOptions(playerId)
        .sort((a, b) => b.demand.payoff - a.demand.payoff)
      if (!best) break
      const result = trainsStore.deliver(playerId, best.cardId, best.line)
      if (!tried('deliver', result)) break
      report.events.push({
        type: 'deliver',
        industry: best.demand.industry,
        town: town.name,
        payoff: result.payoff
      })
      if (result.won) return
    }

    const { lines, joinedNames } = holdings(playerId)
    loadsToDrop(trainsStore.trainOf(playerId).loads, lines).forEach((industry) => {
      if (tried('drop load', trainsStore.dropLoad(playerId, industry))) {
        report.events.push({ type: 'drop', industry, town: town.name })
      }
    })

    const train = {
      loads: trainsStore.trainOf(playerId).loads,
      capacity: trainsStore.trainTypeOf(playerId).capacity
    }
    loadsToPickUp(town, train, lines, joinedNames).forEach((industry) => {
      if (tried('pick up', trainsStore.pickUp(playerId, industry))) {
        report.events.push({ type: 'pickup', industry, town: town.name })
      }
    })
  }

  /**
   * Changes the train for a better one when the planner says it is time —
   * but not while joining cities (see `isJoiningCities`): an upgrade takes
   * the turn's allowance and cash the win needs.
   */
  function upgradeTrain(playerId, report, tried) {
    if (isJoiningCities(playerId)) return
    const to = upgradeFor(trainsStore.trainOf(playerId).type, cashOf(playerId))
    if (!to) return
    if (tried('upgrade train', trainsStore.changeTrain(playerId, to))) {
      report.events.push({ type: 'upgrade', to: trainsStore.trainTypeOf(playerId).name })
    }
  }

  /**
   * The town to build toward next, and how much may go on it, or null for
   * none.
   *
   * While the player is joining cities (see `isJoiningCities`), the cheapest
   * major city not yet on their network, with only the cash above what
   * winning needs to spend on it: spending below that line would leave them
   * with every city and not the cash, and back to chasing demands. With
   * nothing to spare, they build nothing and deliver until they have some.
   * Otherwise the cheapest town still to be joined for the cheapest demand
   * that needs any, with whatever the turn allows.
   *
   * @param {number} playerId - The player
   * @param {Object} picture - From `survey`
   * @param {Set<string>} given - Towns already given up on this turn
   * @returns {{town: Object, spendable: number}|null} The town, and the most
   *   that may be spent on it beyond the turn's own limits
   */
  function buildTarget(playerId, picture, given) {
    if (isJoiningCities(playerId)) {
      const [city] = townsStore.towns
        .filter((town) => town.size === 'large' && !picture.isJoined(town) && !given.has(town.msa))
        .map((town) => ({ town, cost: picture.costTo(town) }))
        .filter(({ cost }) => Number.isFinite(cost))
        .sort((a, b) => a.cost - b.cost)
      if (city) return { town: city.town, spendable: cashOf(playerId) - gameRules.victory.cash }
    }

    for (const option of picture.options) {
      const town = option.toJoin.find((candidate) => !given.has(candidate.msa))
      if (town) return { town, spendable: Infinity }
    }
    return null
  }

  /**
   * Builds track toward the planner's targets with what the player can spend
   * this turn, a section at a time. A section that cannot all be paid for
   * now is built as far as the money goes, and finished on later turns.
   */
  function buildTrack(playerId, report, tried) {
    // Towns no buildable line could be found to, not tried again this turn
    const given = new Set()
    let sections = 0

    // Each pass either builds, gives up on a town, or stops; there are only
    // so many towns to give up on, so the passes are capped as well
    for (let pass = 0; pass < MAX_PASSES && sections < MAX_SECTIONS; pass++) {
      if (playerStore.availableForTrack(playerId) <= 0) return

      const picture = survey(playerId)
      const target = buildTarget(playerId, picture, given)
      if (!target) return
      const budget = Math.min(playerStore.availableForTrack(playerId), target.spendable)
      if (budget <= 0) return

      // The survey's own search is the planner's first try
      const line = planLine(picture.board, picture.sources, pointOf(target.town), picture.field)
      if (!line) {
        given.add(target.town.msa)
        continue
      }
      const section = affordableSection(line, budget, picture.board.rules)
      if (!section) return

      const result = builder.buildSection(playerId, section)
      if (!tried('build track', result)) return
      sections++
      report.events.push({ type: 'build', cost: result.cost, toward: target.town.name })
      // Out of money before the town was reached: the rest waits for next turn
      if (section.length < line.length) return
    }
  }

  return { playTurn }
}

/**
 * A computer player's turn in a sentence, for the people at the table:
 * "Bot 1 delivered Coal to Lowell for $12,000, picked up Steel in Boston,
 * and built $9,500 of track toward Worcester."
 * @param {string} name - The computer player's name
 * @param {Array<Object>} events - What it did (see `playTurn`)
 * @returns {string} The sentence
 */
export function describeTurn(name, events) {
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
        parts.push(`upgraded to a ${event.to}`)
        break
    }
  })

  // Building is summed up: one figure for the turn, and where it was headed
  const builds = events.filter(({ type }) => type === 'build')
  if (builds.length) {
    const total = builds.reduce((sum, { cost }) => sum + cost, 0)
    const toward = [...new Set(builds.map((build) => build.toward))].join(' and ')
    parts.push(`built ${formatCurrency(total)} of track toward ${toward}`)
  }

  // Where the train ended up, if its last stop had nothing else to say so
  const trainEvents = events.filter(({ type }) => type !== 'build' && type !== 'upgrade')
  const lastMove = trainEvents.at(-1)?.type === 'move' ? trainEvents.at(-1) : null
  if (lastMove) {
    parts.push(lastMove.arrived ? `ran to ${lastMove.town}` : `headed for ${lastMove.town}`)
  }

  if (!parts.length) return `${name} passed.`
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}` : parts[0]
  return `${name} ${list}.`
}
