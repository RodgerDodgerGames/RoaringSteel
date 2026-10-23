/**
 * Region Mask (regionMask.js)
 *
 * Grays out the map outside the region being played, so the edge of the
 * board is plain to see. Track may not be built in the gray (see
 * buildRules.js); towns and their icons outside it still show above it.
 *
 * The mask is one polygon covering the whole world, with the region cut out
 * of it. Leaflet fills polygons even-odd, so each ring of the region flips
 * the fill: a state's outline cuts a hole in the gray, and a hole in the
 * state (a lake or another state inside it) is gray again.
 *
 * @module composables/map/regionMask
 */

import { watch } from 'vue'
import L from 'leaflet'
import { useGameStore } from '@/stores/game'
import { regionPolygons } from '@/composables/map/region'

/**
 * The map pane the mask is drawn in: above the terrain tiles (200) and below
 * everything drawn on the board — track starts at 410 — so nothing on top
 * of the gray is grayed by it.
 */
const MASK_PANE = 'regionMask'
const MASK_PANE_Z_INDEX = 350

/** A ring round the whole world, in [lat, lng], well past the date line */
const WORLD_RING = [
  [-90, -540],
  [90, -540],
  [90, 540],
  [-90, 540]
]

/**
 * How the mask looks: a see-through gray, so the terrain beyond the border
 * can still be made out, edged with a dark line along the region's border.
 *
 * It takes no clicks, and Geoman leaves it alone: snapping to its border
 * would pull track onto the state line, and removal mode must not offer it.
 */
const MASK_STYLE = {
  pane: MASK_PANE,
  color: '#333',
  weight: 1.5,
  fillColor: '#555',
  fillOpacity: 0.45,
  interactive: false,
  pmIgnore: true,
  snapIgnore: true
}

/**
 * The rings of the mask polygon: the world first, then every ring of every
 * polygon in the region, in [lat, lng] as Leaflet takes them.
 *
 * @param {Object|null} region - GeoJSON Feature or FeatureCollection, of
 *   Polygons or MultiPolygons
 * @returns {Array<Array<Array<number>>>|null} The rings, or null when there
 *   is no region to cut out (nothing is masked then)
 */
export function maskRings(region) {
  const polygons = regionPolygons(region).flatMap(({ geometry }) =>
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  )
  if (polygons.length === 0) return null

  const regionRings = polygons.flat().map((ring) => ring.map(([lng, lat]) => [lat, lng]))
  return [WORLD_RING, ...regionRings]
}

/**
 * Draws the mask on a map, in a pane of its own.
 * @param {Object} map - Leaflet map
 * @param {Object|null} region - The region being played
 * @returns {Object|null} The mask layer, or null when there is no region
 */
function drawRegionMask(map, region) {
  const rings = maskRings(region)
  if (!rings) return null
  if (!map.getPane(MASK_PANE)) {
    map.createPane(MASK_PANE).style.zIndex = MASK_PANE_Z_INDEX
  }
  return L.polygon(rings, MASK_STYLE).addTo(map)
}

/**
 * Keeps a map masked to the region in the game store.
 *
 * The mask is redrawn whenever the region changes — a game in another state
 * loaded over this one — so the gray always matches where the build rules
 * keep track out of.
 *
 * @returns {{attach: Function}} `attach(map)` draws the mask on a map, once
 *   the map exists
 */
export function useRegionMask() {
  const gameStore = useGameStore()
  let map = null
  let mask = null

  /** Takes down the mask drawn last, if any, and draws the region's */
  function redraw() {
    mask?.remove()
    mask = map ? drawRegionMask(map, gameStore.region) : null
  }

  watch(() => gameStore.region, redraw)

  /** @param {Object} leafletMap - The map to mask */
  function attach(leafletMap) {
    map = leafletMap
    redraw()
  }

  return { attach }
}
