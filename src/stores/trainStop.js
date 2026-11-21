/**
 * Train Stop Store (trainStop.js)
 *
 * What a person can do with their train in the town it stands in, wherever
 * they do it from: the dock's buttons, the stop card that comes up over the
 * map when the train gets to a town, or the town's commodity icons on the
 * map, which can be clicked to load.
 *
 * When a person places their train in a town, or runs it into one, and the
 * town has anything for it — something to pick up that the train has room
 * for, or a load the person's demand cards want delivered there — the town's
 * stop card opens (see TownStopCard.vue). It closes when they say they are
 * done, when the train leaves, or when the turn ends (see useTurn.js).
 * Computer players load through the trains store directly and never get a
 * card.
 *
 * Every action answers in a sentence for the player, kept here so the dock
 * and the card show the same one, whichever the player used. Loading and
 * unloading answer in `notice`, which the dock's Train section and the stop
 * card show beside their load buttons. Placing and running the train answer
 * in `moveNotice`, which the dock's "Move your train" step shows beside its
 * Go button. Each message sits by the button that caused it. A move clears
 * the last load message, which was about the town the train has just left.
 *
 * `cars` lays the train out one car per load it can carry, with the
 * deliveries each car's load can make here, for the Train section to draw.
 *
 * The rules are all in the trains store; this only puts them in front of a
 * person.
 *
 * @module stores/trainStop
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { usePlayerStore } from './players'
import { useTrainsStore } from './trains'
import { useDemandCardsStore } from './demandCards'
import { useTownsStore } from './towns'
import { formatCurrency } from '@/composables/utils'

/**
 * What a pick-up button says a load is wanted for: the best-paid demand in
 * the player's hand for it, and how many more there are.
 * @param {Array<{destination: string, payoff: number}>} wantedIn - The
 *   demands wanting it, best paid first
 * @returns {string} Such as "→ Gary $23,000" or "→ Gary $23,000 (+1)"; empty
 *   if no card wants it
 */
export function wantedLabel(wantedIn) {
  if (wantedIn.length === 0) return ''
  const [best, ...rest] = wantedIn
  const more = rest.length ? ` (+${rest.length})` : ''
  return `→ ${best.destination} ${formatCurrency(best.payoff)}${more}`
}

export const useTrainStopStore = defineStore('trainStop', () => {
  const playerStore = usePlayerStore()
  const trainsStore = useTrainsStore()
  const demandCardsStore = useDemandCardsStore()
  const townsStore = useTownsStore()

  // STATE

  /** The id of the town whose stop card is open, or null */
  const stopTownId = ref(null)

  /** What the last load action did, or why it could not: { text, isError } */
  const notice = ref(null)

  /** What the last move of the train did, or why it could not: { text, isError } */
  const moveNotice = ref(null)

  // GETTERS

  /** The player whose turn it is */
  const playerId = computed(() => playerStore.activePlayer?.id)

  /**
   * The town the train of the person whose turn it is stands in, while they
   * may load and unload there; null otherwise, and always on a computer
   * player's turn.
   */
  const loadingTown = computed(() => {
    const player = playerStore.activePlayer
    if (!player || player.isBot) return null
    if (trainsStore.whyCannotLoad(player.id)) return null
    return trainsStore.townOf(player.id)
  })

  /** The train's loads, and how many it can carry */
  const cargo = computed(() => ({
    loads: trainsStore.trainOf(playerId.value).loads,
    capacity: trainsStore.trainTypeOf(playerId.value).capacity
  }))

  /**
   * What the train can pick up where it stands, each with its industry code,
   * whether there is room for it, and the demands in the player's hand that
   * want it, best paid first, so the player can see what a load is good for.
   * @returns {Array<{industry: string, code: number, hasRoom: boolean,
   *   wantedIn: Array<{destination: string, payoff: number}>}>}
   */
  const pickups = computed(() => {
    if (!loadingTown.value) return []
    const demands = demandCardsStore.handOf(playerId.value).flatMap((card) => card.demands)
    return trainsStore.pickupOptions(playerId.value).map((option) => ({
      ...option,
      code: townsStore.industryCodes.get(option.industry),
      wantedIn: demands
        .filter((demand) => demand.industry === option.industry)
        .map(({ destination, payoff }) => ({ destination, payoff }))
        .sort((a, b) => b.payoff - a.payoff)
    }))
  })

  /**
   * The demands the train can deliver where it stands (see the trains
   * store), each with its commodity's industry code
   * @returns {Array<{cardId: number, line: number, demand: Object, code: number}>}
   */
  const deliveries = computed(() =>
    loadingTown.value
      ? trainsStore.deliveryOptions(playerId.value).map((option) => ({
          ...option,
          code: townsStore.industryCodes.get(option.demand.industry)
        }))
      : []
  )

  /**
   * The train laid out one car per load it can carry, in the order the loads
   * were picked up, for the Train section to draw. Each car has its load (or
   * null when empty), the load's industry code for its icon, and the
   * deliveries it can make where the train stands.
   *
   * A delivery goes on the first car carrying that load. Two cars of Coal
   * and one card paying for Coal here give the first car the Deliver button
   * and the second none, rather than two buttons for the one delivery. When
   * more than one card pays for the load here, that car gets one delivery
   * per card, so the player still chooses which card to cash in. After a
   * delivery the loads close up, and the next car of the same load becomes
   * the first, taking any delivery still left.
   * @returns {Array<{load: string|null, code: number|undefined,
   *   deliveries: Array<{cardId: number, line: number, demand: Object, code: number}>}>}
   */
  const cars = computed(() =>
    Array.from({ length: cargo.value.capacity }, (_, index) => {
      const load = cargo.value.loads[index] ?? null
      const isFirstOfItsLoad = load !== null && cargo.value.loads.indexOf(load) === index
      return {
        load,
        code: load === null ? undefined : townsStore.industryCodes.get(load),
        deliveries: isFirstOfItsLoad
          ? deliveries.value.filter(({ demand }) => demand.industry === load)
          : []
      }
    })
  )

  /** The town whose stop card is showing: open, with the train still there */
  const stopTown = computed(() =>
    loadingTown.value && loadingTown.value.msa === stopTownId.value ? loadingTown.value : null
  )

  // ACTIONS

  /**
   * Opens the stop card for the town the train has just been placed in or
   * run into, if the town has anything for it; otherwise closes any card.
   * Called after a person's train moves.
   */
  function arrive() {
    // A full train has nothing to pick up, however much the town makes
    const hasBusiness = pickups.value.some(({ hasRoom }) => hasRoom) || deliveries.value.length > 0
    stopTownId.value = hasBusiness ? loadingTown.value.msa : null
  }

  /** Closes the stop card */
  function closeStop() {
    stopTownId.value = null
  }

  /**
   * Puts how an action went into a sentence for the player.
   * @param {{ok: boolean, error?: string}} result - What the trains store answered
   * @param {Function} describe - Makes the sentence for a success, from the result
   * @returns {{text: string, isError: boolean}} The message
   */
  function messageFor(result, describe) {
    return result.ok
      ? { text: describe(result), isError: false }
      : { text: result.error, isError: true }
  }

  /**
   * Shows how a load action went (picking up, delivering, dropping).
   * @param {{ok: boolean, error?: string}} result - What the trains store answered
   * @param {Function} describe - Makes the sentence for a success, from the result
   * @returns {Object} The result, passed through
   */
  function report(result, describe) {
    notice.value = messageFor(result, describe)
    return result
  }

  /**
   * Shows how placing or running the train went. A train that has moved has
   * left the town the last load message was about, so that message goes.
   * @param {{ok: boolean, error?: string}} result - What the trains store answered
   * @param {Function} describe - Makes the sentence for a success, from the result
   * @returns {Object} The result, passed through
   */
  function reportMove(result, describe) {
    moveNotice.value = messageFor(result, describe)
    if (result.ok) notice.value = null
    return result
  }

  /**
   * Loads one of the town's commodities.
   * @param {string} industry - The commodity
   * @returns {Object} What the trains store answered
   */
  function pickUp(industry) {
    return report(trainsStore.pickUp(playerId.value, industry), () => `Loaded ${industry}.`)
  }

  /**
   * Delivers a load for one of the player's demands.
   * @param {number} cardId - The card
   * @param {number} line - The demand's place on the card
   * @returns {Object} What the trains store answered
   */
  function deliver(cardId, line) {
    return report(
      trainsStore.deliver(playerId.value, cardId, line),
      ({ payoff }) => `Delivered for ${formatCurrency(payoff)}. A new demand card was drawn.`
    )
  }

  /**
   * Drops a load in the town, for nothing.
   * @param {string} industry - The commodity
   * @returns {Object} What the trains store answered
   */
  function drop(industry) {
    return report(trainsStore.dropLoad(playerId.value, industry), () => `Dropped ${industry}.`)
  }

  /** Closes the card and forgets the last reports, as a turn or game ends */
  function reset() {
    stopTownId.value = null
    notice.value = null
    moveNotice.value = null
  }

  return {
    stopTownId,
    notice,
    moveNotice,
    loadingTown,
    cargo,
    cars,
    pickups,
    deliveries,
    stopTown,
    arrive,
    closeStop,
    reportMove,
    pickUp,
    deliver,
    drop,
    reset
  }
})
