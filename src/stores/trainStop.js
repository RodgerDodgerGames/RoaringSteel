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
 * Every action answers in a sentence for the player (`notice`), kept here so
 * the dock and the card show the same one, whichever the player used.
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

  /** What the last action with the train did, or why it could not: { text, isError } */
  const notice = ref(null)

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

  /**
   * Each commodity's industry code (its NAICS code, or Tourism's), by name,
   * from the towns that make it: what its icon is looked up by.
   */
  const industryCodes = computed(() => {
    const codes = new Map()
    townsStore.towns.forEach((town) =>
      town.industries.forEach(({ name, industry }) => codes.set(name, industry))
    )
    return codes
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
      code: industryCodes.value.get(option.industry),
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
      ? trainsStore
          .deliveryOptions(playerId.value)
          .map((option) => ({ ...option, code: industryCodes.value.get(option.demand.industry) }))
      : []
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
   * Shows how an action went.
   * @param {{ok: boolean, error?: string}} result - What the trains store answered
   * @param {Function} describe - Makes the sentence for a success, from the result
   * @returns {Object} The result, passed through
   */
  function report(result, describe) {
    notice.value = result.ok
      ? { text: describe(result), isError: false }
      : { text: result.error, isError: true }
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

  /** Closes the card and forgets the last report, as a turn or game ends */
  function reset() {
    stopTownId.value = null
    notice.value = null
  }

  return {
    stopTownId,
    notice,
    loadingTown,
    cargo,
    pickups,
    deliveries,
    stopTown,
    arrive,
    closeStop,
    report,
    pickUp,
    deliver,
    drop,
    reset
  }
})
