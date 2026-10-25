/**
 * Trains Store (trains.js)
 *
 * Every player's train, and everything a player does with it on their turn:
 * placing it on the board, running it along the track, picking up, delivering
 * and dropping loads, and changing it for a faster or bigger one.
 *
 * Each action takes the id of the player doing it and answers with
 * `{ ok: true, ... }` or `{ ok: false, error }`, where `error` is a sentence
 * for the player. The questions behind the controls — where can the train go,
 * what can it load here, what can it deliver — are asked here too, so a
 * computer player can take a turn through this store exactly as a person
 * does through the dock, and the two can never disagree about the rules.
 *
 * A turn, as in Empire Builder (operating rounds, after the two building
 * rounds):
 * 1. Move: run the train up to its speed along the track, stopping in towns
 *    on the way to pick up, deliver or drop loads. On a player's first
 *    operating turn the train is first placed in any town.
 * 2. Build track or change the train, with the turn's allowance.
 * Movement comes first: once a player spends any of the turn's allowance,
 * their train stays where it is until their next turn.
 *
 * A train runs on its owner's track where it can. Where it cannot, it may
 * use anyone's, paying each other owner whose track it runs on a fee, once
 * per turn (`gameRules.trackUseFee`).
 *
 * Train Object Structure (keyed by player id, like the demand hands):
 * {
 *   type: string,           // A key of TRAIN_TYPES
 *   loads: Array<string>,   // Commodity names carried, one per load
 *   position: Object|null,  // Where it is (see network.js); null until placed
 *   kmThisTurn: number,     // How far it has run this turn
 *   feesPaidTo: Array<number>, // Owners already paid this turn for their track
 *   hasActed: boolean       // Whether it has done anything this turn
 * }
 *
 * @module stores/trains
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { gameRules } from '@/config/game'
import { TRAIN_TYPES, TRAIN_CHANGES, STARTING_TRAIN, trainRangeKm } from '@/config/trains'
import { townKey, positionAtNode, shortestRoutes, runRoute } from '@/composables/network'
import { formatCurrency } from '@/composables/utils'
import { useVictory } from '@/composables/victory'
import { useGameStore } from './game'
import { usePlayerStore } from './players'
import { useTownsStore } from './towns'
import { useNetworkStore } from './network'
import { useDemandCardsStore } from './demandCards'

/**
 * A train as every player starts with it: a Freight, empty, not yet placed.
 * @returns {Object} A new train
 */
function newTrain() {
  return {
    type: STARTING_TRAIN,
    loads: [],
    position: null,
    kmThisTurn: 0,
    feesPaidTo: [],
    hasActed: false
  }
}

/** A refusal, in the shape every action answers with */
const refuse = (error) => ({ ok: false, error })

export const useTrainsStore = defineStore('trains', () => {
  const gameStore = useGameStore()
  const playerStore = usePlayerStore()
  const townsStore = useTownsStore()
  const networkStore = useNetworkStore()
  const demandCardsStore = useDemandCardsStore()
  const { checkForWinner } = useVictory()

  // STATE

  /** Each player's train, keyed by player id */
  const trains = ref({})

  // GETTERS

  /** The track and towns as a network trains can run on (see the network store) */
  const network = computed(() => networkStore.network)

  /**
   * A player's train. A player with no train on record (a new game, or a
   * save from before trains) has a new one: a Freight, not yet placed.
   * @param {number} playerId - The player
   * @returns {Object} Their train; changes to a train come through the
   *   actions below, not by editing what this returns
   */
  function trainOf(playerId) {
    return trains.value[playerId] ?? newTrain()
  }

  /**
   * A player's train, kept on record so it can be changed. Used by the
   * actions; every other reader goes through `trainOf`.
   * @param {number} playerId - The player
   * @returns {Object} Their stored train
   */
  function storedTrain(playerId) {
    if (!trains.value[playerId]) trains.value[playerId] = newTrain()
    return trains.value[playerId]
  }

  /**
   * A kind of train's name, speed and capacity.
   * @param {number} playerId - The player
   * @returns {{name: string, mileposts: number, capacity: number, rangeKm: number}}
   */
  function trainTypeOf(playerId) {
    const { type } = trainOf(playerId)
    return { ...TRAIN_TYPES[type], rangeKm: trainRangeKm(type) }
  }

  /**
   * How much further a player's train may run this turn, in km.
   * @param {number} playerId - The player
   * @returns {number} Kilometers left, never negative
   */
  function kmLeft(playerId) {
    return Math.max(0, trainRangeKm(trainOf(playerId).type) - trainOf(playerId).kmThisTurn)
  }

  /**
   * A town, by id (its `msa` code).
   * @param {string} townId - The town's id
   * @returns {Object|undefined} The town
   */
  function townById(townId) {
    return townsStore.towns.find((town) => town.msa === townId)
  }

  /**
   * The town a player's train is standing in.
   * @param {number} playerId - The player
   * @returns {Object|null} The town, or null if the train is not in one
   */
  function townOf(playerId) {
    const townId = trainOf(playerId).position?.townId
    return (townId != null && townById(townId)) || null
  }

  /**
   * Why a player may not do anything on their turn right now, or null.
   * @param {number} playerId - The player
   * @returns {string|null} The reason
   */
  function whyNotTheirTurn(playerId) {
    if (gameStore.isOver) return 'The game is over.'
    if (playerStore.activePlayer?.id !== playerId) return "It isn't your turn."
    return null
  }

  /**
   * Why a player may not run their train, or pick up, deliver or drop loads,
   * right now — the train's part of the turn — or null if they may.
   * @param {number} playerId - The player
   * @returns {string|null} The reason
   */
  function whyTrainIdle(playerId) {
    const notTheirTurn = whyNotTheirTurn(playerId)
    if (notTheirTurn) return notTheirTurn
    if (gameStore.isBuildingRound) return "Trains don't run in the building rounds."
    if (playerStore.hasSpentThisTurn(playerId)) {
      return 'Your train is done for this turn: you have started building.'
    }
    return null
  }

  /**
   * Why a player may not run their train somewhere right now, or null.
   * @param {number} playerId - The player
   * @returns {string|null} The reason
   */
  function whyCannotMove(playerId) {
    const idle = whyTrainIdle(playerId)
    if (idle) return idle
    if (!trainOf(playerId).position) return 'Place your train in a town first.'
    if (kmLeft(playerId) <= 0) return 'Your train has run as far as it can this turn.'
    return null
  }

  /**
   * Why a player may not load or unload in the town their train is in.
   * @param {number} playerId - The player
   * @returns {string|null} The reason
   */
  function whyCannotLoad(playerId) {
    const idle = whyTrainIdle(playerId)
    if (idle) return idle
    if (!townOf(playerId)) return 'Your train has to be in a town.'
    return null
  }

  /**
   * The best way for a player's train to every place it can reach: on its
   * owner's own track where possible, otherwise on anyone's.
   * @param {number} playerId - The player
   * @returns {Map<string, {km: number, steps: Array}>} By node key; empty if
   *   the train is not placed
   */
  function routesFor(playerId) {
    const position = trainOf(playerId).position
    if (!position) return new Map()
    const own = shortestRoutes(network.value, position, { owners: new Set([playerId]) })
    const any = shortestRoutes(network.value, position)
    const routes = new Map()
    any.forEach((route, key) => {
      routes.set(key, own.get(key) ?? route)
    })
    return routes
  }

  /**
   * The other players whose track a route runs on that have not already been
   * paid this turn — the ones a move along it would have to pay.
   * @param {number} playerId - The player moving
   * @param {Iterable<number>} owners - Whose track the route runs on
   * @returns {Array<number>} The owners to pay
   */
  function ownersToPay(playerId, owners) {
    const paid = trainOf(playerId).feesPaidTo
    return [...new Set(owners)].filter((owner) => owner !== playerId && !paid.includes(owner))
  }

  /**
   * Every town a player's train can get to, nearest first: how far it is,
   * whether the train gets there this turn, and the fees the way there
   * costs. Towns it cannot reach by any track are left out.
   * @param {number} playerId - The player
   * @returns {Array<{town: Object, km: number, reachable: boolean,
   *   payTo: Array<number>, fee: number}>} The destinations
   */
  function destinations(playerId) {
    const left = kmLeft(playerId)
    const list = []
    routesFor(playerId).forEach((route, key) => {
      const town = network.value.nodes.get(key).town
      if (!town) return
      // Fees are only paid for track the train actually reaches this turn
      const { ownersUsed } = runRoute(network.value, trainOf(playerId).position, route.steps, left)
      const payTo = ownersToPay(playerId, ownersUsed)
      list.push({
        town,
        km: route.km,
        reachable: route.km <= left,
        payTo,
        fee: payTo.length * gameRules.trackUseFee
      })
    })
    return list.sort((a, b) => a.km - b.km)
  }

  /**
   * What the train could pick up in the town it is in: each commodity the
   * town produces, and whether there is room for it.
   * @param {number} playerId - The player
   * @returns {Array<{industry: string, hasRoom: boolean}>} The commodities;
   *   empty when the train is not in a town
   */
  function pickupOptions(playerId) {
    const town = townOf(playerId)
    if (!town) return []
    const hasRoom = trainOf(playerId).loads.length < trainTypeOf(playerId).capacity
    return town.industries.map(({ name }) => ({ industry: name, hasRoom }))
  }

  /**
   * The demands the train could deliver in the town it is in: each demand in
   * the player's hand wanting a load the train carries, here.
   * @param {number} playerId - The player
   * @returns {Array<{cardId: number, line: number, demand: Object}>} The
   *   deliveries; empty when the train is not in a town
   */
  function deliveryOptions(playerId) {
    const town = townOf(playerId)
    if (!town) return []
    const { loads } = trainOf(playerId)
    return demandCardsStore
      .handOf(playerId)
      .flatMap((card) =>
        card.demands
          .map((demand, line) => ({ cardId: card.id, line, demand }))
          .filter(
            ({ demand }) => demand.destination === town.name && loads.includes(demand.industry)
          )
      )
  }

  /**
   * The changes a player could make to their train, with what each costs and
   * why it cannot be made now, if it cannot.
   * @param {number} playerId - The player
   * @returns {Array<{to: string, name: string, cost: number, error: string|null}>}
   */
  function changeOptions(playerId) {
    const { type, loads } = trainOf(playerId)
    return TRAIN_CHANGES.filter((change) => change.from === type).map((change) => ({
      to: change.to,
      name: TRAIN_TYPES[change.to].name,
      cost: change.cost,
      error: whyCannotChange(playerId, change, loads)
    }))
  }

  /**
   * Why a player may not make a change to their train, or null.
   * @param {number} playerId - The player
   * @param {Object} change - One of TRAIN_CHANGES
   * @param {Array<string>} loads - What the train carries
   * @returns {string|null} The reason
   */
  function whyCannotChange(playerId, change, loads) {
    const notTheirTurn = whyNotTheirTurn(playerId)
    if (notTheirTurn) return notTheirTurn
    if (loads.length > TRAIN_TYPES[change.to].capacity) {
      return `Your train is carrying ${loads.length} loads; a ${TRAIN_TYPES[change.to].name} holds ${TRAIN_TYPES[change.to].capacity}.`
    }
    const available = playerStore.availableForTrack(playerId)
    if (change.cost > available) {
      return `This costs ${formatCurrency(change.cost)}; you have ${formatCurrency(available)} left to spend this turn.`
    }
    return null
  }

  // ACTIONS

  /**
   * Puts a player's train on the board, in any town — the start of their
   * first operating turn. The train may then run its full distance.
   * @param {number} playerId - The player
   * @param {string} townId - The town's id
   * @returns {{ok: boolean, error?: string}}
   */
  function placeTrain(playerId, townId) {
    const idle = whyTrainIdle(playerId)
    if (idle) return refuse(idle)
    if (trainOf(playerId).position) return refuse('Your train is already on the board.')
    const town = townById(townId)
    if (!town) return refuse('There is no such town.')

    const train = storedTrain(playerId)
    train.position = positionAtNode(network.value, townKey(town))
    train.hasActed = true
    return { ok: true }
  }

  /**
   * Runs a player's train toward a town, as far as it can go this turn.
   *
   * The way taken is the shortest on the player's own track, or, if their
   * track does not reach, the shortest on anyone's. If the town is beyond
   * this turn's reach, the train goes as far as it can and stops on the way.
   * Each other player whose track it ran on is paid the track-use fee, once
   * per turn; a player who cannot pay the fees does not move.
   *
   * @param {number} playerId - The player
   * @param {string} townId - The town to head for
   * @returns {{ok: boolean, error?: string, arrived?: boolean, km?: number,
   *   paid?: Array<{ownerId: number, amount: number}>}} Whether it moved,
   *   whether it got there, how far it went, and the fees paid
   */
  function moveTrain(playerId, townId) {
    const blocked = whyCannotMove(playerId)
    if (blocked) return refuse(blocked)
    const town = townById(townId)
    if (!town) return refuse('There is no such town.')
    if (trainOf(playerId).position.townId === townId)
      return refuse(`You're already in ${town.name}.`)

    const route = routesFor(playerId).get(townKey(town))
    if (!route) return refuse(`No track joins your train to ${town.name}.`)

    const train = storedTrain(playerId)
    const run = runRoute(network.value, train.position, route.steps, kmLeft(playerId))
    const payTo = ownersToPay(playerId, run.ownersUsed)
    const fees = payTo.length * gameRules.trackUseFee
    const cash = playerStore.players.find((p) => p.id === playerId)?.cash ?? 0
    if (fees > cash) {
      return refuse(
        `Running on other players' track costs ${formatCurrency(fees)} in fees; you have ${formatCurrency(cash)}.`
      )
    }

    // Checked rather than assumed: owners must never be paid fees the mover
    // was not charged
    if (!playerStore.spendCash(playerId, fees)) return refuse(playerStore.error)
    payTo.forEach((ownerId) => playerStore.earnCash(ownerId, gameRules.trackUseFee))
    train.feesPaidTo = [...train.feesPaidTo, ...payTo]
    train.position = run.position
    train.kmThisTurn += run.km
    train.hasActed = true
    return {
      ok: true,
      arrived: run.arrived,
      km: run.km,
      paid: payTo.map((ownerId) => ({ ownerId, amount: gameRules.trackUseFee }))
    }
  }

  /**
   * Loads a commodity the town the train is in produces. As in Empire
   * Builder, a town's goods never run out, and loading costs nothing.
   * @param {number} playerId - The player
   * @param {string} industry - The commodity's name
   * @returns {{ok: boolean, error?: string}}
   */
  function pickUp(playerId, industry) {
    const blocked = whyCannotLoad(playerId)
    if (blocked) return refuse(blocked)
    const option = pickupOptions(playerId).find((o) => o.industry === industry)
    if (!option) return refuse(`${townOf(playerId).name} doesn't produce ${industry}.`)
    if (!option.hasRoom) return refuse('Your train is full.')

    const train = storedTrain(playerId)
    train.loads = [...train.loads, industry]
    train.hasActed = true
    return { ok: true }
  }

  /**
   * Delivers a load to meet a demand on one of the player's cards: the load
   * comes off the train, the payoff is paid, and the card is played and a new
   * one drawn (see the demand cards store). A delivery that brings a player
   * up to the winning line ends the game there and then (see victory.js).
   * @param {number} playerId - The player
   * @param {number} cardId - The card
   * @param {number} line - Which of the card's demands (0–2)
   * @returns {{ok: boolean, error?: string, payoff?: number, won?: boolean}}
   */
  function deliver(playerId, cardId, line) {
    const blocked = whyCannotLoad(playerId)
    if (blocked) return refuse(blocked)
    const option = deliveryOptions(playerId).find((o) => o.cardId === cardId && o.line === line)
    if (!option) return refuse("That demand can't be delivered here.")

    const train = storedTrain(playerId)
    const loadIndex = train.loads.indexOf(option.demand.industry)
    train.loads = train.loads.filter((_, i) => i !== loadIndex)
    playerStore.earnCash(playerId, option.demand.payoff)
    demandCardsStore.discardCard(playerId, cardId)
    train.hasActed = true
    return { ok: true, payoff: option.demand.payoff, won: checkForWinner(playerId) }
  }

  /**
   * Drops a load in the town the train is in, for nothing — to make room,
   * or to be rid of a load nobody will pay for.
   * @param {number} playerId - The player
   * @param {string} industry - The commodity to drop
   * @returns {{ok: boolean, error?: string}}
   */
  function dropLoad(playerId, industry) {
    const blocked = whyCannotLoad(playerId)
    if (blocked) return refuse(blocked)
    const train = storedTrain(playerId)
    const loadIndex = train.loads.indexOf(industry)
    if (loadIndex === -1) return refuse(`Your train isn't carrying ${industry}.`)

    train.loads = train.loads.filter((_, i) => i !== loadIndex)
    train.hasActed = true
    return { ok: true }
  }

  /**
   * Changes a player's train for another kind, paid for out of the turn's
   * building allowance (see trains.js in config). Allowed in the building
   * rounds too. Spending the allowance ends the train's moving for the turn.
   * @param {number} playerId - The player
   * @param {string} toType - The kind of train to change to
   * @returns {{ok: boolean, error?: string}}
   */
  function changeTrain(playerId, toType) {
    const option = changeOptions(playerId).find((o) => o.to === toType)
    if (!option) return refuse("Your train can't be changed to that.")
    if (option.error) return refuse(option.error)
    if (!playerStore.spendOnTrack(playerId, option.cost)) return refuse(playerStore.error)

    storedTrain(playerId).type = toType
    return { ok: true }
  }

  /**
   * Clears what a player's train did this turn, as their turn ends, so it
   * comes back to a full run next turn.
   * @param {number} playerId - The player whose turn is ending
   */
  function endTurn(playerId) {
    if (!trains.value[playerId]) return
    Object.assign(trains.value[playerId], { kmThisTurn: 0, feesPaidTo: [], hasActed: false })
  }

  /**
   * Restores every train from a saved game. Saves from before trains have
   * none, and their players get new ones as they need them (see `trainOf`).
   * @param {Object} [saved] - Trains, keyed by player id
   */
  function setTrains(saved) {
    trains.value = saved && typeof saved === 'object' ? saved : {}
  }

  /** Clears every train, for a new game */
  function reset() {
    trains.value = {}
  }

  return {
    // state
    trains,
    // getters
    network,
    trainOf,
    trainTypeOf,
    kmLeft,
    townOf,
    whyCannotMove,
    whyCannotLoad,
    destinations,
    pickupOptions,
    deliveryOptions,
    changeOptions,
    // actions
    placeTrain,
    moveTrain,
    pickUp,
    deliver,
    dropLoad,
    changeTrain,
    endTurn,
    setTrains,
    reset
  }
})
