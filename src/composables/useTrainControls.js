/**
 * Train Controls Composable (useTrainControls.js)
 *
 * What the dock's "Move your train" step needs: the active player's train
 * as the controls show it, the choices open to it (where it can go, what it
 * can load or deliver here), and the actions, each reporting back in a
 * sentence for the player.
 *
 * The rules themselves are all in the trains store; this only puts them in
 * front of a person. Loading and unloading, and the report of how each
 * action went, are shared with the map's stop card and commodity icons
 * through the train stop store. This also runs choosing a town on the map:
 * while that is on, clicking a town places the train there, or runs it
 * there. Placing the train in a town, or running it into one, opens the
 * town's stop card when it has anything for the train.
 *
 * Must be called from a component's setup: it stops choosing a town when
 * that component goes, and listens for Escape.
 *
 * @module composables/useTrainControls
 */

import { computed, watch, inject, onBeforeUnmount } from 'vue'
import { onKeyStroke } from '@vueuse/core'
import { usePlayerStore } from '@/stores/players'
import { useGameStore } from '@/stores/game'
import { useTrainsStore } from '@/stores/trains'
import { useTownsStore } from '@/stores/towns'
import { useMapStore } from '@/stores/map'
import { useTrainStopStore } from '@/stores/trainStop'
import { buildTrackKey } from '@/composables/map/useBuildTrack'
import { formatCurrency } from '@/composables/utils'
import { formatDistance } from '@/composables/boardScale'
import { whereabouts } from '@/composables/trainStatus'

export function useTrainControls() {
  const playerStore = usePlayerStore()
  const gameStore = useGameStore()
  const trainsStore = useTrainsStore()
  const townsStore = useTownsStore()
  const mapStore = useMapStore()
  const trainStopStore = useTrainStopStore()
  // The game view's build-track instance, so choosing a town can end any
  // drawing or removal first: all three act on map clicks
  const buildTrack = inject(buildTrackKey, null)

  /** The player whose turn it is */
  const playerId = computed(() => playerStore.activePlayer?.id)

  /** Their train, its kind, and the town it is in (null between towns) */
  const train = computed(() => trainsStore.trainOf(playerId.value))
  const trainType = computed(() => trainsStore.trainTypeOf(playerId.value))
  const town = computed(() => trainsStore.townOf(playerId.value))

  /**
   * How much further the train can run this turn, as the player is shown it:
   * in points of speed, like the train's speed itself (see `distance`).
   */
  const distanceLeft = computed(() => distance(trainsStore.kmLeft(playerId.value), 'down'))

  /**
   * A distance as the player is shown it, in points of speed (see
   * `formatDistance`): rounded up, for a distance to cover, unless told
   * otherwise.
   * @param {number} km - The distance, in km
   * @param {'up'|'down'} [rounding] - 'down' for a distance left to run
   * @returns {string} The distance, e.g. "14" or "8.6"
   */
  function distance(km, rounding = 'up') {
    return formatDistance(km, gameStore.boardScale.speedUnitKm, rounding)
  }

  /** Why the train cannot run anywhere now, or null */
  const moveBlock = computed(() => trainsStore.whyCannotMove(playerId.value))

  /** Why nothing can be loaded or unloaded now, or null */
  const loadBlock = computed(() => trainsStore.whyCannotLoad(playerId.value))

  /** Where the train can go, nearest first (see the trains store) */
  const destinations = computed(() =>
    moveBlock.value ? [] : trainsStore.destinations(playerId.value)
  )

  /**
   * The town a run of more than one turn is still on its way to, and how it
   * stands now, or null (see the trains store's `headingOf`)
   */
  const heading = computed(() => trainsStore.headingOf(playerId.value))

  /** Where the train is and where it is heading, in a sentence */
  const status = computed(() =>
    whereabouts({ placed: Boolean(train.value.position), town: town.value, heading: heading.value })
  )

  /**
   * What the train can pick up and deliver where it stands: the same lists
   * the map's stop card shows (see the train stop store)
   */
  const pickups = computed(() => trainStopStore.pickups)
  const deliveries = computed(() => trainStopStore.deliveries)

  /** Every town, by name, for placing the train */
  const towns = computed(() => [...townsStore.towns].sort((a, b) => a.name.localeCompare(b.name)))

  /** What the last action did, or why it could not: { text, isError } */
  const notice = computed(() => trainStopStore.notice)

  /**
   * A player's name, for saying who was paid.
   * @param {number} id - The player's id
   * @returns {string} Their name
   */
  function nameOf(id) {
    return playerStore.players.find((p) => p.id === id)?.name ?? 'another player'
  }

  /**
   * A player's color, for marking whose track a run uses.
   * @param {number} id - The player's id
   * @returns {string|null} Their color
   */
  function colorOf(id) {
    return playerStore.colorOf(id)
  }

  /**
   * Puts the train in a town, at the start of the player's first running turn.
   * @param {string} townId - The town's id
   */
  function place(townId) {
    const result = trainStopStore.report(
      trainsStore.placeTrain(playerId.value, townId),
      () => `Your train is in ${town.value.name}.`
    )
    if (result.ok) trainStopStore.arrive()
  }

  /**
   * Runs the train toward a town.
   * @param {string} townId - The town's id
   */
  function move(townId) {
    const target = townsStore.towns.find((t) => t.msa === townId)
    const result = trainStopStore.report(
      trainsStore.moveTrain(playerId.value, townId),
      ({ arrived, km, paid }) => {
        const run = arrived
          ? `Arrived in ${target.name} (${Math.round(km)} km).`
          : `Ran ${Math.round(km)} km toward ${target.name} and stopped on the way.`
        const fees = paid.map(
          ({ ownerId, amount }) => `${formatCurrency(amount)} to ${nameOf(ownerId)}`
        )
        return fees.length ? `${run} Paid ${fees.join(' and ')} to use their track.` : run
      }
    )
    // Stopped on the way, the train is in no town, and any card closes
    if (result.ok) trainStopStore.arrive()
  }

  // Loading and unloading go through the train stop store, which the map's
  // stop card and commodity icons use too
  const { pickUp, deliver, drop } = trainStopStore

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

  // A new turn starts clean: no choosing (the train stop store clears the
  // report of the last turn's moves)
  watch(playerId, stopPicking)
  onKeyStroke('Escape', stopPicking)
  onBeforeUnmount(stopPicking)

  return {
    train,
    trainType,
    town,
    distanceLeft,
    distance,
    moveBlock,
    loadBlock,
    destinations,
    heading,
    status,
    pickups,
    deliveries,
    towns,
    notice,
    nameOf,
    colorOf,
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
