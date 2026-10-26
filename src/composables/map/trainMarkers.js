/**
 * Train Markers (trainMarkers.js)
 *
 * Shows every player's train on the map: a disc in the player's color with a
 * train on it, wherever the train stands. Trains not yet placed are not
 * shown. Redrawn whenever a train moves or a player's color changes.
 *
 * The disc sits just above and to the right of the train's spot, so it does
 * not hide the town dot beneath; trains on the same spot are set side by
 * side. Markers take no clicks, so the town under a train can still be
 * clicked, and Geoman ignores them, so track never snaps to a train.
 *
 * Drawn as plain inline-styled HTML for now; the look is a first pass.
 *
 * @module composables/map/trainMarkers
 */

import { watch, onUnmounted } from 'vue'
import L from 'leaflet'
import { usePlayerStore } from '@/stores/players'
import { useTrainsStore } from '@/stores/trains'
import { pointKey } from '@/composables/network'

/** The disc's width and height, in px */
const SIZE = 22

/** How far apart trains on the same spot are set, in px */
const STAGGER = SIZE + 2

/**
 * The disc's HTML.
 * @param {Object} player - The train's owner
 * @returns {string} HTML for a Leaflet divIcon
 */
function trainHtml(player) {
  // A name is typed by a player, so it is escaped before going into the page
  const name = player.name.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
  const style = [
    `width:${SIZE}px`,
    `height:${SIZE}px`,
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'border:2px solid #fff',
    'border-radius:50%',
    `background:${player.color}`,
    'box-shadow:0 1px 4px rgba(0,0,0,0.6)',
    'color:#fff',
    'font-size:11px'
  ].join(';')
  return `<span style="${style}" title="${name}'s train"><i class="fas fa-train" aria-hidden="true"></i></span>`
}

export function useTrainMarkers() {
  const playerStore = usePlayerStore()
  const trainsStore = useTrainsStore()

  /** The layer holding every train's marker */
  const layer = L.layerGroup()
  let isAttached = false

  /** Puts a marker on the map for every placed train, in turn order */
  function draw() {
    if (!isAttached) return
    layer.clearLayers()
    // How many trains have been put on each spot so far, to set the next aside
    const onSpot = new Map()
    playerStore.players.forEach((player) => {
      const position = trainsStore.trainOf(player.id).position
      if (!position) return
      const key = pointKey(position)
      const place = onSpot.get(key) ?? 0
      onSpot.set(key, place + 1)
      L.marker([position.lat, position.lng], {
        icon: L.divIcon({
          html: trainHtml(player),
          className: '',
          iconSize: [SIZE, SIZE],
          // A negative x anchor puts the disc to the right of the spot
          iconAnchor: [-4 - place * STAGGER, SIZE + 4]
        }),
        interactive: false,
        keyboard: false,
        pmIgnore: true,
        zIndexOffset: 1000
      }).addTo(layer)
    })
  }

  watch(
    () =>
      playerStore.players.map((player) => [
        player.color,
        player.name,
        trainsStore.trainOf(player.id).position
      ]),
    draw,
    { deep: true }
  )

  /**
   * Starts showing the trains on a map.
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
