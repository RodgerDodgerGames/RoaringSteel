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
 * on it: track starts in a town (see startRule.js) only for the very first
 * section, and from the player's own track after that.
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
import { botStartTowns } from '@/composables/startRule'
import { searchBoard, costField, planLine, affordableSection } from './botPathfinder'
import {
  upgradeFor,
  demandLines,
  reviewDemands,
  workableDemands,
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
   * every demand in hand weighed up (see `reviewDemands`) and those worth
   * working toward (see `workableDemands`). Runs searches
   * over the whole grid, so it is only asked for when building or deciding
   * whether to throw in the hand.
   *
   * A player with track builds on from it, which keeps their network in one
   * piece so the train can reach all of it. A player with none yet picks a
   * town to start in, among those the start rule allows (see startRule.js):
   * the major cities and the towns its demand cards want deliveries in, or
   * only the major cities if the game says track must start in one (see
   * `botStartTowns`). The town whose best demand is cheapest to connect from
   * there is picked, and planned from as though already joined.
   *
   * @param {number} playerId - The player
   * @returns {Object} The picture: `sources` to build from and the search
   *   from them (`field`, see `costField`), `isJoined` and `costTo` for any
   *   town, the demand `review` and the workable `options` from it, and —
   *   for a player with no track yet — the `start` city picked, besides what
   *   `holdings` gives
   */
  function survey(playerId) {
    const held = holdings(playerId)
    // Searched with this player's entry fees: towns their track reaches
    // already cost nothing more to build into
    const board = searchBoard(
      builder.buildRules.value,
      townsStore.towns,
      builder.reachedKeys(playerId)
    )

    // Every question the plan asks of a search is what track to some town
    // would cost, or the line there, so each search stops once it has
    // reached every town
    const townPoints = townsStore.towns.map(pointOf)

    /** The plan if the player builds from these points */
    const planFrom = (sources, isJoined) => {
      const field = costField(board, sources, { targets: townPoints })
      const costTo = (town) => field.costTo(pointOf(town))
      const review = reviewDemands(held.lines, {
        towns: townsStore.towns,
        isJoined,
        costTo,
        loads: trainsStore.trainOf(playerId).loads,
        cash: cashOf(playerId)
      })
      return { sources, field, isJoined, costTo, review, options: workableDemands(review) }
    }

    const own = trackStore.segmentsForOwner(playerId).flatMap(({ coordinates }) => coordinates)
    if (own.length) return { ...held, board, ...planFrom(own, held.isJoined) }

    const destinations = held.lines.map(({ demand }) => demand.destination)
    const requireMajorCity = gameStore.gameSettings.requireMajorCityStart
    const starts = botStartTowns(townsStore.towns, requireMajorCity, destinations).map(
      (startTown) => ({
        start: startTown,
        ...planFrom([pointOf(startTown)], (town) => town.msa === startTown.msa)
      })
    )
    // The town whose cheapest demand costs least to connect. Whenever any
    // demand is workable from some city, the cheapest one anywhere is, so
    // this is the city with the cheapest workable demand. When none is, it
    // still picks the city that comes closest, so the review it hands back
    // says what each demand would cost from there — "too dear", not "out of
    // reach" — though there is then nothing to work toward either way.
    const cheapestDemand = ({ review }) =>
      Math.min(...review.map(({ cost }) => cost).filter(Number.isFinite))
    const [best] = starts
      .filter((start) => Number.isFinite(cheapestDemand(start)))
      .sort((a, b) => cheapestDemand(a) - cheapestDemand(b))
    return { ...held, board, ...(best ?? planFrom([], held.isJoined)) }
  }

  /**
   * Plays a computer player's turn (see the module notes). The caller ends
   * the turn afterwards, unless `endedTurn` says it already has.
   *
   * Every action the stores refuse is recorded in `errors`. The plan only
   * asks for what the rules allow, so a refusal means the plan and the rules
   * disagree: the turn carries on without that action, and the refusal is
   * logged so it can be found. A turn that goes wrong in a way nobody
   * foresaw (the code throws) is caught here too: the error is logged and
   * recorded in `errors` as a `turn` problem, and the report comes back as
   * far as the turn got, trace and all, so debug mode can show what led up
   * to it. The caller ends the turn as it stands.
   *
   * Besides what it did, the report keeps a `trace` of why — what the
   * player weighed up and where each part of the turn stopped — for debug
   * mode to print (see botTurnLog.js):
   * - `cashBefore`, `cashAfter`: the player's cash either side of the turn
   * - `demands`: every demand in hand, weighed up (see `reviewDemands`), as
   *   last seen when deciding to throw in the hand or to build; `demandsWhen`
   *   says which. Absent if neither was looked at.
   * - `startCity`: for a player with no track yet, the town their building
   *   was planned from (see `survey`)
   * - `trainStop`: why the train stopped where it did
   * - `build`: each try at building, in order (see `buildTrack`), and
   *   `buildStop`: why building stopped
   *
   * @param {number} playerId - The computer player whose turn it is
   * @returns {{events: Array<Object>, errors: Array<Object>, endedTurn: boolean,
   *   trace: Object}} What it did, what was refused, whether the turn has
   *   already ended, and why it played as it did
   */
  function playTurn(playerId) {
    const report = { events: [], errors: [], endedTurn: false, trace: { build: [] } }
    if (gameStore.isOver || playerStore.activePlayer?.id !== playerId) return report
    report.trace.cashBefore = cashOf(playerId)

    /** Records a refused action; true if it went through */
    const tried = (action, result) => {
      if (result.ok) return true
      report.errors.push({ action, error: result.error })
      console.warn(`Computer player ${playerId}: ${action} refused:`, result.error)
      return false
    }

    try {
      playParts(playerId, report, tried)
    } catch (error) {
      console.error(`Computer player ${playerId} could not finish their turn:`, error)
      report.errors.push({ action: 'turn', error: String(error) })
    }
    report.trace.cashAfter = cashOf(playerId)
    return report
  }

  /**
   * The parts of a turn, in order (see the module notes), each recording
   * what it did in the report. Apart from `playTurn` only so that every way
   * the turn can end passes back through it to note the cash left.
   */
  function playParts(playerId, report, tried) {
    if (!gameStore.isBuildingRound) {
      if (canDiscardHand.value && shouldThrowInHand(playerId, report.trace)) {
        if (discardHand()) {
          report.events.push({ type: 'discard' })
          report.endedTurn = true
          return
        }
      }
      report.trace.trainStop = runTrain(playerId, report, tried)
      if (gameStore.isOver) return
      upgradeTrain(playerId, report, tried)
    }
    report.trace.buildStop = buildTrack(playerId, report, tried)
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
   * @param {Object} trace - The turn's trace (see `playTurn`), given the
   *   demands as weighed up here
   * @returns {boolean} True to throw it in
   */
  function shouldThrowInHand(playerId, trace) {
    if (isJoiningCities(playerId)) return false
    const { review, options } = survey(playerId)
    trace.demands = review
    trace.demandsWhen = 'deciding whether to throw in the hand'
    return options.length === 0
  }

  /**
   * Runs the train for the turn: placed on the network the first time, then
   * from stop to stop, delivering and loading in each town (see the module
   * notes). Each move records the distance the train has left after it.
   * @returns {string} Why the train stopped where it did, for the trace
   */
  function runTrain(playerId, report, tried) {
    if (!trainsStore.trainOf(playerId).position) {
      const town = placementTown(playerId)
      // With no track of its own yet there is nowhere useful to put it
      if (!town) return 'no track of its own to put the train on yet'
      if (!tried('place train', trainsStore.placeTrain(playerId, town.msa))) {
        return 'placing the train was refused'
      }
      report.events.push({ type: 'place', town: town.name })
    }

    for (let stop = 0; stop < MAX_STOPS; stop++) {
      if (trainsStore.townOf(playerId)) workTown(playerId, report, tried)
      if (gameStore.isOver) return 'the game is won'
      if (trainsStore.kmLeft(playerId) <= 0) return 'its distance for the turn is used up'

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
      if (!destination) return 'nowhere on its own track has anything to deliver or load'

      const result = trainsStore.moveTrain(playerId, destination.town.msa)
      if (!tried('move train', result)) return 'the move was refused'
      report.events.push({
        type: 'move',
        town: destination.town.name,
        arrived: result.arrived,
        kmLeft: trainsStore.kmLeft(playerId)
      })
      if (!result.arrived) return `its distance ran out on the way to ${destination.town.name}`
    }
    return `it made the most stops allowed in a turn (${MAX_STOPS})`
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
   * @returns {{town: Object, spendable: number, why: string}|null} The town,
   *   the most that may be spent on it beyond the turn's own limits, and in
   *   a few words why it was picked
   */
  function buildTarget(playerId, picture, given) {
    if (isJoiningCities(playerId)) {
      const [city] = townsStore.towns
        .filter((town) => town.size === 'large' && !picture.isJoined(town) && !given.has(town.msa))
        .map((town) => ({ town, cost: picture.costTo(town) }))
        .filter(({ cost }) => Number.isFinite(cost))
        .sort((a, b) => a.cost - b.cost)
      if (city) {
        return {
          town: city.town,
          spendable: cashOf(playerId) - gameRules.victory.cash,
          why: 'a major city still needed to win'
        }
      }
    }

    for (const option of picture.options) {
      const town = option.toJoin.find((candidate) => !given.has(candidate.msa))
      if (town) {
        const { industry, destination } = option.demand
        return { town, spendable: Infinity, why: `for ${industry} to ${destination}` }
      }
    }
    return null
  }

  /**
   * Builds track toward the planner's targets with what the player can spend
   * this turn, a section at a time. A section that cannot all be paid for
   * now is built as far as the money goes, and finished on later turns.
   *
   * Each try is recorded in the turn's trace (`trace.build`): the town aimed
   * for and why, what the player could spend (`available`, the turn's
   * allowance or cash, whichever is less) and the `budget` for this town
   * after any limit of its own, then — once a line is found — the whole
   * line's price and length in cells (`linePrice`, `lineCells`) against what
   * was built (`built`, `builtCells`), or `noLine` when no buildable line
   * reaches the town. The first try also records the demands as weighed up
   * for building (see `playTurn`).
   *
   * @returns {string} Why building stopped, for the trace
   */
  function buildTrack(playerId, report, tried) {
    const { trace } = report
    // Towns no buildable line could be found to, not tried again this turn
    const given = new Set()
    let sections = 0

    // Each pass either builds, gives up on a town, or stops; there are only
    // so many towns to give up on, so the passes are capped as well
    for (let pass = 0; pass < MAX_PASSES && sections < MAX_SECTIONS; pass++) {
      const available = playerStore.availableForTrack(playerId)
      if (available <= 0) return 'nothing left to spend on track this turn'

      const picture = survey(playerId)
      if (pass === 0) {
        trace.demands = picture.review
        trace.demandsWhen = 'deciding what to build'
        if (picture.start) trace.startCity = picture.start.name
      }
      const target = buildTarget(playerId, picture, given)
      if (!target) return 'nothing left to build toward'
      const budget = Math.min(available, target.spendable)
      const step = { toward: target.town.name, why: target.why, available, budget }
      trace.build.push(step)
      if (budget <= 0) return 'no cash to spare above what winning needs'

      // The survey's own search is the planner's first try
      const line = planLine(picture.board, picture.sources, pointOf(target.town), picture.field)
      if (!line) {
        step.noLine = true
        given.add(target.town.msa)
        continue
      }
      // Priced as building will charge it, town entry included
      const price = (points) => builder.priceSection(playerId, points).total
      step.linePrice = price(line)
      step.lineCells = line.length
      const section = affordableSection(line, budget, picture.board.rules, price)
      if (!section) {
        return `the budget does not stretch to the first cell toward ${target.town.name}`
      }

      const result = builder.buildSection(playerId, section)
      if (!tried('build track', result)) return 'the section was refused'
      sections++
      step.built = result.cost
      step.builtCells = section.length
      report.events.push({ type: 'build', cost: result.cost, toward: target.town.name })
      if (section.length < line.length) {
        return `the money ran out short of ${target.town.name}; the rest waits for a later turn`
      }
    }
    return sections >= MAX_SECTIONS
      ? `built the most sections allowed in a turn (${MAX_SECTIONS})`
      : `gave up after ${MAX_PASSES} tries`
  }

  return { playTurn }
}
