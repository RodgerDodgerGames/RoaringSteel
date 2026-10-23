/**
 * Build Rules (buildRules.js)
 *
 * Where track may not be laid, and why. The build composable asks these
 * questions of every leg as it is placed, and of the whole line again when
 * it is finished, so a section that breaks a rule is never built.
 *
 * The rule here: track stays inside the region being played — the state the
 * game is set in. The map grays out everything outside it (see
 * regionMask.js), and no track may go into the gray. The one exception is the
 * grid cell a town sits in: a town is placed at the middle of its metro area,
 * and a metro area that spans a state line can have its middle just over it.
 * Such a town can still be built to, up to the edge of its cell.
 *
 * And track may bridge water, but only so far: a crossing of more water
 * cells in a row than the longest bridge allowed cannot be built (see
 * water.js and `gameRules.bridges`). A bridge has to reach land, so a
 * finished line may not end on water — or a long crossing could be built
 * as two short ones, the second starting where the first stopped midstream.
 * A line ending at a town is the exception: a town on the shore can have
 * its cell counted as water.
 *
 * Last, track may cross track already built — anyone's, the builder's own
 * included, and earlier legs of the same line — but not run alongside it
 * (see `gameRules.trackSpacing`): a line may only come close to track for a
 * short stretch, as it does when it crosses. Inside towns' cells this is
 * waived, since every player builds into the same cities and their lines
 * bunch up there.
 *
 * A line is checked at the same points its price is worked out from (see
 * trackCost.js), a quarter of a cell apart, so a leg can slip across a narrow
 * neck of gray, or skirt the edge of another line's band, by up to that much
 * between two of them unnoticed.
 *
 * Pure functions over plain data, so the rules can be tested without a map.
 *
 * @module composables/map/buildRules
 */

import { gameRules } from '@/config/game'
import {
  findCell,
  pointsAlongLine,
  cellPath,
  cellBounds,
  kmBetween
} from '@/composables/map/trackCost'
import {
  latitudeDegreesToMeters,
  longitudeDegreesToMeters,
  metersToLatitudeDegrees,
  metersToLongitudeDegrees
} from '@/composables/setup/useMapSupport'
import { isWaterCell, longestCrossing, MAX_BRIDGE_KM } from '@/composables/map/water'

/**
 * Whether a point lies inside a grid cell.
 * @param {{lat: number, lng: number}} point - The point
 * @param {Object} cell - Grid cell with a `centroid`
 * @returns {boolean} True if the point is in the cell
 */
function isInCell({ lat, lng }, cell) {
  const { south, west, north, east } = cellBounds(cell)
  return lat >= south && lat <= north && lng >= west && lng <= east
}

/**
 * The grid cells the towns sit in. Track may go into these even where they
 * reach outside the region.
 * @param {Array<Object>} towns - Towns, each with lat and lon
 * @param {Array<Object>} grid - Grid cells
 * @returns {Array<Object>} The cells, each once
 */
export function townCells(towns, grid) {
  const cells = towns.map((town) => findCell({ lat: town.lat, lng: town.lon }, grid))
  return [...new Set(cells.filter(Boolean))]
}

/**
 * Every straight leg of the track built so far, as pairs of points.
 * @param {Array<Object>} segments - Every section built, each with its
 *   `coordinates` (see the track store)
 * @returns {Array<Array<{lat: number, lng: number}>>} [from, to] per leg
 */
export function builtLegs(segments) {
  return segments.flatMap(({ coordinates }) =>
    coordinates.slice(1).map((to, i) => [coordinates[i], to])
  )
}

/**
 * How far a point is from the nearest of some legs of track, in km.
 * @param {{lat: number, lng: number}} point - The point
 * @param {Array<Array<Object>>} legs - Legs, as [from, to] pairs
 * @returns {number} Kilometers; Infinity when there are no legs
 */
function kmToTrack(point, legs) {
  // Each leg is measured on a flat projection centered on the point
  const toKm = ({ lat, lng }) => ({
    x: longitudeDegreesToMeters(lng - point.lng, point.lat) / 1000,
    y: latitudeDegreesToMeters(lat - point.lat) / 1000
  })
  let nearest = Infinity
  legs.forEach(([from, to]) => {
    const a = toKm(from)
    const b = toKm(to)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSquared = dx * dx + dy * dy
    // How far along the leg the point's nearest spot is, from 0 to 1
    const t = lengthSquared ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengthSquared)) : 0
    nearest = Math.min(nearest, Math.hypot(a.x + t * dx, a.y + t * dy))
  })
  return nearest
}

/**
 * The legs of built track that come anywhere near a line: those whose
 * bounding box, widened by `nearKm`, overlaps the line's. Only these can be
 * beside the line, so the rest are left out before any distance is measured.
 * @param {Array<Array<Object>>} legs - Built legs, as [from, to] pairs
 * @param {Array<{lat: number, lng: number}>} points - The line's sample points
 * @param {number} nearKm - How close counts as beside
 * @returns {Array<Array<Object>>} The legs that may be near
 */
function legsNear(legs, points, nearKm) {
  const lats = points.map(({ lat }) => lat)
  const lngs = points.map(({ lng }) => lng)
  const widestLat = Math.max(...lats.map(Math.abs))
  const padLat = metersToLatitudeDegrees(nearKm * 1000)
  const padLng = metersToLongitudeDegrees(nearKm * 1000, widestLat)
  const south = Math.min(...lats) - padLat
  const north = Math.max(...lats) + padLat
  const west = Math.min(...lngs) - padLng
  const east = Math.max(...lngs) + padLng
  return legs.filter(
    ([a, b]) =>
      Math.max(a.lat, b.lat) >= south &&
      Math.min(a.lat, b.lat) <= north &&
      Math.max(a.lng, b.lng) >= west &&
      Math.min(a.lng, b.lng) <= east
  )
}

/**
 * Whether a line runs alongside track for longer than a crossing takes.
 *
 * The line is walked point by point, keeping a running total of the
 * distance it has been beside track — within `nearKm` of it — without a
 * break. A step counts only when the points at both ends of it are beside,
 * so the total is how far the line was beside, not one step more.
 *
 * Each leg is held up against the built track and against the line's own
 * earlier legs, so a line cannot double back along itself either. A bend
 * comes close to the leg before it for a few km, as a crossing does, and
 * that is allowed for the same reason.
 *
 * @param {Array<Array<Object>>} legPoints - Each leg's sample points
 * @param {Array<boolean>} inTown - Per sample point, in order, whether it is
 *   in a town's cell, where being beside track does not count
 * @param {Array<Array<Object>>} builtLegs - Built track, as [from, to] pairs
 * @returns {boolean} True if the line runs alongside track
 */
function runsAlongside(legPoints, inTown, builtLegs) {
  const { nearKm, maxBesideKm } = gameRules.trackSpacing
  const nearby = legsNear(builtLegs, legPoints.flat(), nearKm)
  const ownLegs = legPoints.map((points) => [points[0], points.at(-1)])

  let besideKm = 0
  let previous = null
  let index = 0
  for (const [leg, points] of legPoints.entries()) {
    const track = [...nearby, ...ownLegs.slice(0, leg)]
    for (const point of points) {
      const isBeside = !inTown[index++] && kmToTrack(point, track) <= nearKm
      if (!isBeside) besideKm = 0
      else if (previous?.isBeside) besideKm += kmBetween(previous.point, point)
      if (besideKm > maxBesideKm) return true
      previous = { point, isBeside }
    }
  }
  return false
}

/**
 * Why a line of track may not be built, or null if it may.
 *
 * The rules are checked in turn, and the first one broken is the answer.
 * Ending on water is checked last, so a caller asking about a finished line
 * hears of it only when nothing else is wrong — the cursor's tooltip treats
 * it as a warning, not a refusal, while the line is still being drawn.
 *
 * @param {Array<{lat: number, lng: number}>} latlngs - The line's vertices
 * @param {Object} rules - What the line is checked against
 * @param {Array<Object>} rules.grid - Grid cells
 * @param {Function} rules.isInRegion - Whether a point is inside the region
 *   being played (see `regionTest` in region.js)
 * @param {Array<Object>} rules.townCells - The cells towns sit in (see `townCells`)
 * @param {Array<Array<Object>>} [rules.builtLegs] - The legs of the track
 *   built so far (see `builtLegs`)
 * @param {Object} [options]
 * @param {boolean} [options.isFinished] - True for a finished line, which may
 *   not end on water; a line still being drawn may stop there for now
 * @returns {{reason: 'outside', point: {lat: number, lng: number}}|{reason:
 *   'water'|'alongside'|'endsOnWater'}|null} The rule broken — for the
 *   region, with the first point along the line that breaks it — or null if
 *   the line may be built
 */
export function lineBlock(
  latlngs,
  { grid, isInRegion, townCells, builtLegs = [] },
  { isFinished = false } = {}
) {
  // Each leg's sample points, and whether each point is in a town's cell,
  // worked out once for every rule below
  const legPoints =
    latlngs.length === 1
      ? [[latlngs[0]]]
      : latlngs.slice(1).map((to, i) => pointsAlongLine([latlngs[i], to]))
  const points = legPoints.flat()
  const inTown = points.map((point) => townCells.some((cell) => isInCell(point, cell)))

  const outside = points.findIndex((point, i) => !inTown[i] && !isInRegion(point))
  if (outside !== -1) return { reason: 'outside', point: points[outside] }

  const path = cellPath(latlngs, grid)
  if (longestCrossing(path, townCells) > gameRules.bridges.maxCells) {
    return { reason: 'water' }
  }

  if (runsAlongside(legPoints, inTown, builtLegs)) return { reason: 'alongside' }

  const end = path.at(-1)
  if (isFinished && end && isWaterCell(end) && !townCells.includes(end)) {
    return { reason: 'endsOnWater' }
  }
  return null
}

/**
 * What to tell the player when a line breaks a rule.
 * @param {{reason: string}} block - What `lineBlock` found
 * @param {string} [regionName] - The region's name, e.g. "Maryland"
 * @returns {string} The message
 */
export function blockMessage(block, regionName) {
  switch (block.reason) {
    case 'outside':
      return `Track can't go outside ${regionName || 'the map'}.`
    case 'water':
      return `Too much water to bridge: a bridge can span at most ${MAX_BRIDGE_KM} km.`
    case 'endsOnWater':
      return "Track can't end on water: a bridge has to reach land."
    case 'alongside': {
      const { nearKm } = gameRules.trackSpacing
      return `Track can't run alongside track already built: cross it more squarely, or keep ${nearKm} km away.`
    }
    default:
      return "Track can't go there."
  }
}
