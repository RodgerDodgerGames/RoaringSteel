/**
 * Map Views (mapViews.js)
 *
 * The game map is seen two ways, and the player switches between them in the
 * top bar:
 *
 * - **Plan**: the whole region at once, fitted to the window and fixed in
 *   place (no zooming, no dragging), with each town's commodities shown
 *   around it. This is the board laid out on the table: where players work
 *   out where to start building and which demands to chase. The game opens
 *   in this view.
 * - **Build**: close enough to lay track cell by cell. Zoom is held between
 *   `mapViewConfig.buildMinZoom` and `buildMaxZoom`, and panning stops a
 *   little past the edge of the region.
 *
 * The functions here work out where each view looks, and where a town's
 * popup goes in the Plan view. They are pure (plain numbers in, plain numbers
 * out), so they are tested without a map; useMapView and useTowns apply them
 * to the Leaflet map.
 *
 * Bounds are written the way Leaflet takes them: [[south, west], [north, east]].
 *
 * @module composables/map/mapViews
 */

import { bbox } from '@turf/turf'
import { mapViewConfig } from '@/config/map'

/** The view that shows the whole region, fixed in place */
export const PLAN_VIEW = 'plan'

/** The zoomed-in view track is built in */
export const BUILD_VIEW = 'build'

/** Every view the map can be in */
export const MAP_VIEWS = [PLAN_VIEW, BUILD_VIEW]

/**
 * The box around the playing region.
 * @param {Object|null} region - The region's GeoJSON (the game store's `region`)
 * @returns {Array<Array<number>>|null} [[south, west], [north, east]], or
 *   null with no region
 */
export function regionBounds(region) {
  if (!region) return null
  const [west, south, east, north] = bbox(region)
  return [
    [south, west],
    [north, east]
  ]
}

/**
 * How far the Build view may pan: the region's box grown on every side by a
 * share of its own size.
 * @param {Array<Array<number>>} bounds - The region's box
 * @param {number} [margin] - Share of the box's height and width to add on
 *   each side
 * @returns {Array<Array<number>>} The grown box
 */
export function panLimits(bounds, margin = mapViewConfig.panMargin) {
  const [[south, west], [north, east]] = bounds
  const latMargin = (north - south) * margin
  const lngMargin = (east - west) * margin
  return [
    [south - latMargin, west - lngMargin],
    [north + latMargin, east + lngMargin]
  ]
}

/**
 * Holds a zoom to the Build view's range.
 * @param {number} zoom - Any zoom level
 * @returns {number} The nearest zoom the Build view allows
 */
function toBuildZoom(zoom) {
  return Math.min(Math.max(zoom, mapViewConfig.buildMinZoom), mapViewConfig.buildMaxZoom)
}

/**
 * Where the Build view opens: where the player last left it.
 *
 * The first time, it opens over the middle of the region one whole zoom level
 * closer than the Plan view, so switching to it zooms in. (A region the size
 * of Colorado fits a desktop window at about 7.5, well inside the Build
 * view's range, so opening at its furthest zoom would show the region smaller
 * than the Plan view did.) The exceptions are the smallest states, which the
 * Plan view already shows closer than the Build view's closest zoom; their
 * Build view opens at that closest zoom.
 *
 * A last view the Build view could not have been left at, centered past its
 * pan limits or at a zoom outside its range, counts as no last view at all.
 * Saves from before there were two views recorded a view that was never kept
 * up to date (zoom 3 over the middle of the country), and reopening there
 * would mean a zoom and place the player never chose. Its center, on the
 * Kansas–Nebraska line, lies inside both of those states, so the zoom has to
 * be checked as well as the place.
 *
 * @param {{zoom: number|null, center: Array<number>|null}|null} lastView -
 *   Where the Build view was last left (the map store's `mapZoom` and
 *   `mapCenter`)
 * @param {Array<Array<number>>} bounds - The region's box
 * @param {number} [planZoom] - The zoom the Plan view fits the region at.
 *   Without it, the first opening is at the Build view's furthest zoom.
 * @returns {{zoom: number, center: Array<number>}} The zoom and [lat, lng]
 *   center to open at
 */
export function buildViewStart(lastView, bounds, planZoom) {
  const [[south, west], [north, east]] = bounds
  const [[minLat, minLng], [maxLat, maxLng]] = panLimits(bounds)
  const [lat, lng] = lastView?.center ?? []
  const isWithinReach = lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng
  const zoom = Math.round(lastView?.zoom)
  const wasLeftHere = isWithinReach && zoom === toBuildZoom(zoom)

  if (wasLeftHere) return { zoom, center: [lat, lng] }

  const firstZoom = Number.isFinite(planZoom)
    ? Math.floor(planZoom) + 1
    : mapViewConfig.buildMinZoom
  return {
    zoom: toBuildZoom(firstZoom),
    center: [(south + north) / 2, (west + east) / 2]
  }
}

// Leaflet's popup geometry, as `planPopupOffset` works with it. A popup's
// `offset` option moves it from where Leaflet puts it by default: centered
// over its town, its bottom edge POPUP_TIP_SPACE - DEFAULT_OFFSET_Y px above
// the town, with the tip filling the gap down to the town.

/** Leaflet's default vertical popup offset, which sits a popup above its town */
const DEFAULT_OFFSET_Y = 7

/** Space Leaflet keeps under every popup for its tip, in px */
const POPUP_TIP_SPACE = 20

/**
 * How far below a town's center a popup dropped under it starts, in px: past
 * the town's dot (16px at the largest) and the name hung beneath it.
 */
const BELOW_CLEARANCE = 34

/** Space kept between a popup and the edge of the map, in px */
const EDGE_MARGIN = 8

/**
 * Where to put a town's popup in the Plan view so that it stays inside the
 * map.
 *
 * In the Build view a popup that would run off the map pans the map to fit
 * itself in. The Plan view is fixed, so the popup is moved instead: dropped
 * below its town when there is no room above (or onto whichever side has
 * more room, on a map too short for either), and slid sideways off the left
 * or right edge. A popup moved either way loses its tip, which would no
 * longer point at its town.
 *
 * @param {{width: number, height: number}} size - The popup's size, in px
 * @param {{x: number, y: number}} anchor - Where its town is on the map, in
 *   px from the map's top left corner
 * @param {{x: number, y: number}} mapSize - The map's width and height, in px
 * @returns {{offset: Array<number>, showTip: boolean}} The [x, y] offset to
 *   give the popup, and whether its tip still points at its town
 */
export function planPopupOffset(size, anchor, mapSize) {
  const topAbove = anchor.y + DEFAULT_OFFSET_Y - POPUP_TIP_SPACE - size.height
  const bottomBelow = anchor.y + BELOW_CLEARANCE + size.height
  const roomAbove = topAbove - EDGE_MARGIN
  const roomBelow = mapSize.y - EDGE_MARGIN - bottomBelow
  const isBelow = roomAbove < 0 && roomBelow > roomAbove

  // Below: the bottom edge moves down a popup's height, the tip space and the
  // clearance, which puts the top edge BELOW_CLEARANCE under the town
  const y = isBelow ? BELOW_CLEARANCE + size.height + POPUP_TIP_SPACE : DEFAULT_OFFSET_Y

  const left = anchor.x - size.width / 2
  const right = left + size.width
  let x = 0
  if (left < EDGE_MARGIN) x = EDGE_MARGIN - left
  else if (right > mapSize.x - EDGE_MARGIN) x = mapSize.x - EDGE_MARGIN - right

  return { offset: [x, y], showTip: !isBelow && x === 0 }
}
