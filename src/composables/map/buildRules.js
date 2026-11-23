/**
 * Build Rules (buildRules.js)
 *
 * Where track may not be laid, and why. The build composable asks these
 * questions of every leg as it is placed, and of the whole line again when
 * it is finished, so a section that breaks a rule is never built.
 *
 * The rule here: track stays inside the region being played — the state the
 * game is set in. The map grays out the land outside it (see regionMask.js),
 * and no track may go onto that land. There are two exceptions:
 * - the grid cell a town sits in: a town is placed at the middle of its
 *   metro area, and a metro area that spans a state line can have its middle
 *   just over it. Such a town can still be built to, up to the edge of its
 *   cell.
 * - water: the region's outline follows its shore, so a bay or an inlet is
 *   outside it, and track may bridge across one there. A bridge still has
 *   to land on the region's own land (or a town), since land outside stays
 *   off limits.
 *
 * And track may bridge water, but only so far: a crossing of more lake or
 * sea cells in a row than the longest bridge allowed cannot be built (see
 * water.js and `gameRules.bridges`). A bridge has to reach land, so a
 * finished line may not end on water — or a long crossing could be built
 * as two short ones, the second starting where the first stopped midstream.
 * A line ending at a town is the exception: a town on the shore can have
 * its cell counted as water. (Rivers are lines, not water cells, and are
 * never too wide to bridge.)
 *
 * Track may cross track already built, but not run alongside it: a line may
 * only come close to track for a short stretch, as it does when it crosses.
 * How close, and for how long, depends on whose track it is:
 * - the builder's own track, and the earlier legs of the same line: within
 *   half a cell, for no more than a couple of cells (see
 *   `gameRules.trackSpacing`) — enough to stop a line doubling back along
 *   itself or weaving along another of the builder's lines;
 * - other players' track: a good deal further off — a speed unit — and it
 *   may only be crossed nearly square on (see `gameRules.rivalTrackSpacing`).
 *   This is what makes building early in a good corridor pay: whoever is
 *   there first takes the way, and the players who come later go round. A
 *   finished section may not end beside other players' track either: a line
 *   could otherwise be laid alongside it a section at a time, each section
 *   only as long as a crossing, the way a bridge too long to build could be
 *   built as two short ones if a line could end on water. Near towns, every
 *   player still has to be able to build in, so within a speed unit of a
 *   town the distance and the stretch are halved.
 * Inside towns' cells spacing is waived altogether, since every player
 * builds into the same cities and their lines bunch up there.
 *
 * And with the game setting that limits how many players may build into a
 * town on, a town that is full is closed to the players not already in it:
 * their track may not go into its grid cell at all, not even to pass
 * through without joining it (see townLimits.js). Which towns are closed
 * depends on who is building, so the track builder works them out for the
 * player whose turn it is (`closedCells`, see trackBuilder.js).
 *
 * Where a line goes is checked at points a quarter of a cell apart (see
 * `pointsAlongLine` in trackCost.js), so a leg can slip across a narrow neck
 * of gray, or skirt the edge of another line's band, by up to that much
 * between two of them unnoticed. Which cells it crosses, for the water rules,
 * is found exactly, the same way its price is (see `cellPath`).
 *
 * Cells are named by their index in the grid (see cellGrid.js).
 *
 * Pure functions over plain data, so the rules can be tested without a map.
 *
 * @module composables/map/buildRules
 */

import { gameRules } from '@/config/game'
import { boardConfig } from '@/config/board'
import { pointsAlongLine, cellPath, kmBetween, trackPriceScale } from '@/composables/map/trackCost'
import {
  findCell,
  cellContaining,
  cellCenter,
  cellKm,
  isEmptyGrid
} from '@/composables/map/cellGrid'
import { riversFor } from '@/composables/map/waterData'
import { regionTest } from '@/composables/map/region'
import {
  latitudeDegreesToMeters,
  longitudeDegreesToMeters,
  metersToLatitudeDegrees,
  metersToLongitudeDegrees
} from '@/composables/setup/useMapSupport'
import { isWaterCell, longestCrossing, maxBridgeCells } from '@/composables/map/water'
import { townFullMessage } from '@/composables/townLimits'

/**
 * The grid cell a town sits in: the cell its point is in, or for a town just
 * off the grid the nearest cell (see `findCell`).
 * @param {Object} town - A town, with lat and lon
 * @param {Object} grid - The grid
 * @returns {number} The cell, or -1 on an empty grid
 */
function townCell(town, grid) {
  return findCell({ lat: town.lat, lng: town.lon }, grid)
}

/**
 * The grid cells the towns sit in. Track may go into these even where they
 * reach outside the region.
 * @param {Array<Object>} towns - Towns, each with lat and lon
 * @param {Object} grid - The grid
 * @returns {Array<number>} The cells, each once
 */
export function townCells(towns, grid) {
  const cells = towns.map((town) => townCell(town, grid))
  return [...new Set(cells.filter((cell) => cell !== -1))]
}

/**
 * The grid cells of the towns closed to a player (see `closedTowns` in
 * townLimits.js), each with the town it is closed for, so a line can be
 * checked cell by cell and the player told which town stopped it. Each town
 * is in the same cell `townCells` gives it (see `townCell`).
 * @param {Array<{town: Object}>} closed - The closed towns, from `closedTowns`
 * @param {Object} grid - The grid
 * @returns {Map<number, Object>} Each closed town's entry, by its cell
 */
export function closedCells(closed, grid) {
  const cells = new Map()
  closed.forEach((entry) => {
    const cell = townCell(entry.town, grid)
    if (cell !== -1) cells.set(cell, entry)
  })
  return cells
}

/** No town closed */
const NONE_CLOSED = new Map()

/**
 * What track on a board is priced against: the grid, what a point of its
 * terrain cost comes to in dollars (see `trackPriceScale`), the board's
 * speed unit, which bridges are priced and measured in, the rivers on the
 * board (see waterData.js), and the cells the towns sit in.
 *
 * Shared by the track builder, which prices the lines players build (see
 * `boardRules` in trackBuilder.js), and the demand deck, which prices the
 * hauls payoffs are set by (see payoffs.js), so the two always price track
 * the same way.
 *
 * An empty grid has no cells to price, and no cell size to price them by:
 * it gets a price scale of 0, no rivers and no town cells.
 * @param {Object|null} grid - The grid (see cellGrid.js)
 * @param {number} speedUnitKm - The board's speed unit (see boardScale.js)
 * @param {Object|null} waterData - The water data (see stores/water.js)
 * @param {Array<Object>} towns - The towns, each with lat and lon
 * @returns {{grid: Object|null, priceScale: number, speedUnitKm: number,
 *   rivers: Object|null, townCells: Array<number>}} The board
 */
export function pricingBoard(grid, speedUnitKm, waterData, towns) {
  if (isEmptyGrid(grid)) return { grid, priceScale: 0, speedUnitKm, rivers: null, townCells: [] }
  return {
    grid,
    priceScale: trackPriceScale(grid, speedUnitKm),
    speedUnitKm,
    rivers: riversFor(grid, waterData),
    townCells: townCells(towns, grid)
  }
}

/**
 * What every line on a board with no track yet is judged against: what
 * track is priced against (see `pricingBoard`) and whether a point is in
 * the region being played (see `regionTest` in region.js).
 *
 * Shared by the track builder, which adds the track built so far (see
 * `boardRules` in trackBuilder.js), the demand deck, which searches routes
 * on a coarse copy of the grid (see `deckPricer` in payoffs.js), and setup,
 * which leaves off the board any town track cannot reach (see
 * reachableTowns.js), so all of them hold track to the same rules.
 *
 * @param {Object|null} grid - The grid (see cellGrid.js)
 * @param {number} speedUnitKm - The board's speed unit (see boardScale.js)
 * @param {Object|null} waterData - The water data (see stores/water.js)
 * @param {Array<Object>} towns - The towns, each with lat and lon
 * @param {Object|null} region - The region being played, GeoJSON
 * @returns {Object} The board's pricing parts and `isInRegion`
 */
export function boardRulesFor(grid, speedUnitKm, waterData, towns, region) {
  return {
    ...pricingBoard(grid, speedUnitKm, waterData, towns),
    isInRegion: regionTest(region)
  }
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
 * The size, in km, of the squares built track is sorted into by
 * `trackIndex`. Bigger than the spacing distance, so a point's
 * neighborhood is only ever a few squares, and small enough that each square
 * holds only the track close by.
 */
const TRACK_SQUARE_KM = 20

/**
 * Built track, sorted by where it is, so the legs near a point can be found
 * without measuring the distance to every leg on the map.
 *
 * The map is cut into squares `TRACK_SQUARE_KM` tall (and as many degrees
 * wide as tall, so narrower in km away from the equator, which only means a
 * few more of them to look in). Each leg is filed under every square its
 * bounding box touches. A long leg is filed under many, a short one under
 * one or two.
 *
 * The rules ask about every point of a line as it is drawn, so the index is
 * built once each time the track changes (see trackBuilder.js), not on every
 * move of the cursor.
 *
 * @param {Array<Array<Object>>} legs - Built legs, as [from, to] pairs (see
 *   `builtLegs`)
 * @returns {{legs: Array<Array<Object>>, near: Function}} Every leg, and
 *   `near(point, km)`: the legs that may be within that distance of a point,
 *   each once. It can list a leg that is further off; it never leaves out one
 *   that is near.
 */
export function trackIndex(legs) {
  const size = metersToLatitudeDegrees(TRACK_SQUARE_KM * 1000)
  const squares = new Map()
  const keyOf = (row, col) => `${row},${col}`

  legs.forEach((leg) => {
    const [a, b] = leg
    const top = Math.floor(Math.max(a.lat, b.lat) / size)
    const right = Math.floor(Math.max(a.lng, b.lng) / size)
    for (let row = Math.floor(Math.min(a.lat, b.lat) / size); row <= top; row++) {
      for (let col = Math.floor(Math.min(a.lng, b.lng) / size); col <= right; col++) {
        const key = keyOf(row, col)
        if (!squares.has(key)) squares.set(key, [])
        squares.get(key).push(leg)
      }
    }
  })

  /** The legs filed under every square within `km` of a point */
  function near(point, km) {
    const padLat = metersToLatitudeDegrees(km * 1000)
    const padLng = metersToLongitudeDegrees(km * 1000, point.lat)
    const top = Math.floor((point.lat + padLat) / size)
    const right = Math.floor((point.lng + padLng) / size)
    // A leg that crosses several of the squares looked in is filed under each
    const found = new Set()
    for (let row = Math.floor((point.lat - padLat) / size); row <= top; row++) {
      for (let col = Math.floor((point.lng - padLng) / size); col <= right; col++) {
        squares.get(keyOf(row, col))?.forEach((leg) => found.add(leg))
      }
    }
    return [...found]
  }

  return { legs, near }
}

/** No track built yet */
const NO_TRACK = trackIndex([])

/**
 * How far a point is from the nearest of some legs of track, in km.
 * @param {{lat: number, lng: number}} point - The point
 * @param {Array<Array<Object>>} legs - Legs, as [from, to] pairs
 * @param {number} [count] - Only the first this many legs are measured
 * @returns {number} Kilometers; Infinity when there are no legs
 */
function kmToTrack(point, legs, count = legs.length) {
  // Each leg is measured on a flat projection centered on the point
  const toKm = ({ lat, lng }) => ({
    x: longitudeDegreesToMeters(lng - point.lng, point.lat) / 1000,
    y: latitudeDegreesToMeters(lat - point.lat) / 1000
  })
  let nearest = Infinity
  for (let i = 0; i < count; i++) {
    const [from, to] = legs[i]
    const a = toKm(from)
    const b = toKm(to)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSquared = dx * dx + dy * dy
    // How far along the leg the point's nearest spot is, from 0 to 1
    const t = lengthSquared ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengthSquared)) : 0
    nearest = Math.min(nearest, Math.hypot(a.x + t * dx, a.y + t * dy))
  }
  return nearest
}

/**
 * Whether a line runs alongside the builder's own track for longer than a
 * crossing takes (see `gameRules.trackSpacing`).
 *
 * The line is walked point by point, keeping a running total of the
 * distance it has been beside track — within `nearCells` of a cell of it —
 * without a break. A step counts only when the points at both ends of it are beside,
 * so the total is how far the line was beside, not one step more.
 *
 * Each leg is held up against the builder's track and against the line's
 * own earlier legs, so a line cannot double back along itself either. A
 * bend comes close to the leg before it for a few km, as a crossing does,
 * and that is allowed for the same reason.
 *
 * @param {Array<Array<Object>>} legPoints - Each leg's sample points
 * @param {Array<boolean>} inTown - Per sample point, in order, whether it is
 *   in a town's cell, where being beside track does not count
 * @param {Object} ownTrack - The builder's own track (see `trackIndex`)
 * @param {Object} grid - The grid, whose cells the spacing is counted in
 * @returns {boolean} True if the line runs alongside track
 */
function runsAlongside(legPoints, inTown, ownTrack, grid) {
  const { nearCells, maxBesideCells } = gameRules.trackSpacing
  const nearKm = nearCells * cellKm(grid)
  const maxBesideKm = maxBesideCells * cellKm(grid)
  const ownLegs = legPoints.map((points) => [points[0], points.at(-1)])

  /** Whether a point on leg number `leg` is within the spacing of track */
  const isNearTrack = (point, leg) =>
    kmToTrack(point, ownLegs, leg) <= nearKm ||
    kmToTrack(point, ownTrack.near(point, nearKm)) <= nearKm

  let besideKm = 0
  let previous = null
  let index = 0
  for (const [leg, points] of legPoints.entries()) {
    for (const point of points) {
      const isBeside = !inTown[index++] && isNearTrack(point, leg)
      if (!isBeside) besideKm = 0
      else if (previous?.isBeside) besideKm += kmBetween(previous.point, point)
      if (besideKm > maxBesideKm) return true
      previous = { point, isBeside }
    }
  }
  return false
}

/**
 * How far track has to keep from other players' track on a board, in km
 * (see `gameRules.rivalTrackSpacing`, which gives it in speed units).
 *
 * Shared with the computer players' search (see `searchBoard` in
 * botPathfinder.js), so it keeps to the same distances.
 *
 * @param {number} speedUnitKm - The board's speed unit (see boardScale.js)
 * @returns {{open: {nearKm: number, maxKm: number}, town: {nearKm: number,
 *   maxKm: number}, townWithinKm: number}} The spacing out in the open
 *   (`open`) and near a town (`town`): how close counts as beside
 *   (`nearKm`) and how far a line may be beside at a stretch (`maxKm`); and
 *   how near a town a point has to be for the town's spacing to apply
 *   (`townWithinKm`)
 */
export function rivalSpacing(speedUnitKm) {
  const { nearSpeedUnits, maxBesideSpeedUnits, nearTown } = gameRules.rivalTrackSpacing
  return {
    open: { nearKm: nearSpeedUnits * speedUnitKm, maxKm: maxBesideSpeedUnits * speedUnitKm },
    town: {
      nearKm: nearTown.nearSpeedUnits * speedUnitKm,
      maxKm: nearTown.maxBesideSpeedUnits * speedUnitKm
    },
    townWithinKm: nearTown.withinSpeedUnits * speedUnitKm
  }
}

/**
 * The centers of the cells towns sit in, kept per list of town cells (see
 * `townCells`): a board's rules hold one list for as long as the towns and
 * grid stay the same, and the line being drawn is checked against them on
 * every move of the cursor. Held weakly, so a list no longer in play is let
 * go.
 */
const townCentersByCells = new WeakMap()

/**
 * A test of whether a point is beside other players' track, and which
 * spacing it is judged by there (see `rivalSpacing`): the town's, within
 * reach of a town of any size, or the open country's elsewhere.
 *
 * How near a town a point is gets measured to the center of the grid cell
 * the town sits in, the cells being all the rules hold of the towns. That is
 * within half a cell of the town itself, a small part of a speed unit.
 *
 * Whether a point is near a town is only asked once it is near other
 * players' track, so a line nowhere near any is not measured against every
 * town on the board.
 *
 * @param {Object} rules - See `lineBlock`: `grid`, `speedUnitKm`,
 *   `townCells` and `rivalTrack`
 * @returns {Function} (point) => the spacing it breaks, `{nearKm, maxKm}`,
 *   if it is beside other players' track; null if it is not
 */
function rivalZoneTest({ grid, speedUnitKm, townCells, rivalTrack }) {
  const spacing = rivalSpacing(speedUnitKm)
  // Far enough to find the track for either spacing, whichever is wider
  const reachKm = Math.max(spacing.open.nearKm, spacing.town.nearKm)

  /** Whether a point is near enough a town for the town's spacing */
  const isNearTown = (point) => {
    if (!townCentersByCells.has(townCells)) {
      townCentersByCells.set(
        townCells,
        townCells.map((cell) => cellCenter(grid, cell))
      )
    }
    const centers = townCentersByCells.get(townCells)
    return centers.some((center) => kmBetween(point, center) <= spacing.townWithinKm)
  }

  return (point) => {
    const km = kmToTrack(point, rivalTrack.near(point, reachKm))
    if (km > reachKm) return null
    const zone = isNearTown(point) ? spacing.town : spacing.open
    return km <= zone.nearKm ? zone : null
  }
}

/**
 * Whether a line runs beside other players' track for longer than crossing
 * it takes (see `gameRules.rivalTrackSpacing`).
 *
 * Like `runsAlongside`, the line is walked point by point, keeping a running
 * total of how much it has been beside the track without a break. Each point
 * is judged by the spacing where it is: the town's within reach of a town,
 * the open country's elsewhere. So each step beside the track counts as a
 * share of the limit where it is — a step near a town as twice the share of
 * the same step in the open, the town's limit being half as long — and the
 * line may not use up more than the whole limit in one stretch.
 *
 * The total runs on across a town's edge rather than starting again there:
 * otherwise a line could run beside another player's line for as long as
 * it liked past a string of towns, a fresh allowance at each one. A line
 * heading straight into a town that another player's line runs into can
 * still come in at about 37° to it or steeper.
 *
 * @param {Array<Object>} points - The line's sample points, in order
 * @param {Array<boolean>} inTown - Per point, whether it is in a town's
 *   cell, where being beside track does not count
 * @param {Function} besideZone - From `rivalZoneTest`
 * @returns {boolean} True if the line runs beside other players' track
 */
function runsBesideRival(points, inTown, besideZone) {
  // How much of the limit this stretch beside the track has used, from 0 to 1
  let used = 0
  let previous = null
  for (const [i, point] of points.entries()) {
    const zone = inTown[i] ? null : besideZone(point)
    if (!zone) used = 0
    else if (previous?.zone) used += kmBetween(previous.point, point) / zone.maxKm
    if (used > 1) return true
    previous = { point, zone }
  }
  return false
}

/**
 * The rules about where a finished line may end, as `lineBlock` names them
 * when one is broken, each with the name `endBlockAt` gives the same thing.
 * A line still being drawn may stop where these say a finished one may not,
 * and a line too dear to build whole is cut back to a point where none of
 * them is broken (see `fitLine` in trackBuilder.js).
 */
export const END_BLOCKS = Object.freeze({ endsOnWater: 'water', endsBesideRival: 'rivalTrack' })

/**
 * Why a line that keeps to every other rule may not end at a point, or null
 * if it may. A finished section may not end:
 * - on water (`'water'`), outside a town's cell: a bridge has to reach land;
 * - beside other players' track (`'rivalTrack'`), outside a town's cell (see
 *   the module notes).
 *
 * The place a line too dear to build whole is cut back to has to be one it
 * may end at, so this is asked of each place it might be cut (see
 * `affordableSection` in botPathfinder.js, and `fitLine` in
 * trackBuilder.js). `lineBlock` asks the same of the end of every finished
 * line, judging water by the last cell the line crosses rather than the
 * cell nearest its last point, which is the same cell for any point on the
 * grid.
 *
 * @param {{lat: number, lng: number}} point - Where the line would end
 * @param {Object} rules - See `lineBlock`
 * @returns {'water'|'rivalTrack'|null} What is in the way, or null
 */
export function endBlockAt(point, rules) {
  const { grid, townCells, rivalTrack = NO_TRACK } = rules
  const cell = findCell(point, grid)
  if (townCells.includes(cell)) return null
  if (isWaterCell(grid, cell)) return 'water'
  if (!rivalTrack.legs.length) return null
  const besideZone = rivalZoneTest({ ...rules, rivalTrack })
  return besideZone(point) ? 'rivalTrack' : null
}

/**
 * Whether a point of a line is somewhere track may not go for being outside
 * the region. Outside it, track may only be on water, which may be bridged
 * wherever it is, or in a town's cell, which may reach over the border.
 *
 * The region rule of `lineBlock`, point by point. The computer players'
 * search judges the steps of its lines by it too (see `searchBoard` in
 * botPathfinder.js), so the lines it plans keep to the border as the rule
 * draws it, not only at the centers of the cells they pass through.
 *
 * @param {{lat: number, lng: number}} point - A point along the line (see
 *   `pointsAlongLine`)
 * @param {boolean} inTown - Whether the point is in a town's cell
 * @param {Object} grid - The grid
 * @param {Function} isInRegion - Whether a point is inside the region (see
 *   `regionTest` in region.js)
 * @returns {boolean} True if track may not go there
 */
export function isOutsideRegion(point, inTown, grid, isInRegion) {
  if (inTown) return false
  // Water first: testing a point against the region is the slow part
  const cell = cellContaining(point, grid)
  if (cell !== -1 && isWaterCell(grid, cell)) return false
  return !isInRegion(point)
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
 * @param {Object} rules.grid - The grid
 * @param {number} rules.speedUnitKm - The board's speed unit (see
 *   boardScale.js), which the longest bridge is measured in
 * @param {Function} rules.isInRegion - Whether a point is inside the region
 *   being played (see `regionTest` in region.js)
 * @param {Array<number>} rules.townCells - The cells towns sit in (see `townCells`)
 * @param {Object} [rules.ownTrack] - The track the player building has built
 *   so far (see `trackIndex`); none if left out
 * @param {Object} [rules.rivalTrack] - The track every other player has
 *   built so far (see `trackIndex`); none if left out
 * @param {Map<number, Object>} [rules.closedCells] - The cells of the towns
 *   closed to the player building (see `closedCells`); none if left out
 * @param {Object} [options]
 * @param {boolean} [options.isFinished] - True for a finished line, which may
 *   not end on water or beside other players' track; a line still being
 *   drawn may stop there for now
 * @returns {{reason: 'outside', point: {lat: number, lng: number}}|{reason:
 *   'townFull', closed: Object}|{reason: 'water'|'alongside'|'besideRival'|
 *   'endsOnWater'|'endsBesideRival'}|null}
 *   The rule broken — for the region, with the first point along the line
 *   that breaks it; for a full town, with the first such town along the line
 *   (its entry from `closedTowns`) — or null if the line may be built
 */
export function lineBlock(
  latlngs,
  {
    grid,
    speedUnitKm,
    isInRegion,
    townCells,
    ownTrack = NO_TRACK,
    rivalTrack = NO_TRACK,
    closedCells = NONE_CLOSED
  },
  { isFinished = false } = {}
) {
  // Each leg's sample points, and whether each point is in a town's cell,
  // worked out once for every rule below
  const legPoints =
    latlngs.length === 1
      ? [[latlngs[0]]]
      : latlngs.slice(1).map((to, i) => pointsAlongLine([latlngs[i], to], grid))
  const points = legPoints.flat()
  const towns = new Set(townCells)
  const inTown = points.map((point) => towns.has(cellContaining(point, grid)))

  const outside = points.findIndex((point, i) =>
    isOutsideRegion(point, inTown[i], grid, isInRegion)
  )
  if (outside !== -1) return { reason: 'outside', point: points[outside] }

  // Every cell the line crosses, found exactly, so even a corner clipped off
  // a full town's cell counts as going into it
  const path = cellPath(latlngs, grid)
  const full = path.find((cell) => closedCells.has(cell))
  if (full !== undefined) return { reason: 'townFull', closed: closedCells.get(full) }

  if (longestCrossing(path, grid, townCells) > maxBridgeCells(grid, speedUnitKm)) {
    return { reason: 'water' }
  }

  if (runsAlongside(legPoints, inTown, ownTrack, grid)) return { reason: 'alongside' }

  // Only made when there is other players' track to keep from
  const besideZone =
    rivalTrack.legs.length && rivalZoneTest({ grid, speedUnitKm, townCells, rivalTrack })
  if (besideZone && runsBesideRival(points, inTown, besideZone)) {
    return { reason: 'besideRival' }
  }

  if (!isFinished) return null
  const end = path.at(-1)
  if (end !== undefined && isWaterCell(grid, end) && !towns.has(end)) {
    return { reason: 'endsOnWater' }
  }
  if (besideZone && !inTown.at(-1) && besideZone(latlngs.at(-1))) {
    return { reason: 'endsBesideRival' }
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
      return `Track can't go onto land outside ${regionName || 'the map'}.`
    case 'water': {
      // In the units a train's speed is in: the player never sees km
      const { referenceSpeed } = boardConfig
      return (
        `Too much water to bridge: a bridge can span at most ${gameRules.bridges.maxSpeedUnits}` +
        ` (a speed ${referenceSpeed} train runs ${referenceSpeed} a turn).`
      )
    }
    case 'endsOnWater':
      return "Track can't end on water: a bridge has to reach land."
    case 'townFull':
      return townFullMessage(block.closed)
    case 'alongside':
      return "Track can't run alongside your own track: cross it more squarely, or keep further away."
    case 'besideRival':
      return "Track has to keep clear of other players' track: cross it nearly square on, or keep further away."
    case 'endsBesideRival':
      return "Track can't stop beside another player's track: carry on across it, or stop further away."
    default:
      return "Track can't go there."
  }
}
