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
 * there, and clicking a marked point on the track runs it there (or toward
 * it, if it is too far for one turn) and stops.
 * Placing the train in a town, or running it into one, opens the town's stop
 * card when it has anything for the train.
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
import { useRunListStore } from '@/stores/runList'
import { buildTrackKey } from '@/composables/map/useBuildTrack'
import { formatCurrency } from '@/composables/utils'
import { formatDistance } from '@/composables/boardScale'
import { whereabouts, trackPointName, trackPointTitle } from '@/composables/trainStatus'

/**
 * Whether the way to a place in the "Run to" list runs on other players'
 * track. The trains store routes a train on its owner's own track wherever
 * that reaches, so a place with no other owners on its way is one the
 * player's own track leads to.
 * @param {{entry: {owners: Array<number>}}} choice - A place in the list
 * @returns {boolean} True if the way there uses other players' track
 */
const isViaOthers = (choice) => choice.entry.owners.length > 0

/**
 * Orders and filters the "Run to" list. The places the player's own track
 * leads to come first, in the order given (towns nearest first, then the
 * ends of the line), so they stand out. Those whose way runs on other
 * players' track follow as a second group, in the same order — only when
 * the player has them shown, as most of the time players stick to their own
 * track. The place the train is already heading for stays either way, so
 * carrying on toward it is still one Confirm.
 * @param {Array<Object>} choices - Every place the train can get to, each
 *   { id, entry, … }
 * @param {{showOthers: boolean, keepId: string|null}} options - Whether to
 *   show the places on other players' track, and the id of a place to keep
 *   regardless (the heading)
 * @returns {Array<Object>} The places to list
 */
export function listedRunChoices(choices, { showOthers, keepId }) {
  const own = choices.filter((choice) => !isViaOthers(choice))
  const others = choices.filter(
    (choice) => isViaOthers(choice) && (showOthers || choice.id === keepId)
  )
  return [...own, ...others]
}

export function useTrainControls() {
  const playerStore = usePlayerStore()
  const gameStore = useGameStore()
  const trainsStore = useTrainsStore()
  const townsStore = useTownsStore()
  const mapStore = useMapStore()
  const trainStopStore = useTrainStopStore()
  const runListStore = useRunListStore()
  // The game view's build-track instance, so choosing a town can end any
  // drawing or removal first: all three act on map clicks
  const buildTrack = inject(buildTrackKey, null)

  /** The player whose turn it is */
  const playerId = computed(() => playerStore.activePlayer?.id)

  /** Their train, its kind, and the town it is in (null off a town) */
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

  /**
   * The town, or point on the track, a run of more than one turn is still on
   * its way to, and how it stands now, or null (see the trains store's
   * `headingOf`)
   */
  const heading = computed(() => trainsStore.headingOf(playerId.value))

  /**
   * Everywhere the "Run to" list can offer, each { id, kind, key, name,
   * entry }: the towns the train can get to, nearest first, then the ends of
   * its owner's line (see the trains store's `destinations` and `lineEnds`).
   * A point on the track the train is heading for, chosen on the map, joins
   * the second group, so carrying on toward it is one Confirm like carrying
   * on toward a town. `kind` is 'town' or 'point', and `key` the town's id or
   * the point's node key; `id` puts the two together, as one list can hold a
   * town and a point. `entry` is the store's entry for the place (how far,
   * how long, whose track, what fees).
   *
   * The list itself shows `runChoices`: these, less any the player has
   * hidden.
   */
  const allRunChoices = computed(() => {
    if (moveBlock.value) return []
    const towns = trainsStore.destinations(playerId.value).map((entry) => ({
      id: `town:${entry.town.msa}`,
      kind: 'town',
      key: entry.town.msa,
      name: entry.town.name,
      entry
    }))
    const points = trainsStore.lineEnds(playerId.value)
    const headingPoint = heading.value?.route ? heading.value.point : null
    if (headingPoint && !points.some(({ point }) => point.key === headingPoint.key)) {
      points.push({ point: headingPoint, ...heading.value.route })
      points.sort((a, b) => a.km - b.km)
    }
    return [
      ...towns,
      ...points.map((entry) => ({
        id: `point:${entry.point.key}`,
        kind: 'point',
        key: entry.point.key,
        name: trackPointTitle(entry.point),
        entry
      }))
    ]
  })

  /** The id in `runChoices` of where the train is heading, or null */
  const headingChoiceId = computed(() => {
    if (!heading.value?.route) return null
    const { town: headingTown, point } = heading.value
    return headingTown ? `town:${headingTown.msa}` : `point:${point.key}`
  })

  /**
   * What the "Run to" list shows: the places on the player's own track
   * first, then, if the player has them shown, those whose way runs on
   * other players' track (see `listedRunChoices` and the run list store)
   */
  const runChoices = computed(() =>
    listedRunChoices(allRunChoices.value, {
      showOthers: runListStore.showsOthersTrack,
      keepId: headingChoiceId.value
    })
  )

  /**
   * Whether any place the train can get to needs other players' track: only
   * then is there anything for the show/hide toggle to do
   */
  const hasOthersTrackChoices = computed(() => allRunChoices.value.some(isViaOthers))

  /** Whether the list is showing the places on other players' track */
  const othersTrackShown = computed(() => runListStore.showsOthersTrack)

  /** Where the train is and where it is heading, in a sentence */
  const status = computed(() =>
    whereabouts({
      placed: Boolean(train.value.position),
      town: town.value,
      heading: heading.value,
      nearest: trainsStore.nearestTownOf(playerId.value),
      speedUnitKm: gameStore.boardScale.speedUnitKm
    })
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

  /**
   * Runs the train to a point on the track and stops it there, or toward it
   * when it is too far for one turn.
   * @param {string} nodeKey - The point (see the trains store's `trackStops`)
   */
  function moveToTrack(nodeKey) {
    const result = trainStopStore.report(
      trainsStore.moveTrainToTrack(playerId.value, nodeKey),
      ({ arrived, km, paid, point }) => {
        const where = trackPointName(point)
        const run = arrived
          ? `Ran ${Math.round(km)} km to ${where} and stopped there.`
          : `Ran ${Math.round(km)} km toward ${where} and stopped on the way.`
        const fees = paid.map(
          ({ ownerId, amount }) => `${formatCurrency(amount)} to ${nameOf(ownerId)}`
        )
        return fees.length ? `${run} Paid ${fees.join(' and ')} to use their track.` : run
      }
    )
    // Out on the line, the train is in no town, and any stop card closes
    if (result.ok) trainStopStore.arrive()
  }

  /**
   * Runs the train to a place chosen in the "Run to" list.
   * @param {string} id - The place's id (see `runChoices`)
   */
  function run(id) {
    const choice = runChoices.value.find((option) => option.id === id)
    if (choice?.kind === 'town') move(choice.key)
    else if (choice?.kind === 'point') moveToTrack(choice.key)
  }

  // Loading and unloading go through the train stop store, which the map's
  // stop card and commodity icons use too
  const { pickUp, deliver, drop } = trainStopStore

  // CHOOSING A TOWN ON THE MAP

  /** Whether clicking a town on the map places or runs the train */
  const isPicking = computed(() => mapStore.townPicker !== null)

  /**
   * Starts choosing a town on the map: each click places the train there,
   * or, once it is placed, runs it there. Once it is placed, the points on
   * the track it can be run to are marked too (see trackStopMarkers), and
   * clicking one runs it there. Any drawing or removal is ended first.
   * Choosing stays on, for a run through several stops, until Escape, the
   * Stop button, or the train has nowhere left to go this turn.
   */
  function startPicking() {
    if (buildTrack?.isDrawingActive.value) buildTrack.cancelDrawing()
    if (buildTrack?.isRemoving.value) buildTrack.toggleRemoveMode()
    // The prompt changes once the train is placed, and there is nothing
    // more to choose once it can go no further
    const carryOn = () => (moveBlock.value ? stopPicking() : startPicking())
    if (!train.value.position) {
      mapStore.setTownPicker({
        prompt: 'Click a town to place your train there.',
        onPick: ({ msa }) => {
          place(msa)
          carryOn()
        }
      })
      return
    }
    mapStore.setTownPicker({
      prompt: 'Click a town, or a marked point on the track, to run your train there.',
      onPick: ({ msa }) => {
        move(msa)
        carryOn()
      },
      onPickPoint: (nodeKey) => {
        moveToTrack(nodeKey)
        carryOn()
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
    runChoices,
    hasOthersTrackChoices,
    othersTrackShown,
    headingChoiceId,
    heading,
    status,
    pickups,
    deliveries,
    towns,
    notice,
    nameOf,
    colorOf,
    place,
    run,
    pickUp,
    deliver,
    drop,
    isPicking,
    startPicking,
    stopPicking,
    toggleOthersTrack: runListStore.toggleOthersTrack
  }
}
