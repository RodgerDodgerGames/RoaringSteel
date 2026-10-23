/**
 * Map View Composable (useMapView.js)
 *
 * Puts the Leaflet map into the Plan or Build view chosen in the map store,
 * and keeps it there as the window changes size. What each view is, and the
 * arithmetic behind where it looks, is in mapViews.js.
 *
 * - Plan: fitted to the region, with every way of moving the map switched off
 *   and the zoom buttons hidden. Zoom is allowed to fall between whole levels
 *   (Leaflet's `zoomSnap: 0`) so the region fills the map exactly, and is
 *   refitted whenever the map changes size.
 * - Build: reopened where the player last left it, limited to the Build
 *   view's zoom range and kept from panning far past the region. Zoom snaps
 *   to whole levels again, so tiles stay sharp. Every move is recorded in
 *   the map store, which saves it with the game.
 *
 * The town commodity icons shown in the Plan view are drawn by useTowns.
 *
 * @module composables/map/useMapView
 */

import { computed, watch, onBeforeUnmount } from 'vue'
import L from 'leaflet'
import { useMapStore } from '@/stores/map'
import { useGameStore } from '@/stores/game'
import { mapViewConfig } from '@/config/map'
import {
  BUILD_VIEW,
  PLAN_VIEW,
  buildViewStart,
  panLimits,
  regionBounds
} from '@/composables/map/mapViews'

/**
 * Leaflet's handlers for moving the map by mouse, touch and keyboard. All of
 * them are off in the Plan view and on in the Build view.
 */
const MOVE_HANDLERS = [
  'dragging',
  'touchZoom',
  'doubleClickZoom',
  'scrollWheelZoom',
  'boxZoom',
  'keyboard'
]

/**
 * @returns {Object} { attach, refit }: `attach` hands over the Leaflet map once
 *   it exists; `refit` is called after the map's container changes size
 */
export function useMapView() {
  const mapStore = useMapStore()
  const gameStore = useGameStore()

  /** The Leaflet map, once attached */
  let map = null

  /** True while the Plan view is fitting the region, so its own moves can be told apart */
  let isFitting = false

  /** The box around the playing region, or null with no region */
  const bounds = computed(() => regionBounds(gameStore.region))

  /**
   * Takes charge of the map: puts it in the current view, and starts
   * following where the map is moved to.
   * @param {Object} leafletMap - The game's Leaflet map
   */
  function attach(leafletMap) {
    map = leafletMap
    map.on('moveend', handleMoveEnd)
    // Every game has a region; without one neither view knows where to look
    if (!bounds.value) console.error('Cannot set the map view: the game has no region')
    showView()
  }

  /**
   * Puts the map into the view the store holds. Does nothing while there is
   * no region, which happens for a moment while a save is loaded (every store
   * is reset before the save's contents go back in): the map is left where it
   * is rather than sent somewhere arbitrary, and is put into the view when
   * the region comes back.
   */
  function showView() {
    if (!map || !bounds.value) return
    if (mapStore.viewMode === PLAN_VIEW) showPlan()
    else if (mapStore.viewMode === BUILD_VIEW) showBuild()
  }

  /** Fits the whole region to the map and fixes it in place */
  function showPlan() {
    setMovable(false)
    // Limits off first: the region may need a zoom outside the Build range
    // to fit (further out for Texas, closer in for Rhode Island)
    map.setMaxBounds(null)
    map.setMinZoom(0)
    map.setMaxZoom(18)
    map.options.zoomSnap = 0
    fitRegion()
  }

  /** Reopens the Build view where it was left, within its limits */
  function showBuild() {
    const { buildMinZoom, buildMaxZoom } = mapViewConfig
    // Measured while zoom may still fall between whole levels, so it is the
    // Plan view's exact zoom (the first opening is one level closer than it)
    const planZoom = map.getBoundsZoom(bounds.value, false, planPaddingTotal())
    map.options.zoomSnap = 1
    const { zoom, center } = buildViewStart(
      { zoom: mapStore.mapZoom, center: mapStore.mapCenter },
      bounds.value,
      planZoom
    )
    // Moved into place before the limits go on, so the limits never push
    // the map somewhere on the way
    map.setView(center, zoom, { animate: false })
    map.setMinZoom(buildMinZoom)
    map.setMaxZoom(buildMaxZoom)
    map.setMaxBounds(panLimits(bounds.value))
    setMovable(true)
  }

  /** Fits the region to the map, with a little clear space around it */
  function fitRegion() {
    const padding = mapViewConfig.planPadding
    isFitting = true
    try {
      map.fitBounds(bounds.value, { padding: [padding, padding], animate: false })
    } finally {
      isFitting = false
    }
  }

  /**
   * The Plan view's clear space, top and bottom and side to side together:
   * the form Leaflet's `getBoundsZoom` takes it in.
   * @returns {Object} Leaflet point
   */
  function planPaddingTotal() {
    const total = mapViewConfig.planPadding * 2
    return L.point(total, total)
  }

  /**
   * Switches every way of moving the map on or off, the zoom buttons with
   * them.
   * @param {boolean} movable - True to let the player move the map
   */
  function setMovable(movable) {
    MOVE_HANDLERS.forEach((name) => {
      if (movable) map[name]?.enable()
      else map[name]?.disable()
    })
    if (map.zoomControl) {
      if (movable) map.zoomControl.addTo(map)
      else map.zoomControl.remove()
    }
  }

  /**
   * Follows the map each time it stops moving.
   *
   * In the Build view, records where it is, so the view reopens there and the
   * save remembers it.
   *
   * In the Plan view the map should never move at all, but Leaflet can still
   * finish a movement started in the Build view after the switch, which left
   * the region off-center. Stopping Leaflet's animations on the switch
   * (`map.stop()`) did not catch them all: after drags at the Build view's
   * furthest zoom, one still landed a quarter second later. So any move in the
   * Plan view that is not the view's own fitting is answered by fitting the
   * region again. The fitting's own moves are ignored, so this cannot go
   * round in a loop.
   */
  function handleMoveEnd() {
    if (mapStore.viewMode === BUILD_VIEW) {
      const { lat, lng } = map.getCenter()
      mapStore.setMapView({ zoom: map.getZoom(), center: [lat, lng] })
    } else if (!isFitting) {
      fitRegion()
    }
  }

  /**
   * Refits the Plan view after the map changes size (the window resizing,
   * the demand strip collapsing), so the region still fills it. The Build
   * view keeps its zoom and only shows more or less around it.
   */
  function refit() {
    if (map && bounds.value && mapStore.viewMode === PLAN_VIEW) fitRegion()
  }

  // On a change of view, and on a change of region: loading a save resets
  // the view while the region is briefly gone, so the view can only be put
  // right once the save's region is back. Synchronous, so the map is already
  // in the Build view by the time a drawing that switched it there starts
  // (see useBuildTrack).
  watch([() => mapStore.viewMode, bounds], showView, { flush: 'sync' })

  onBeforeUnmount(() => {
    map?.off('moveend', handleMoveEnd)
  })

  return { attach, refit }
}
