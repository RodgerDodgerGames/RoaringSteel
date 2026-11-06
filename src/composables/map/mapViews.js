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
 * - **Build**: close enough to lay track cell by cell. Zoom is held to a
 *   range set by the size of the grid's cells (see `buildZoomRange`), and
 *   panning stops a little past the edge of the region.
 *
 * The functions here work out where each view looks. They are pure (plain
 * numbers in, plain numbers out), so they are tested without a map;
 * useMapView applies them to the Leaflet map.
 *
 * Bounds are written the way Leaflet takes them: [[south, west], [north, east]].
 *
 * @module composables/map/mapViews
 */

import { bbox } from '@turf/turf'
import { mapViewConfig } from '@/config/map'
import { metersPerPixel } from '@/composables/setup/useElevationTiles'

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

/** The basemap's closest zoom */
const MAX_MAP_ZOOM = 18

/**
 * The Build view's range of zoom levels, for a grid of cells this wide.
 *
 * The closest is the closest whole zoom at which a cell is no more than
 * `mapViewConfig.buildCellPixels` across, so a small board's small cells are
 * seen as closely as a big board's big ones; the furthest is
 * `buildZoomSteps` out from it.
 *
 * @param {number} cellWidthKm - How wide the grid's cells are
 * @param {number} latitude - Where, in degrees; map pixels cover less
 *   ground toward the poles
 * @returns {{min: number, max: number}} The furthest and closest zoom
 */
export function buildZoomRange(cellWidthKm, latitude) {
  const metersPerPixelAtZero = metersPerPixel(0, latitude)
  // At zoom z a cell is cellMeters / (metersPerPixelAtZero / 2^z) pixels
  // across; solved for the zoom that makes that buildCellPixels. Rounded
  // down, so a cell is never drawn bigger than buildCellPixels. The tiny
  // allowance keeps a zoom that is whole but for floating-point noise from
  // being dropped a level.
  const exact = Math.log2(
    (mapViewConfig.buildCellPixels * metersPerPixelAtZero) / (cellWidthKm * 1000)
  )
  const max = Math.min(MAX_MAP_ZOOM, Math.floor(exact + 1e-9))
  return { min: max - mapViewConfig.buildZoomSteps, max }
}

/**
 * Holds a zoom to the Build view's range.
 * @param {number} zoom - Any zoom level
 * @param {{min: number, max: number}} range - See `buildZoomRange`
 * @returns {number} The nearest zoom the Build view allows
 */
function toBuildZoom(zoom, { min, max }) {
  return Math.min(Math.max(zoom, min), max)
}

/**
 * Where the Build view opens: where the player last left it.
 *
 * The first time, it opens over the middle of the region one whole zoom level
 * closer than the Plan view, so switching to it zooms in. (A region the size
 * of Colorado fits a desktop window at about 7.5, so opening any further out
 * would show the region smaller than the Plan view did.) The Build view's
 * range holds the zoom in: on most boards its furthest zoom is already
 * closer than one level in from the Plan view, and the Build view opens
 * there.
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
 * @param {number|undefined} planZoom - The zoom the Plan view fits the region
 *   at. Without it, the first opening is at the Build view's furthest zoom.
 * @param {{min: number, max: number}} range - The Build view's zoom range
 *   (see `buildZoomRange`)
 * @returns {{zoom: number, center: Array<number>}} The zoom and [lat, lng]
 *   center to open at
 */
export function buildViewStart(lastView, bounds, planZoom, range) {
  const [[south, west], [north, east]] = bounds
  const [[minLat, minLng], [maxLat, maxLng]] = panLimits(bounds)
  const [lat, lng] = lastView?.center ?? []
  const isWithinReach = lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng
  const zoom = Math.round(lastView?.zoom)
  const wasLeftHere = isWithinReach && zoom === toBuildZoom(zoom, range)

  if (wasLeftHere) return { zoom, center: [lat, lng] }

  const firstZoom = Number.isFinite(planZoom) ? Math.floor(planZoom) + 1 : range.min
  return {
    zoom: toBuildZoom(firstZoom, range),
    center: [(south + north) / 2, (west + east) / 2]
  }
}

/**
 * Where the Build view opens when it is sent to a point, such as a town
 * clicked in the Plan view: centered on the point, at the zoom the player
 * last left the Build view at, or at its closest zoom if they have not yet
 * left it at one it still allows. (The pan limits keep the map itself from
 * going past the region's edge; a point near it ends up off-center.)
 * @param {Array<number>} center - [lat, lng] to open over
 * @param {number|null} lastZoom - The zoom the Build view was last left at
 *   (the map store's `mapZoom`), or null
 * @param {{min: number, max: number}} range - The Build view's zoom range
 *   (see `buildZoomRange`)
 * @returns {{zoom: number, center: Array<number>}} The zoom and [lat, lng]
 *   center to open at
 */
export function buildViewAt(center, lastZoom, range) {
  const zoom = Math.round(lastZoom)
  const isAllowed = Number.isFinite(zoom) && zoom === toBuildZoom(zoom, range)
  return { zoom: isAllowed ? zoom : range.max, center }
}
