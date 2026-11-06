/**
 * Water Layer (waterLayer.js)
 *
 * Draws the board's water — the lakes, sea and rivers track has to bridge
 * (see water.js) — and their names, in the game's own style over the
 * basemap. The basemap draws water too, from other data, and the two never
 * quite agree; this layer is drawn on top so the water a player sees is the
 * water the build rules use.
 *
 * Only the water on the board is drawn: the lakes, sea and rivers inside the
 * grid's rectangle (see `gridBounds`). It is drawn above the region mask, so
 * water outside the region is not grayed out with the land there: a bay
 * beyond the region's border may be bridged (see buildRules.js), so it has
 * to show as water.
 *
 * Rivers are drawn thicker the more important Natural Earth ranks them (see
 * `waterStyleConfig.riverWeights`), and names show by zoom: each river, lake
 * and bay from the zoom Natural Earth gives it (see `labelZoomOffset`).
 *
 * @module composables/map/waterLayer
 */

import { watch } from 'vue'
import L from 'leaflet'
import { area, bboxClip, pointOnFeature } from '@turf/turf'
import { useGridStore } from '@/stores/grid'
import { useWaterStore } from '@/stores/water'
import { isEmptyGrid } from '@/composables/map/cellGrid'
import { featuresIn, gridBounds } from '@/composables/map/waterData'
import { waterStyleConfig } from '@/config/map'
import { escapeHtml } from '@/composables/utils'

/**
 * The map panes the water is drawn in. The water goes above the region mask
 * (350) and below the track (410 and up), which is drawn over the water it
 * bridges; the names above the water, and below the track too, so a line
 * being drawn is never hidden by one.
 */
const WATER_PANE = 'water'
const WATER_PANE_Z_INDEX = 360
const LABEL_PANE = 'waterLabels'
const LABEL_PANE_Z_INDEX = 370

/**
 * The water's color: the palette's Denim (#2F5D73), deeper than the
 * basemap's pale blue so the two are told apart at a glance.
 */
const WATER_COLOR = '#2f5d73'

/**
 * How lakes and the sea are drawn: filled, with no outline. They are cut to
 * the board's rectangle (see `clipFeatures`), and an outline would be drawn
 * along the cut as well as along the shore, framing the board in blue.
 */
const AREA_STYLE = {
  stroke: false,
  fillColor: WATER_COLOR,
  fillOpacity: 0.45
}

/**
 * What every water layer is told, so it is left alone: it takes no clicks,
 * and Geoman neither snaps track to it nor offers it for removal.
 */
const INERT = { interactive: false, pmIgnore: true, snapIgnore: true }

/**
 * How thick to draw a river (see `waterStyleConfig.riverWeights`).
 * @param {number} rank - Natural Earth's rank for it; lower is more important
 * @returns {number} Pixels
 */
export function riverWeight(rank) {
  const classes = waterStyleConfig.riverWeights
  return (classes.find(({ maxRank }) => rank <= maxRank) ?? classes.at(-1)).weight
}

/**
 * Whether a name is shown at a zoom (see `waterStyleConfig.labelZoomOffset`).
 * @param {number} label - The zoom Natural Earth shows the name from
 * @param {number} zoom - The map's zoom
 * @returns {boolean} True to show it
 */
export function isLabelShown(label, zoom) {
  return zoom >= label + waterStyleConfig.labelZoomOffset
}

/**
 * Features cut to an area: whatever of each lies inside, and none of those
 * with nothing inside.
 * @param {Array<Object>} features - GeoJSON features
 * @param {Array<number>} bounds - [west, south, east, north]
 * @returns {Array<Object>} The cut features
 */
export function clipFeatures(features, bounds) {
  return features
    .map((feature) => ({ ...bboxClip(feature, bounds), properties: feature.properties }))
    .filter(({ geometry }) => geometry.coordinates.length > 0)
}

/**
 * How the map projects a latitude north–south (Web Mercator), up to scale,
 * in the same units as a longitude in radians.
 * @param {number} lat - Degrees
 * @returns {number} The projected height
 */
const mercatorY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))

/**
 * The point a share of the way along a line, measuring along it on the map.
 * @param {Array<Array<number>>} line - [lng, lat] points
 * @param {Array<number>} lengths - Each piece's length (see `pieceLengths`)
 * @param {number} share - 0 for the start, 1 for the end
 * @returns {Array<number>} [lng, lat]
 */
function pointAlong(line, lengths, share) {
  let left = share * lengths.reduce((a, b) => a + b, 0)
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] ? Math.min(1, left / lengths[i]) : 0
      const [lng1, lat1] = line[i]
      const [lng2, lat2] = line[i + 1]
      return [lng1 + t * (lng2 - lng1), lat1 + t * (lat2 - lat1)]
    }
    left -= lengths[i]
  }
  return line[0]
}

/**
 * Each piece of a line's length as the map draws it (Web Mercator, up to
 * scale), so "halfway along" is halfway on screen.
 * @param {Array<Array<number>>} line - [lng, lat] points
 * @returns {Array<number>} Lengths, one per piece
 */
function pieceLengths(line) {
  return line.slice(1).map(([lng2, lat2], i) => {
    const [lng1, lat1] = line[i]
    return Math.hypot(((lng2 - lng1) * Math.PI) / 180, mercatorY(lat2) - mercatorY(lat1))
  })
}

/**
 * Where to write each river's name, and at what angle: once per named river,
 * halfway along the longest stretch of it on the board, turned to run the way
 * the river runs there (from 40% to 60% of the way along, so one wiggle does
 * not tip it) and kept the right way up.
 *
 * A river can be several features (Natural Earth splits rivers, and cutting
 * to the board splits them more); they are grouped by name.
 *
 * @param {Array<Object>} rivers - River features, cut to the board
 * @returns {Array<{name: string, label: number, lat: number, lng: number,
 *   angle: number}>} Where each name goes; `angle` in degrees clockwise
 */
export function riverLabelPlaces(rivers) {
  const longest = new Map()
  rivers.forEach(({ properties, geometry }) => {
    if (!properties?.name) return
    const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates
    lines.forEach((line) => {
      if (line.length < 2) return
      const lengths = pieceLengths(line)
      const length = lengths.reduce((a, b) => a + b, 0)
      const kept = longest.get(properties.name)
      if (!kept || length > kept.length) {
        longest.set(properties.name, { line, lengths, length, label: properties.label })
      }
    })
  })

  return [...longest.entries()].map(([name, { line, lengths, label }]) => {
    const [lng, lat] = pointAlong(line, lengths, 0.5)
    const [lng1, lat1] = pointAlong(line, lengths, 0.4)
    const [lng2, lat2] = pointAlong(line, lengths, 0.6)
    // On screen, x runs east and y runs south, so north is up
    const dx = ((lng2 - lng1) * Math.PI) / 180
    const dy = -(mercatorY(lat2) - mercatorY(lat1))
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI
    // Never upside down
    if (angle > 90) angle -= 180
    if (angle < -90) angle += 180
    return { name, label, lat, lng, angle }
  })
}

/**
 * Where to write the name of each named lake and bay: a point inside it.
 *
 * A lake can be several features (the water data keeps each piece of a lake
 * on its own, and cutting to the board splits them more); like rivers, they
 * are grouped by name and the name is written once, in the largest piece.
 *
 * @param {Array<Object>} lakes - Lake features, cut to the board
 * @param {Array<Object>} bays - Bay label points (from the water data)
 * @returns {Array<{name: string, label: number, lat: number, lng: number}>}
 */
export function areaLabelPlaces(lakes, bays) {
  const largest = new Map()
  lakes.forEach((lake) => {
    const name = lake.properties?.name
    if (!name) return
    const size = area(lake)
    if (!largest.has(name) || size > largest.get(name).size) largest.set(name, { lake, size })
  })
  return [
    ...[...largest.values()].map(({ lake }) => ({ feature: lake, point: pointOnFeature(lake) })),
    ...bays
      .filter(({ properties }) => properties?.name)
      .map((bay) => ({ feature: bay, point: bay }))
  ].map(({ feature, point }) => {
    const [lng, lat] = point.geometry.coordinates
    return { name: feature.properties.name, label: feature.properties.label, lat, lng }
  })
}

/**
 * A name on the map, as a marker with no icon of its own: just the text,
 * centered on its place and turned to its angle.
 * @param {{name: string, lat: number, lng: number, angle?: number}} place
 * @param {string} kind - 'river' or 'area', for its style (see map.css)
 * @returns {Object} The Leaflet marker
 */
function labelMarker({ name, lat, lng, angle = 0 }, kind) {
  const html =
    `<span class="water-label water-label--${kind}"` +
    ` style="transform: translate(-50%, -50%) rotate(${angle.toFixed(1)}deg)">` +
    `${escapeHtml(name)}</span>`
  return L.marker([lat, lng], {
    ...INERT,
    keyboard: false,
    pane: LABEL_PANE,
    icon: L.divIcon({ html, className: 'water-label-anchor', iconSize: [0, 0] })
  })
}

/**
 * Keeps a map's water drawn, redrawn whenever the grid or the water data
 * changes (another game loaded over this one), with its names shown or
 * hidden as the map zooms.
 * @returns {{attach: Function}} `attach(map)` draws the water on a map, once
 *   the map exists
 */
export function useWaterLayer() {
  const gridStore = useGridStore()
  const waterStore = useWaterStore()
  let map = null
  let water = null
  // Every name, with the zoom it shows from; each is on the map or not
  let labels = []

  /** Puts on the map the names its zoom shows, and takes off the rest */
  function showLabels() {
    if (!map) return
    const zoom = map.getZoom()
    labels.forEach(({ marker, label }) => {
      const show = isLabelShown(label, zoom)
      if (show && !map.hasLayer(marker)) marker.addTo(map)
      else if (!show && map.hasLayer(marker)) marker.remove()
    })
  }

  /** Takes down the water drawn last, if any, and draws the grid's */
  function redraw() {
    water?.remove()
    labels.forEach(({ marker }) => marker.remove())
    water = null
    labels = []
    if (!map) return
    const grid = gridStore.grid
    const data = waterStore.data
    if (isEmptyGrid(grid) || !data) return

    ;[
      [WATER_PANE, WATER_PANE_Z_INDEX],
      [LABEL_PANE, LABEL_PANE_Z_INDEX]
    ].forEach(([name, zIndex]) => {
      if (!map.getPane(name)) map.createPane(name).style.zIndex = zIndex
    })

    const bounds = gridBounds(grid)
    const lakes = clipFeatures(featuresIn(data, 'lakes', bounds), bounds)
    const sea = clipFeatures(featuresIn(data, 'sea', bounds), bounds)
    const rivers = clipFeatures(featuresIn(data, 'rivers', bounds), bounds)

    water = L.layerGroup([
      L.geoJSON([...sea, ...lakes], { ...INERT, pane: WATER_PANE, style: AREA_STYLE }),
      L.geoJSON(rivers, {
        ...INERT,
        pane: WATER_PANE,
        style: ({ properties }) => ({
          color: WATER_COLOR,
          weight: riverWeight(properties.rank),
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round'
        })
      })
    ]).addTo(map)

    labels = [
      ...riverLabelPlaces(rivers).map((place) => ({ place, kind: 'river' })),
      ...areaLabelPlaces(lakes, featuresIn(data, 'bays', bounds)).map((place) => ({
        place,
        kind: 'area'
      }))
    ].map(({ place, kind }) => ({ marker: labelMarker(place, kind), label: place.label }))
    showLabels()
  }

  watch([() => gridStore.grid, () => waterStore.data], redraw)

  /** @param {Object} leafletMap - The map to draw on */
  function attach(leafletMap) {
    map = leafletMap
    map.on('zoomend', showLabels)
    redraw()
  }

  return { attach }
}
