/**
 * Track Stop Markers (trackStopMarkers.js)
 *
 * While the player is choosing on the map where to run their train ("Choose
 * on the map" in the dock), marks the points on the track it can be run to —
 * ends, bends and junctions: all of those on its owner's own track, and
 * those on other players' track within this turn's reach once the train is
 * at their track (see the trains store's `trackStops`). Clicking one runs
 * the train there and stops it, short of any town: to wait at the end of its
 * track, say, or next to another player's track ready for next turn. A point
 * too far for this turn is headed for, as a far town is.
 *
 * The marks are small hollow rings that grow under the pointer, shown only
 * while the map's picker takes points (see the map store's `townPicker`),
 * and redrawn as the train moves, so they always show where it can go next.
 * Points beyond this turn's reach are faded, so the ones it gets to now
 * stand out. Each names how far the point is, how long the run takes when
 * it is more than this turn, and any fee this turn's part of it pays, on
 * hover.
 * Leaflet markers can be reached with Tab and clicked with Enter, so the
 * points can be chosen from the keyboard too.
 *
 * @module composables/map/trackStopMarkers
 */

import { computed, watch, onUnmounted } from 'vue'
import L from 'leaflet'
import { useMapStore } from '@/stores/map'
import { usePlayerStore } from '@/stores/players'
import { useGameStore } from '@/stores/game'
import { useTrainsStore } from '@/stores/trains'
import { spacesText, turnsText } from '@/composables/trainStatus'
import { formatShortCurrency } from '@/composables/utils'

/** The clickable box round each ring, in px: larger than the ring itself */
const SIZE = 18

export function useTrackStopMarkers() {
  const mapStore = useMapStore()
  const playerStore = usePlayerStore()
  const gameStore = useGameStore()
  const trainsStore = useTrainsStore()

  /** The layer holding the marks */
  const layer = L.layerGroup()
  let isAttached = false

  /** The points to mark: none unless the picker takes points */
  const stops = computed(() => {
    const playerId = playerStore.activePlayer?.id
    if (!mapStore.townPicker?.onPickPoint || playerId == null) return []
    return trainsStore.trackStops(playerId)
  })

  /**
   * What a mark says on hover: how far the point is, in spaces, how many
   * turns it takes when it is beyond this turn, and any fee.
   * @param {Object} stop - From `trackStops`
   * @returns {string} e.g. "Stop here: 2.4 spaces · $4M to Bo", or "Head
   *   here: 14 spaces (3 turns)"
   */
  function labelOf(stop) {
    const spaces = spacesText(stop.km, gameStore.boardScale.speedUnitKm)
    const label = stop.inReach
      ? `Stop here: ${spaces}`
      : `Head here: ${spaces} (${turnsText(stop)})`
    if (!stop.fee) return label
    const names = stop.payTo.map(
      (id) => playerStore.players.find((p) => p.id === id)?.name ?? 'another player'
    )
    return `${label} · ${formatShortCurrency(stop.fee)} to ${names.join(', ')}`
  }

  /** Puts a mark on the map for each point the train can stop at */
  function draw() {
    if (!isAttached) return
    layer.clearLayers()
    stops.value.forEach((stop) => {
      const label = labelOf(stop)
      const marker = L.marker([stop.lat, stop.lng], {
        icon: L.divIcon({
          html: '<span class="track-stop__ring"></span>',
          className: stop.inReach ? 'track-stop' : 'track-stop is-later',
          iconSize: [SIZE, SIZE]
        }),
        // Track must never snap to a mark, nor a removal take one
        pmIgnore: true,
        // Over the track and the towns, so a point beside a town is clickable
        zIndexOffset: 500
      })
      marker.bindTooltip(label, { direction: 'top', offset: [0, -SIZE / 2] })
      marker.on('click', () => mapStore.townPicker?.onPickPoint?.(stop.key))
      marker.on('add', () => {
        // Named for screen readers as the tooltip names it on hover
        const element = marker.getElement()
        element?.setAttribute('role', 'button')
        element?.setAttribute('aria-label', label)
      })
      marker.addTo(layer)
    })
  }

  watch(stops, draw)

  /**
   * Starts marking track stops on a map.
   * @param {Object} map - The Leaflet map
   */
  function attach(map) {
    layer.addTo(map)
    isAttached = true
    draw()
  }

  onUnmounted(() => {
    layer.remove()
    isAttached = false
  })

  return { attach }
}
