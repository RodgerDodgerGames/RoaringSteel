/**
 * Bridges (bridges.js)
 *
 * Where a line of track is a bridge, so the map can draw those stretches as
 * bridges rather than as track on the ground (see `styleTracks` in
 * useBuildTrack.js, and BRIDGE_DECK_STYLE in trackStyles.js).
 *
 * Track is a bridge in two kinds of place, the same two that are priced as
 * bridges (see `linePrice` in trackCost.js):
 * - over lakes, bays and the sea: every stretch of the line inside water
 *   cells, from where it runs off the land to where it reaches land again;
 * - over rivers: rivers are lines, so a crossing is a single point. The
 *   bridge drawn there is `bridgeStyleConfig.riverBridgeCells` cells long,
 *   centered on the crossing, so it reads as a bridge at the Build view's
 *   zoom rather than as a speck.
 *
 * Stretches that overlap or touch, such as a river crossing just before a
 * lake, are joined into one bridge.
 *
 * Positions along the line are measured as distances from its start, in km,
 * leg by leg. Each leg is straight in latitude and longitude, as the grid's
 * cells are, so a point a share of the way along a leg in km is the same
 * share of the way in degrees.
 *
 * Pure functions over plain data, so they are tested without a map.
 *
 * @module composables/map/bridges
 */

import { bridgeStyleConfig } from '@/config/map'
import { cellAt, cellKm, walkCells } from '@/composables/map/cellGrid'
import { kmBetween } from '@/composables/map/trackCost'
import { isWaterCell, riverCrossings } from '@/composables/map/water'

/**
 * Gaps between two stretches smaller than this, in km, count as touching.
 * Far below a cell, so only stretches that really meet are joined.
 */
const TOUCHING_KM = 1e-6

/**
 * The stretches of a line of track that are bridges, each as its own list
 * of points along the line.
 *
 * @param {Array<{lat: number, lng: number}>} latlngs - The line's vertices
 * @param {Object} grid - The grid (see cellGrid.js)
 * @param {Object|null} [rivers] - The rivers on the board (see `riverIndex`
 *   in water.js), or none
 * @returns {Array<Array<{lat: number, lng: number}>>} Each bridge's points,
 *   from the end nearer the line's start; none for a line on dry land
 */
export function bridgeSpans(latlngs, grid, rivers = null) {
  if (!grid || latlngs.length < 2) return []
  const legs = measureLegs(latlngs)
  const totalKm = legs.at(-1).startKm + legs.at(-1).km

  const halfRiverKm = (bridgeStyleConfig.riverBridgeCells * cellKm(grid)) / 2
  const riverStretches = riverCrossings(latlngs, grid, rivers).map((crossing) => {
    const atKm = distanceAlong(crossing, legs)
    return [Math.max(0, atKm - halfRiverKm), Math.min(totalKm, atKm + halfRiverKm)]
  })

  return joined([...waterStretches(legs, grid), ...riverStretches]).map(([fromKm, toKm]) =>
    pointsBetween(legs, fromKm, toKm)
  )
}

/**
 * Each leg of a line, with where it starts along the line and how long it is.
 * @param {Array<{lat: number, lng: number}>} latlngs - The line's vertices
 * @returns {Array<{from: Object, to: Object, startKm: number, km: number}>}
 *   The legs, in order
 */
function measureLegs(latlngs) {
  let startKm = 0
  return latlngs.slice(1).map((to, i) => {
    const from = latlngs[i]
    const km = kmBetween(from, to)
    const leg = { from, to, startKm, km }
    startKm += km
    return leg
  })
}

/**
 * Every stretch of the line inside lake, bay or sea cells, as [from, to]
 * distances along the line in km. Each leg is walked cell by cell (see
 * `walkCells`), which tells where along it each cell begins; a cell runs to
 * where the next begins, or to the leg's end. Holes and ground off the grid
 * are not water.
 * @param {Array<Object>} legs - From `measureLegs`
 * @param {Object} grid - The grid
 * @returns {Array<Array<number>>} The stretches, in order along the line
 */
function waterStretches(legs, grid) {
  const stretches = []
  legs.forEach(({ from, to, startKm, km }) => {
    const entries = []
    walkCells(from, to, grid, (row, col, t) => entries.push({ cell: cellAt(grid, row, col), t }))
    entries.forEach(({ cell, t }, i) => {
      if (cell === -1 || !isWaterCell(grid, cell)) return
      const endT = i + 1 < entries.length ? entries[i + 1].t : 1
      stretches.push([startKm + t * km, startKm + endT * km])
    })
  })
  return stretches
}

/**
 * How far along the line a point on it is, in km: measured on the leg the
 * point lies nearest to, so a point a hair off the line, as a computed
 * crossing can be, still lands on it.
 * @param {{lat: number, lng: number}} point - A point on the line
 * @param {Array<Object>} legs - From `measureLegs`
 * @returns {number} The distance from the line's start
 */
function distanceAlong(point, legs) {
  let best = { gap: Infinity, km: 0 }
  legs.forEach(({ from, to, startKm, km }) => {
    // Longitude squeezed by latitude, so the degrees on both axes are about
    // the same length on the ground and "nearest" means nearest on the map
    const squeeze = Math.cos((from.lat * Math.PI) / 180)
    const dx = (to.lng - from.lng) * squeeze
    const dy = to.lat - from.lat
    const px = (point.lng - from.lng) * squeeze
    const py = point.lat - from.lat
    const lengthSquared = dx * dx + dy * dy
    const t =
      lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, (px * dx + py * dy) / lengthSquared))
    const gap = Math.hypot(px - t * dx, py - t * dy)
    if (gap < best.gap) best = { gap, km: startKm + t * km }
  })
  return best.km
}

/**
 * Stretches with any that overlap or touch joined together.
 * @param {Array<Array<number>>} stretches - [from, to] pairs, in any order
 * @returns {Array<Array<number>>} The joined stretches, in order along the line
 */
function joined(stretches) {
  const sorted = [...stretches].sort((a, b) => a[0] - b[0])
  const result = []
  sorted.forEach(([from, to]) => {
    const last = result.at(-1)
    if (last && from <= last[1] + TOUCHING_KM) last[1] = Math.max(last[1], to)
    else result.push([from, to])
  })
  return result
}

/**
 * The points of the line from one distance along it to another: a point at
 * each end, and every vertex the line bends at between them.
 * @param {Array<Object>} legs - From `measureLegs`
 * @param {number} fromKm - Where the stretch starts along the line
 * @param {number} toKm - Where it ends
 * @returns {Array<{lat: number, lng: number}>} The stretch's points
 */
function pointsBetween(legs, fromKm, toKm) {
  const bends = legs
    .slice(1)
    .map((leg) => ({ km: leg.startKm, point: leg.from }))
    .filter(({ km }) => km > fromKm && km < toKm)
    .map(({ point }) => ({ lat: point.lat, lng: point.lng }))
  return [pointAt(legs, fromKm), ...bends, pointAt(legs, toKm)]
}

/**
 * The point a distance along the line.
 * @param {Array<Object>} legs - From `measureLegs`
 * @param {number} atKm - The distance from the line's start
 * @returns {{lat: number, lng: number}} The point
 */
function pointAt(legs, atKm) {
  const leg = legs.find(({ startKm, km }) => atKm <= startKm + km) ?? legs.at(-1)
  const t = leg.km === 0 ? 0 : Math.min(1, Math.max(0, (atKm - leg.startKm) / leg.km))
  return {
    lat: leg.from.lat + t * (leg.to.lat - leg.from.lat),
    lng: leg.from.lng + t * (leg.to.lng - leg.from.lng)
  }
}
