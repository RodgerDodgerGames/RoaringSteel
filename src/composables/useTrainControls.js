/**
 * Train Controls Composable (useTrainControls.js)
 *
 * What the dock's "Move your train" step needs: the active player's train
 * as the controls show it, the choices open to it (where it can go, what it
 * can load or deliver here), and the actions, each reporting back in a
 * sentence for the player.
 *
 * The rules themselves are all in the trains store; this only puts them in
 * front of a person. It also runs choosing a town on the map: while that is
 * on, clicking a town places the train there, or runs it there.
 *
 * Must be called from a component's setup: it stops choosing a town when
 * that component goes, and listens for Escape.
 *
 * @module composables/useTrainControls
 */

import { ref, computed, watch, inject, onBeforeUnmount } from 'vue'
import { onKeyStroke } from '@vueuse/core'
import { usePlayerStore } from '@/stores/players'
import { useTrainsStore } from '@/stores/trains'
import { useTownsStore } from '@/stores/towns'
import { useMapStore } from '@/stores/map'
import { buildTrackKey } from '@/composables/map/useBuildTrack'
import { formatCurrency } from '@/composables/utils'

export function useTrainControls() {
  const playerStore = usePlayerStore()
  const trainsStore = useTrainsStore()
  const townsStore = useTownsStore()
  const mapStore = useMapStore()
  // The game view's build-track instance, so choosing a town can end any
  // drawing or removal first: all three act on map clicks
  const buildTrack = inject(buildTrackKey, null)

  /** The player whose turn it is */
  const playerId = computed(() => playerStore.activePlayer?.id)

  /** Their train, its kind, and the town it is in (null between towns) */
  const train = computed(() => trainsStore.trainOf(playerId.value))
  const trainType = computed(() => trainsStore.trainTypeOf(playerId.value))
  const town = computed(() => trainsStore.townOf(playerId.value))
  const kmLeft = computed(() => trainsStore.kmLeft(playerId.value))

  /** Why the train cannot run anywhere now, or null */
  const moveBlock = computed(() => trainsStore.whyCannotMove(playerId.value))

  /** Why nothing can be loaded or unloaded now, or null */
  const loadBlock = computed(() => trainsStore.whyCannotLoad(playerId.value))

  /** Where the train can go, nearest first (see the trains store) */
  const destinations = computed(() =>
    moveBlock.value ? [] : trainsStore.destinations(playerId.value)
  )

  /** What the train can pick up and deliver where it stands */
  const pickups = computed(() => trainsStore.pickupOptions(playerId.value))
  const deliveries = computed(() => trainsStore.deliveryOptions(playerId.value))

  /** Every town, by name, for placing the train */
  const towns = computed(() => [...townsStore.towns].sort((a, b) => a.name.localeCompare(b.name)))

  /** What the last action did, or why it could not: { text, isError } */
  const notice = ref(null)

  /**
   * Shows how an action went.
   * @param {{ok: boolean, error?: string}} result - What the store answered
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
   * A player's name, for saying who was paid.
   * @param {number} id - The player's id
   * @returns {string} Their name
   */
  function nameOf(id) {
    return playerStore.players.find((p) => p.id === id)?.name ?? 'another player'
  }

  /**
   * Puts the train in a town, at the start of the player's first running turn.
   * @param {string} townId - The town's id
   */
  function place(townId) {
    report(
      trainsStore.placeTrain(playerId.value, townId),
      () => `Your train is in ${town.value.name}.`
    )
  }

  /**
   * Runs the train toward a town.
   * @param {string} townId - The town's id
   */
  function move(townId) {
    const target = townsStore.towns.find((t) => t.msa === townId)
    report(trainsStore.moveTrain(playerId.value, townId), ({ arrived, km, paid }) => {
      const run = arrived
        ? `Arrived in ${target.name} (${Math.round(km)} km).`
        : `Ran ${Math.round(km)} km toward ${target.name} and stopped on the way.`
      const fees = paid.map(
        ({ ownerId, amount }) => `${formatCurrency(amount)} to ${nameOf(ownerId)}`
      )
      return fees.length ? `${run} Paid ${fees.join(' and ')} to use their track.` : run
    })
  }

  /**
   * Loads one of the town's commodities.
   * @param {string} industry - The commodity
   */
  function pickUp(industry) {
    report(trainsStore.pickUp(playerId.value, industry), () => `Loaded ${industry}.`)
  }

  /**
   * Delivers a load for one of the player's demands.
   * @param {number} cardId - The card
   * @param {number} line - The demand's place on the card
   */
  function deliver(cardId, line) {
    report(
      trainsStore.deliver(playerId.value, cardId, line),
      ({ payoff }) => `Delivered for ${formatCurrency(payoff)}. A new demand card was drawn.`
    )
  }

  /**
   * Drops a load in the town, for nothing.
   * @param {string} industry - The commodity
   */
  function drop(industry) {
    report(trainsStore.dropLoad(playerId.value, industry), () => `Dropped ${industry}.`)
  }

  // CHOOSING A TOWN ON THE MAP

  /** Whether clicking a town on the map places or runs the train */
  const isPicking = computed(() => mapStore.townPicker !== null)

  /**
   * Starts choosing a town on the map: each click places the train there,
   * or, once it is placed, runs it there. Any drawing or removal is ended
   * first. Choosing stays on, for a run through several towns, until Escape,
   * the Stop button, or the train has nowhere left to go this turn.
   */
  function startPicking() {
    if (buildTrack?.isDrawingActive.value) buildTrack.cancelDrawing()
    if (buildTrack?.isRemoving.value) buildTrack.toggleRemoveMode()
    mapStore.setTownPicker({
      prompt: train.value.position
        ? 'Click a town to run your train there.'
        : 'Click a town to place your train there.',
      onPick: ({ msa }) => {
        if (train.value.position) move(msa)
        else place(msa)
        // The prompt changes once the train is placed, and there is nothing
        // more to choose once it can go no further
        if (moveBlock.value) stopPicking()
        else startPicking()
      }
    })
  }

  /** Stops choosing a town; clicking a town opens its popup again */
  function stopPicking() {
    mapStore.setTownPicker(null)
  }

  // A new turn starts clean: no choosing, no report of the last player's moves
  watch(playerId, () => {
    stopPicking()
    notice.value = null
  })
  onKeyStroke('Escape', stopPicking)
  onBeforeUnmount(stopPicking)

  return {
    train,
    trainType,
    town,
    kmLeft,
    moveBlock,
    loadBlock,
    destinations,
    pickups,
    deliveries,
    towns,
    notice,
    nameOf,
    place,
    move,
    pickUp,
    deliver,
    drop,
    isPicking,
    startPicking,
    stopPicking
  }
}
