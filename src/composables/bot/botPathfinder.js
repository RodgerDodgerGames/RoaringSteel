/**
 * Bot Pathfinder (botPathfinder.js)
 *
 * How a computer player lays out a line of track. A person draws track by
 * clicking points on the map; a computer player has to work out where those
 * points go. It does that on the grid the board is priced on: the line runs
 * from grid cell to neighboring grid cell (sideways or diagonally), through
 * each cell's center, and the search finds the cheapest such way from where
 * the player may start building to where they want track to reach.
 *
 * The search knows the build rules only roughly — enough that the lines it
 * finds are nearly always buildable:
 * - it stays in cells inside the region, or a town's cell, or water, which
 *   may be bridged beyond the region's border (see buildRules.js), and
 *   takes no step from one cell to the next that would cut across land
 *   outside the region on the way — judged at the very points along the
 *   step that the build rules judge a line at, so a line never clips the
 *   border where it wanders between the centers of the cells along it;
 * - it counts lake and sea cells in a row and never bridges more than the
 *   rules allow, and prices each bridge cell as pricing does (see water.js);
 * - it adds a river bridge for each step from cell to cell that crosses a
 *   river, as pricing does;
 * - it prices each cell with the line's climb into it from the cell it came
 *   from, as pricing does (see climb.js), so it winds up valleys rather than
 *   going straight over ridges;
 * - it marks the cells right beside track already built and lets a line pass
 *   through no more than two of them in a row, which is about what crossing
 *   a line takes, so it crosses track rather than running alongside it;
 * - it marks the cells in other players' zones, the much wider distance the
 *   rules keep lines from their track, and only lets a line into them at the
 *   steep angles a crossing needs, so it crosses their track nearly square
 *   on and keeps out of their way otherwise (see `rivalZones`).
 *
 * "Nearly always" is not good enough for a player who must never break the
 * rules, so every line found is then judged by the build rules themselves
 * (`lineBlock`, the same check a person's line gets). A line that breaks
 * one is not built at all, and no other way is looked for: the computer
 * player builds toward something else this turn and tries the town again on
 * a later one (see `buildTrack` in useBot.js). The first computer players
 * are meant to be simple; a search that keeps to the rules is what keeps
 * that from costing them turns.
 *
 * Where the line passes through a town's cell it goes through the town
 * itself rather than the cell's center, so the town joins the network on the
 * way (the network only joins a town that track has a point on — see
 * network.js).
 *
 * The search only goes as far as it has to: told which points it will be
 * asked about, it stops once it has reached them all, and told only one, it
 * heads for it (A*) rather than spreading out evenly in every direction.
 *
 * Cells are named by their index in the grid (see cellGrid.js).
 *
 * Pure functions over plain data, so they can be tested without a map.
 *
 * @module composables/bot/botPathfinder
 */

import { gameRules } from '@/config/game'
import { pointsAlongLine, kmBetween, landCellPrice, cellPath } from '@/composables/map/trackCost'
import { stepGrade } from '@/composables/map/climb'
import { lineBlock, isOutsideRegion, endBlockAt, rivalSpacing } from '@/composables/map/buildRules'
import { regionOutline } from '@/composables/map/region'
import {
  isWaterCell,
  bridgeCellPrice,
  maxBridgeCells,
  riverCrossings
} from '@/composables/map/water'
import {
  cellKm,
  cellAt,
  rowOf,
  colOf,
  findCell,
  cellContaining,
  cellCenter,
  cellIndexes,
  cellNeighbors,
  NEIGHBOR_STEPS,
  reverseStep,
  stepsBetween
} from '@/composables/map/cellGrid'
import {
  latitudeDegreesToMeters,
  longitudeDegreesToMeters
} from '@/composables/setup/useMapSupport'
import { MinHeap } from '@/composables/network'

/**
 * How many cells right beside built track a line may pass through in a row:
 * the build rules' `maxBesideCells` (see `gameRules.trackSpacing`). Two lets
 * a line cross track at any angle (a line drawn between two cell centers has
 * cells beside it on both sides); three in a row is running alongside it.
 */
const MAX_BESIDE_CELLS = gameRules.trackSpacing.maxBesideCells

/**
 * The most water cells in a row the search will plan a bridge over, whatever
 * the rules allow.
 *
 * The search keeps count of the water cells a line has just crossed, so the
 * memory it needs grows with the longest bridge it may plan: on a grid of
 * small cells, the 3 speed units the rules allow can be sixty cells, and a
 * search over a quarter of a million cells with that many counts each would
 * need gigabytes. Six keeps it to a few tens of megabytes. Computer players
 * go round water wider than that — 6 km on a grid of 1 km cells — where a
 * person may bridge it.
 */
const MAX_SEARCH_BRIDGE_CELLS = 6

/**
 * Each grid's river fees per step (see `riverStepCrossings`), with the
 * rivers they were worked out from: they only change when the grid or its
 * rivers do, and every survey a computer player makes needs them.
 */
const riverStepsByGrid = new WeakMap()

/**
 * Per cell and step out of it (see `cellNeighbors`), how many rivers a line
 * from the cell's center to its neighbor's center crosses: what that step
 * pays in river bridges, found as pricing finds them (see `riverCrossings`).
 *
 * Only the cells a river runs through are looked at: a step between two
 * centers lies within its two cells, so it can only cross a river that runs
 * through one of them. Kept per grid (see `riverStepsByGrid`).
 *
 * @param {Object} grid - The grid
 * @param {Object|null} rivers - The rivers (see `riverIndex` in water.js)
 * @returns {Uint8Array} Crossings, at `cell * NEIGHBOR_STEPS + step`
 */
function riverStepCrossings(grid, rivers) {
  const kept = riverStepsByGrid.get(grid)
  if (kept && kept.rivers === rivers) return kept.crossings

  const crossings = new Uint8Array(grid.present.length * NEIGHBOR_STEPS)
  rivers?.byCell.forEach((_, cell) => {
    if (!grid.present[cell]) return
    const center = cellCenter(grid, cell)
    cellNeighbors(grid, cell).forEach(({ index: next, step }) => {
      const count = riverCrossings([center, cellCenter(grid, next)], grid, rivers).length
      if (!count) return
      crossings[cell * NEIGHBOR_STEPS + step] = count
      crossings[next * NEIGHBOR_STEPS + reverseStep(step)] = count
    })
  })
  riverStepsByGrid.set(grid, { rivers, crossings })
  return crossings
}

/**
 * Each grid's cell and step prices (see `stepPrices`), with the settings
 * they were worked out at: they only change when the grid, the board's scale,
 * or the track or bridge prices do, and every survey a computer player makes
 * needs them.
 */
const stepPricesByGrid = new WeakMap()

/**
 * Per cell and step out of it (see `cellNeighbors`), what the step costs in
 * the cell it goes into: the cell's price as land, with the line's climb
 * into it from the cell the step leaves (see `landCellPrice` and
 * `stepGrade`), or a bridge's for water (see `bridgeCellPrice`). Whole
 * dollars, which a Float32 holds exactly far past any cell's price.
 *
 * A cell's price depends on which way the line comes into it, because the
 * climb does, so it is kept per step rather than per cell. The cell a line
 * starts in has no climb, so each cell's price with none is kept too, for
 * the search's starting cells. Worked out for the whole grid once and kept
 * (see `stepPricesByGrid`).
 *
 * @param {Object} grid - The grid
 * @param {number} priceScale - Dollars per point of terrain cost (see
 *   `trackPriceScale`)
 * @param {number} speedUnitKm - The board's speed unit, which bridges are
 *   priced by
 * @returns {{starts: Float32Array, steps: Float32Array}} Per cell, its price
 *   with no climb, and at `cell * NEIGHBOR_STEPS + step`, the step's price
 */
function stepPrices(grid, priceScale, speedUnitKm) {
  // Tests and tuning change the prices in place, so they are part of what the
  // kept prices were worked out at
  const settings = JSON.stringify([
    priceScale,
    speedUnitKm,
    gameRules.trackPrice,
    gameRules.bridges
  ])
  const kept = stepPricesByGrid.get(grid)
  if (kept && kept.settings === settings) return kept

  const bridgeCell = bridgeCellPrice(grid, speedUnitKm)
  const starts = new Float32Array(grid.present.length)
  const steps = new Float32Array(grid.present.length * NEIGHBOR_STEPS)
  for (let index = 0; index < grid.present.length; index++) {
    if (!grid.present[index]) continue
    starts[index] = isWaterCell(grid, index) ? bridgeCell : landCellPrice(grid, index, priceScale)
    cellNeighbors(grid, index).forEach(({ index: next, step }) => {
      steps[index * NEIGHBOR_STEPS + step] = isWaterCell(grid, next)
        ? bridgeCell
        : landCellPrice(grid, next, priceScale, stepGrade(grid, index, next))
    })
  }
  const worked = { settings, starts, steps }
  stepPricesByGrid.set(grid, worked)
  return worked
}

/**
 * What passing through a cell beside built track adds to a line's cost in
 * the search, in points of terrain cost (turned into dollars by the board's
 * price scale, as land cells are, so it keeps its weight against them on
 * every board). Not a real cost: it only makes the search prefer to keep its
 * distance and cross track squarely, which the build rules like.
 */
const BESIDE_PENALTY = 400

/**
 * What every cell adds to a line's cost in the search, on top of its price,
 * in points of terrain cost (scaled like `BESIDE_PENALTY`). Keeps the search
 * from taking a long way round to save a few dollars, and from treating cells
 * with no price (missing terrain data) as free to wander.
 */
const STEP_COST = 50

/**
 * Where the search sees other players' zones (see `rivalZones`): how much
 * nearer it keeps than the build rules, as a share of a cell. The search
 * judges cells by their centers, and the rules judge a line at points a
 * quarter of a cell apart all along it, so the search marks a little more
 * than the rules would — half a cell further from the track, and half a
 * cell less of each town's reach — to keep the lines it finds out of the
 * zones the rules see.
 */
const RIVAL_ZONE_MARGIN_CELLS = 0.5

/**
 * The cells inside other players' zones, the distance a line has to keep
 * from their track (see `gameRules.rivalTrackSpacing`), and how a line may
 * move through them.
 *
 * The build rules count how far a line has been beside other players' track
 * at a stretch. The search cannot keep that count the way it counts water
 * cells and the cells right beside track (see `costField`): a zone is many
 * cells across, so the count would need as many states per cell, and the
 * search's memory grows with every one. Instead it judges each step into a
 * zone cell by its angle to the track, which is what the length of a
 * stretch comes down to:
 * - out in the open, a step has to be at least as steep as a crossing must
 *   be (about 60°, see `gameRules.rivalTrackSpacing`), whichever way it
 *   goes, so a line only goes into a zone to cross straight through it.
 *   Letting a line leave the track at a flatter angle than it came in
 *   would let it zigzag along it — steeply onto it, slanting off, steeply
 *   on again — every step steep enough on its own;
 * - near a town, where lines head in to join it and set off out of it
 *   alongside other players' lines, rather than cross them, a step only has
 *   to be as steep as a line heading straight into a town another player's
 *   line runs into may come in at (about 37°, see `runsBesideRival` in
 *   buildRules.js). A crossing near a town flatter than a crossing in the
 *   open is still refused by the rules, so a line planned like that is not
 *   built (see the module notes) — rare, where the zones are this small;
 * - a step that keeps its distance from the track is never allowed: that is
 *   running along it.
 * The angle is taken from the cell a step leaves, when that is in a zone
 * too, and from the cell it lands in otherwise: the track near the cell a
 * line is already in is the track it is crossing. And in the open, a line
 * may not turn inside a zone (see `mayStepInZone` in `costField`).
 *
 * The search is the computer players' only judge of where track goes before
 * the rules see the line (see the module notes), so it marks a little more
 * than the rules would (see `RIVAL_ZONE_MARGIN_CELLS`); the rules still
 * judge every line before it is built.
 *
 * Each straight leg of other players' track is measured from the center of
 * every cell within reach of it, to the nearest point along the leg. The
 * cells towns sit in are never in a zone: spacing does not count there.
 *
 * @param {Object} rules - See `searchBoard`
 * @param {Uint8Array} isTownCell - Per cell, 1 for a town's cell
 * @returns {{zone: Uint8Array, awayX: Float32Array, awayY: Float32Array,
 *   minSin: Array<number>, kmPerLat: number, kmPerLng: number}|null} Per
 *   cell, `zone`: 0 outside every zone, 1 in a zone in the open, 2 in a zone
 *   near a town; `awayX` and `awayY`: the way out of the zone (a unit
 *   vector, east and north, in km), straight away from the nearest point of
 *   track; `minSin`: by zone (1 or 2, so its first entry is unused), the
 *   sine of the shallowest angle to the track a step may take there; and
 *   the km in a degree of latitude and of longitude, for measuring steps
 *   the same way. Null when there is no other players' track.
 */
function rivalZones(rules, isTownCell) {
  const { grid, rivalTrack } = rules
  if (!rivalTrack?.legs.length) return null

  const spacing = rivalSpacing(rules.speedUnitKm)
  const size = grid.present.length
  const cell = cellKm(grid)
  const margin = RIVAL_ZONE_MARGIN_CELLS * cell
  // A flat projection over the board, plenty for distances of a few cells
  const midLat = grid.south + (grid.rows * grid.latStep) / 2
  const kmPerLat = latitudeDegreesToMeters(1) / 1000
  const kmPerLng = longitudeDegreesToMeters(1, midLat) / 1000
  const centerX = (index) => (grid.west + (colOf(grid, index) + 0.5) * grid.lngStep) * kmPerLng
  const centerY = (index) => (grid.south + (rowOf(grid, index) + 0.5) * grid.latStep) * kmPerLat

  /**
   * Every cell on the board within `km` of a stretch from one point to
   * another — or of one point, given it twice — or a little further: the
   * cells of the box around it, by index
   */
  const cellsNear = (from, to, km, visit) => {
    const padLat = km / kmPerLat
    const padLng = km / kmPerLng
    const rowAt = (lat) => Math.floor((lat - grid.south) / grid.latStep)
    const colAt = (lng) => Math.floor((lng - grid.west) / grid.lngStep)
    const top = Math.min(grid.rows - 1, rowAt(Math.max(from.lat, to.lat) + padLat))
    const right = Math.min(grid.cols - 1, colAt(Math.max(from.lng, to.lng) + padLng))
    for (let r = Math.max(0, rowAt(Math.min(from.lat, to.lat) - padLat)); r <= top; r++) {
      for (let c = Math.max(0, colAt(Math.min(from.lng, to.lng) - padLng)); c <= right; c++) {
        const index = cellAt(grid, r, c)
        if (index !== -1) visit(index)
      }
    }
  }

  // The cells well inside some town's reach, where the town's spacing applies
  const nearTown = new Uint8Array(size)
  const townKm = spacing.townWithinKm - margin
  rules.townCells.forEach((town) => {
    const x = centerX(town)
    const y = centerY(town)
    const center = cellCenter(grid, town)
    cellsNear(center, center, townKm, (index) => {
      if (Math.hypot(centerX(index) - x, centerY(index) - y) <= townKm) nearTown[index] = 1
    })
  })

  // Per cell, the distance to the nearest point of track found so far, and
  // the way straight out from it
  const nearestKm = new Float32Array(size).fill(Infinity)
  const awayX = new Float32Array(size)
  const awayY = new Float32Array(size)
  const reachKm = Math.max(spacing.open.nearKm, spacing.town.nearKm) + margin
  rivalTrack.legs.forEach(([from, to]) => {
    const fromX = from.lng * kmPerLng
    const fromY = from.lat * kmPerLat
    const legX = to.lng * kmPerLng - fromX
    const legY = to.lat * kmPerLat - fromY
    const lengthSquared = legX * legX + legY * legY
    // Square to the leg, for a cell whose center is right on it, where the
    // way to its nearest point is no guide to which way is out
    const legLength = Math.sqrt(lengthSquared) || 1
    const squareX = -legY / legLength
    const squareY = legX / legLength

    cellsNear(from, to, reachKm, (index) => {
      if (isTownCell[index]) return
      // From the nearest point along the leg to the cell's center
      const x = centerX(index) - fromX
      const y = centerY(index) - fromY
      const t = lengthSquared ? Math.max(0, Math.min(1, (x * legX + y * legY) / lengthSquared)) : 0
      const dx = x - t * legX
      const dy = y - t * legY
      const km = Math.hypot(dx, dy)
      const zoneKm = (nearTown[index] ? spacing.town : spacing.open).nearKm + margin
      if (km > zoneKm || km >= nearestKm[index]) return
      nearestKm[index] = km
      if (km > cell / 4) {
        awayX[index] = dx / km
        awayY[index] = dy / km
      } else {
        // Either side of the leg is out: square to it, either way
        awayX[index] = squareX
        awayY[index] = squareY
      }
    })
  })

  const zone = new Uint8Array(size)
  for (let index = 0; index < size; index++) {
    if (nearestKm[index] !== Infinity) zone[index] = nearTown[index] ? 2 : 1
  }

  // The shallowest angles allowed, as sines. In the open, a crossing's:
  // beside the track for 2 × near / sin, at most the longest stretch. Near a
  // town, a straight run into one on another player's line: beside it from
  // near / sin out, the part outside the town's reach counted against the
  // open limit and the rest against the town's (see `runsBesideRival`),
  // using no more than the whole limit between them —
  //   (open near / sin − reach) / open max + (town near / sin) / town max = 1
  const { open, town, townWithinKm } = spacing
  const minSin = [
    0,
    Math.min(1, (2 * open.nearKm) / open.maxKm),
    Math.min(
      1,
      (open.nearKm / open.maxKm + town.nearKm / town.maxKm) / (1 + townWithinKm / open.maxKm)
    )
  ]

  return { zone, awayX, awayY, minSin, kmPerLat, kmPerLng }
}

/**
 * Which cells of a grid are inside the region, kept per grid: worked out
 * once and reused by every search on that grid. Testing a cell's center
 * against the state's outline is slow — thousands of the outline's points
 * per cell — and a grid of a quarter of a million cells took seconds to test
 * on every search. Held weakly, so a grid no longer in play is let go.
 * Each entry remembers the region test it was made with, and is made again
 * if the test is a different one (another region on the same grid).
 * @type {WeakMap<Object, {isInRegion: Function, inside: Uint8Array}>}
 */
const regionMasks = new WeakMap()

/**
 * Per cell of a grid, 1 if its center is inside the region (see
 * `regionMasks`).
 * @param {Object} grid - The grid
 * @param {Function} isInRegion - The region test (see region.js)
 * @returns {Uint8Array} The mask
 */
function regionMask(grid, isInRegion) {
  const kept = regionMasks.get(grid)
  if (kept?.isInRegion === isInRegion) return kept.inside
  const inside = new Uint8Array(grid.present.length)
  cellIndexes(grid).forEach((index) => {
    inside[index] = isInRegion(cellCenter(grid, index)) ? 1 : 0
  })
  regionMasks.set(grid, { isInRegion, inside })
  return inside
}

/**
 * The town in each town's grid cell, as a track point, so a line passing
 * through the cell can go through the town itself and join it to the network
 * on the way (the network only joins a town that track has a point on — see
 * network.js). Where two towns share a cell, the first one listed has it.
 * @param {Array<Object>} towns - Every town, each with lat and lon
 * @param {Object} grid - The grid
 * @returns {Map<number, {lat: number, lng: number}>} The town's point, by cell
 */
export function townsByCell(towns, grid) {
  const townIn = new Map()
  towns.forEach((town) => {
    const index = findCell({ lat: town.lat, lng: town.lon }, grid)
    if (index === -1 || townIn.has(index)) return
    townIn.set(index, { lat: town.lat, lng: town.lon })
  })
  return townIn
}

/**
 * Each grid's verdicts on which steps leave the region (see
 * `borderSteps`), with what they were worked out from: they only change
 * when the grid, the region, or the towns do, and every survey a computer
 * player makes needs them.
 */
const borderStepsByGrid = new WeakMap()

/**
 * How near to nothing the side a point is on (see `legsMeet`) may come and
 * still count as on the line, in squared degrees: far above the rounding
 * error of working it out, far below any real distance on the map (a meter
 * is about a hundred-thousandth of a degree).
 */
const ON_LINE = 1e-14

/** A step's verdict (see `borderSteps`): not worked out yet */
const UNJUDGED = 0
/** A step's verdict: it keeps to the region */
const STAYS = 1
/** A step's verdict: it cuts across land outside the region */
const LEAVES = 2

/**
 * Whether two straight legs meet, on the flat lat/lng plane the region is
 * tested on. Legs that only touch, or lie along each other, count as
 * meeting: the answer only decides whether a step is worth judging point by
 * point (see `borderSteps`), so erring toward yes is never wrong.
 * @param {{lat: number, lng: number}} a - One end of the first leg
 * @param {{lat: number, lng: number}} b - Its other end
 * @param {{lat: number, lng: number}} c - One end of the second leg
 * @param {{lat: number, lng: number}} d - Its other end
 * @returns {boolean} True if they meet
 */
function legsMeet(a, b, c, d) {
  // Which side of the line through p and q a point r is on: + left, - right
  const side = (p, q, r) => (q.lng - p.lng) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lng - p.lng)
  const ab = [side(a, b, c), side(a, b, d)]
  const cd = [side(c, d, a), side(c, d, b)]
  // Each leg's ends on opposite sides of the other: a clean crossing
  if (ab[0] * ab[1] < 0 && cd[0] * cd[1] < 0) return true
  // An end on the other leg's line, or as near as rounding can tell:
  // touching, or lying along it, if their boxes overlap
  const touches = [...ab, ...cd].some((value) => Math.abs(value) <= ON_LINE)
  const overlap = (u, v, w, x) =>
    Math.max(u, v) >= Math.min(w, x) && Math.max(w, x) >= Math.min(u, v)
  return touches && overlap(a.lat, b.lat, c.lat, d.lat) && overlap(a.lng, b.lng, c.lng, d.lng)
}

/**
 * Which steps from a cell to its neighbor would cut across land outside the
 * region (see `isOutsideRegion` in buildRules.js), as the build rules judge
 * it: at the points along the step a line is checked at (see
 * `pointsAlongLine`), from the point the line passes through in the cell —
 * the town in a town's cell, the center in any other (see `costField`) — to
 * the point in the next.
 *
 * Testing a point against the region is slow on a long, ragged coastline
 * (marking every cell in or out takes seconds, see `regionMask`), so as few
 * steps as can be are tested point by point:
 * - A step from one cell to its neighbor stays within the two (and, cutting
 *   a corner, the two beside it). A cell the border does not pass through
 *   is wholly inside the region or wholly outside it, where the search only
 *   goes on water or in a town's cell. So only steps in cells the border
 *   passes through can leave the region.
 * - Outside the region, track may go on water and in a town's cell, so a
 *   step among only water and town cells never leaves it.
 * - A step that crosses none of the border's edges in its cells is wholly
 *   on one side of the border, the side its start is on: inside the
 *   region, it stays in; outside, it leaves it if any of its points is on
 *   land outside a town's cell.
 * Only a step that crosses the border is tested point by point. Each is
 * worked out the first time the search asks about it, and kept for every
 * later search (see `borderStepsByGrid`).
 *
 * A line ends at the point it was asked for, so the step into its last
 * cell is judged as though it ended on the cell's own point. A computer
 * player's line ends on a town, which is that point — unless two towns
 * share the cell and it is bound for the second (see `townsByCell`). A line
 * ending anywhere but the cell's point could still clip the border on its
 * last step, and is caught by the build rules' own check (see `planLine`).
 *
 * A region test whose border is not known (see `regionOutline`) has every
 * step tested point by point: slower, never wrong.
 *
 * @param {Object} rules - See `searchBoard`
 * @param {Array<Object>} towns - The towns the search goes through (see
 *   `searchBoard`)
 * @param {Map<number, {lat: number, lng: number}>} townIn - The town in each
 *   town cell, from those towns (see `townsByCell`)
 * @returns {Function} (cell, next, step, sides, from) => true if the step
 *   from a cell to its neighbor leaves the region; `sides` are the cells
 *   beside a corner it cuts (see `cellNeighbors`), and `from`, if given, a
 *   point the line starts at in the cell, worked out afresh rather than kept
 */
function borderSteps(rules, towns, townIn) {
  const { grid, isInRegion, townCells } = rules
  let kept = borderStepsByGrid.get(grid)
  if (
    !kept ||
    kept.isInRegion !== isInRegion ||
    kept.townCells !== townCells ||
    kept.towns !== towns
  ) {
    const size = grid.present.length
    const edges = borderEdges(grid, regionOutline(isInRegion))
    // Per cell, 1 if the border passes through it: looked up for every step
    // the search asks about, so kept as flags rather than asked of the map
    const isBorder = new Uint8Array(size).fill(edges ? 0 : 1)
    edges?.forEach((_, cell) => {
      isBorder[cell] = 1
    })
    kept = {
      isInRegion,
      townCells,
      towns,
      townCellSet: new Set(townCells),
      edges,
      isBorder,
      verdicts: new Uint8Array(size * NEIGHBOR_STEPS)
    }
    borderStepsByGrid.set(grid, kept)
  }
  const { townCellSet, edges, isBorder, verdicts } = kept
  const inside = regionMask(grid, isInRegion)
  const isWaterOrTown = (cell) => cell !== -1 && (townCellSet.has(cell) || isWaterCell(grid, cell))

  /** The point a line passes through in a cell */
  const pointIn = (cell) => townIn.get(cell) ?? cellCenter(grid, cell)

  /** Whether a leg leaves the region, tested at every point (see above) */
  const testedLeaves = (from, to) =>
    pointsAlongLine([from, to], grid).some((point) =>
      isOutsideRegion(point, townCellSet.has(cellContaining(point, grid)), grid, isInRegion)
    )

  /**
   * Whether a leg from a point in a cell to the point in its neighbor
   * leaves the region (see above). `isCenter` says the leg starts at the
   * cell's center, which the region mask already places in or out.
   */
  function leaves(from, isCenter, cell, next, sides) {
    if (!isBorder[cell] && !isBorder[next] && !sides.some((side) => isBorder[side])) return false
    const cells = [cell, next, ...sides]
    if (cells.every(isWaterOrTown)) return false
    const to = pointIn(next)
    if (edges === null) return testedLeaves(from, to)
    const crosses = cells.some((each) =>
      (edges.get(each) ?? []).some(([a, b]) => legsMeet(from, to, a, b))
    )
    if (crosses) return testedLeaves(from, to)
    const startsInside = isCenter ? inside[cell] === 1 : isInRegion(from)
    return (
      !startsInside &&
      pointsAlongLine([from, to], grid).some((point) => !isWaterOrTown(cellContaining(point, grid)))
    )
  }

  return (cell, next, step, sides, from) => {
    if (from) return leaves(from, false, cell, next, sides)
    const at = cell * NEIGHBOR_STEPS + step
    if (verdicts[at] === UNJUDGED) {
      const isCenter = !townIn.has(cell)
      verdicts[at] = leaves(pointIn(cell), isCenter, cell, next, sides) ? LEAVES : STAYS
    }
    return verdicts[at] === LEAVES
  }
}

/**
 * The region's border on a grid: for each cell it passes through, the
 * border's edges in that cell (see `borderSteps`).
 * @param {Object} grid - The grid
 * @param {Array<Array<{lat: number, lng: number}>>|null} outline - The
 *   region's rings (see `regionOutline`), or null if not known
 * @returns {Map<number, Array<Array<Object>>>|null} The edges, each as its
 *   two ends, by cell; null for a border not known
 */
function borderEdges(grid, outline) {
  if (!outline) return null
  const byCell = new Map()
  outline.forEach((ring) => {
    ring.slice(1).forEach((to, i) => {
      const edge = [ring[i], to]
      cellPath(edge, grid).forEach((cell) => {
        if (!byCell.has(cell)) byCell.set(cell, [])
        const list = byCell.get(cell)
        if (list.at(-1) !== edge) list.push(edge)
      })
    })
  })
  return byCell
}

/**
 * Everything the search needs to know about the board, worked out once per
 * search: which cells a line may pass through, which are water, which steps
 * cross rivers or leave the region, which cells are right beside track
 * already built, which are in other players' zones, where the towns are, and
 * the least any step of a line can cost.
 *
 * The flags are per cell of the grid's whole rectangle, holes included (a
 * hole is never open), so a cell's index looks its flags up directly.
 *
 * @param {Object} rules - What lines are judged against, as the track builder
 *   holds them (`buildRules` in trackBuilder.js): `grid`, `priceScale` (the
 *   dollars per point of terrain cost, see `trackPriceScale`), `speedUnitKm`,
 *   `rivers`, `isInRegion`, `townCells`, `ownTrack` and `rivalTrack` (the
 *   player building's track and everyone else's, see `trackIndex`), and
 *   `closedCells` (the towns full to the player building, whose cells are
 *   shut to the search like land outside the region — see townLimits.js)
 * @param {Array<Object>} towns - Every town, each with lat and lon
 * @returns {Object} The board, for `costField` and `planLine`
 */
export function searchBoard(rules, towns) {
  const { grid, priceScale } = rules
  const size = grid.present.length
  const townCellSet = new Set(rules.townCells)

  const inside = regionMask(grid, rules.isInRegion)
  const isTownCell = new Uint8Array(size)
  const isOpen = new Uint8Array(size)
  const isWater = new Uint8Array(size)
  cellIndexes(grid).forEach((index) => {
    isTownCell[index] = townCellSet.has(index) ? 1 : 0
    isWater[index] = isWaterCell(grid, index) ? 1 : 0
    // Town cells may be built in even where they reach outside the region,
    // and water may be bridged wherever it is — but a full town's cell may
    // not be built in at all by a player who is not in it
    const isClosed = rules.closedCells?.has(index)
    isOpen[index] = !isClosed && (isTownCell[index] || inside[index] || isWater[index]) ? 1 : 0
  })

  // Cells with a center within the spacing distance of built track. Track is
  // walked at the points the build rules check it at (see `pointsAlongLine`),
  // and the cells around each are measured; a quarter-cell gap between points
  // is allowed for. The rules hold a line to this only against the player's
  // own track; other players' is kept from much further off (see
  // `rivalZones`). Counting it here too costs nothing a crossing of their
  // track at the angle their zones allow would not already keep to, and
  // keeps a line off their track itself.
  const nearKm = gameRules.trackSpacing.nearCells * cellKm(grid)
  const isBeside = new Uint8Array(size)
  const builtLegs = [...(rules.ownTrack?.legs ?? []), ...(rules.rivalTrack?.legs ?? [])]
  builtLegs.forEach((leg) => {
    pointsAlongLine(leg, grid).forEach((point) => {
      const middle = findCell(point, grid)
      if (middle === -1) return
      ;[middle, ...cellNeighbors(grid, middle).map(({ index }) => index)].forEach((index) => {
        if (!isTownCell[index] && kmBetween(point, cellCenter(grid, index)) <= nearKm) {
          isBeside[index] = 1
        }
      })
    })
  })

  // The town in each town cell, so a line through the cell goes through it
  const townIn = townsByCell(towns, grid)

  // What a line costs in the cell it starts in, and in each cell it steps
  // into after, with the climb into it (see `stepPrices`)
  const prices = stepPrices(grid, priceScale, rules.speedUnitKm)
  // The least a step onto any open cell can add, for the A* estimate (see
  // `costField`): the step cost, plus the cheapest step between open cells
  let cheapestStep = Infinity
  for (let index = 0; index < size; index++) {
    if (!isOpen[index]) continue
    cellNeighbors(grid, index).forEach(({ index: next, step }) => {
      if (isOpen[next]) {
        cheapestStep = Math.min(cheapestStep, prices.steps[index * NEIGHBOR_STEPS + step])
      }
    })
  }
  const minStep = STEP_COST * priceScale + (Number.isFinite(cheapestStep) ? cheapestStep : 0)

  return {
    grid,
    rules,
    priceScale,
    startPrice: prices.starts,
    stepPrice: prices.steps,
    riverSteps: riverStepCrossings(grid, rules.rivers),
    // Asked for by each search, so a caller that never searches (see
    // `reachableFrom`) never works out the border
    regionSteps: () => borderSteps(rules, towns, townIn),
    isOpen,
    isWater,
    isTownCell,
    isBeside,
    rival: rivalZones(rules, isTownCell),
    townIn,
    minStep
  }
}

/**
 * The cheapest way to reach every cell from the places a player may start
 * building: a search outward from them over the grid (Dijkstra's).
 *
 * The search goes by cell, but also keeps count of how many water cells
 * (bridging) and how many cells beside built track a line has just passed
 * through in a row, because both rules depend on what came before: the same
 * cell may be fine to enter after land and not after a long bridge.
 *
 * Given `targets`, the points it will be asked about, the search stops as
 * soon as it has reached every one, rather than going on over the whole
 * grid. Given a single target it also heads for it (A*): each cell waiting
 * to be searched from is ranked by its cost so far plus the least the rest
 * of the way could cost — the fewest steps left, each at the board's
 * cheapest step (`minStep`). That estimate never overstates the cost, and
 * shrinks by at most one step's worth per step, so the line found is still
 * the cheapest; only far fewer cells are looked at on the way to it.
 *
 * @param {Object} board - From `searchBoard`
 * @param {Array<{lat: number, lng: number}>} sources - Where the player may
 *   start building (see `startPoints` in trackBuilder.js)
 * @param {Object} [options]
 * @param {Array<{lat: number, lng: number}>} [options.targets] - The only
 *   points that will be asked about; without them, the whole grid is searched
 * @returns {{costTo: Function, lineTo: Function}} `costTo(point)` is what
 *   the cheapest line to a point costs (Infinity if none can reach it);
 *   `lineTo(point)` is that line's points, from its start to the point
 *   itself, or null. Both throw for a point that was not among the targets
 *   of a search that stopped early, which cannot answer for it.
 */
export function costField(board, sources, { targets } = {}) {
  const {
    grid,
    rules,
    priceScale,
    startPrice,
    stepPrice,
    riverSteps,
    regionSteps,
    isOpen,
    isWater,
    isTownCell,
    isBeside,
    rival,
    townIn,
    minStep
  } = board
  const size = grid.present.length
  const maxCells = Math.min(maxBridgeCells(grid, rules.speedUnitKm), MAX_SEARCH_BRIDGE_CELLS)
  const { riverCrossing } = gameRules.bridges

  // A search state is a cell plus the two running counts, packed into one
  // number: cell * STATES + water * (MAX_BESIDE_CELLS + 1) + beside
  const besideStates = MAX_BESIDE_CELLS + 1
  const STATES = (maxCells + 1) * besideStates
  const pack = (cell, water, beside) => cell * STATES + water * besideStates + beside

  // Single precision is plenty for comparing what lines cost, and halves
  // what a search over a big grid holds
  const cost = new Float32Array(size * STATES).fill(Infinity)
  const previous = new Int32Array(size * STATES).fill(-1)
  // Where each starting cell's line begins: the source point in it
  const startIn = new Map()
  const frontier = new MinHeap()
  // States whose cheapest cost is known. A state is pushed again each time a
  // cheaper way to it is found; the dearer copies are skipped as they come out.
  const settled = new Uint8Array(size * STATES)

  // The cells of the targets, and how many are still to be reached. A cell
  // is reached the first time any state of it is settled: that state is the
  // cheapest way into the cell, whatever its running counts.
  const targetCells = new Set(
    (targets ?? []).map((point) => findCell(point, grid)).filter((index) => index !== -1)
  )
  const isReached = new Uint8Array(size)
  let unreached = targetCells.size
  // The one cell headed for, for the A* estimate, or -1 to spread out evenly
  const goal = targetCells.size === 1 ? [...targetCells][0] : -1
  const estimate = (index) => (goal === -1 ? 0 : stepsBetween(grid, index, goal) * minStep)
  let stoppedEarly = false

  const mayEnter = (index) => index !== -1 && isOpen[index]
  // Which steps cut across land outside the region (see `borderSteps`)
  const leavesRegion = regionSteps()

  /**
   * Whether other players' zones let a line take a step (see `rivalZones`).
   * A step between two cells outside every zone always may. One into, out
   * of or within a zone may not if it is at too shallow an angle to the
   * track, or if, out in the open, it turns inside the zone. A step out
   * counts too: part of it is still in the zone, and the rules count that
   * part — the last step into a town's cell, which is in no zone, most of
   * all, as a line slanting in to a town along another player's line would
   * otherwise come in as flat as it liked.
   *
   * A line has to go straight through a zone in the open, as a crossing
   * does. Two directions can each be steep enough against a slanting line
   * of track — north and south-east against one 22° up from the east, say —
   * and taken in turn they would run along it, every step allowed on its
   * own. Near towns, where lines bend to join them, turning is allowed.
   *
   * Which way a line came into a cell is the way the search reached it most
   * cheaply (`previous`): the search keeps one way into each of its states,
   * so a cell reached more cheaply by a way that cannot go straight on
   * leaves the search to find another way round, rather than a way through
   * it from the other direction. The build rules still judge the line.
   *
   * @param {number} index - The cell the step leaves
   * @param {number} next - The cell it goes into
   * @param {number} cameFrom - The cell the line came into `index` from, or
   *   -1 if the line starts in `index`
   * @returns {boolean} True if the step may be taken
   */
  function mayStepInZone(index, next, cameFrom) {
    const zoneType = rival?.zone[next] || rival?.zone[index]
    if (!zoneType) return true
    const rows = rowOf(grid, next) - rowOf(grid, index)
    const cols = colOf(grid, next) - colOf(grid, index)
    const isTurn =
      cameFrom !== -1 &&
      (rows !== rowOf(grid, index) - rowOf(grid, cameFrom) ||
        cols !== colOf(grid, index) - colOf(grid, cameFrom))
    if (rival.zone[index] === 1 && isTurn) return false
    // The step, east and north, in km
    const stepX = cols * grid.lngStep * rival.kmPerLng
    const stepY = rows * grid.latStep * rival.kmPerLat
    // The sine of its angle to the track, either way, taken from the cell it
    // leaves if that is in a zone (see `rivalZones`)
    const from = rival.zone[index] ? index : next
    const sine =
      Math.abs(stepX * rival.awayX[from] + stepY * rival.awayY[from]) / Math.hypot(stepX, stepY)
    return sine >= rival.minSin[zoneType]
  }

  sources.forEach((point) => {
    const index = findCell(point, grid)
    if (!mayEnter(index) || startIn.has(index)) return
    startIn.set(index, point)
    const water = isWater[index] && !isTownCell[index] ? 1 : 0
    const state = pack(index, water, isBeside[index])
    cost[state] = startPrice[index]
    frontier.push(cost[state] + estimate(index), state)
  })

  while (frontier.size) {
    const state = frontier.pop()
    if (settled[state]) continue
    settled[state] = 1
    const index = Math.floor(state / STATES)
    if (targetCells.has(index) && !isReached[index]) {
      isReached[index] = 1
      unreached--
      if (unreached === 0) {
        stoppedEarly = true
        break
      }
    }
    const water = Math.floor((state % STATES) / besideStates)
    const beside = state % besideStates
    const here = cost[state]

    cellNeighbors(grid, index).forEach(({ index: next, sides, step: stepOut }) => {
      if (!mayEnter(next)) return
      // Cutting a corner passes by the two cells beside it, so they have to
      // be somewhere a line may go too
      if (sides.some((side) => !mayEnter(side))) return
      // Nor may the step cut across land outside the region on the way. A
      // line starts from the source point in its first cell (see `lineTo`),
      // so a step out of a starting cell is judged from there.
      const from = previous[state] === -1 ? startIn.get(index) : undefined
      if (leavesRegion(index, next, stepOut, sides, from)) return

      const isBridge = isWater[next] && !isTownCell[next]
      const nextWater = isBridge ? water + 1 : 0
      if (nextWater > maxCells) return
      const nextBeside = isBeside[next] ? beside + 1 : 0
      if (nextBeside > MAX_BESIDE_CELLS) return
      const cameFrom = previous[state] === -1 ? -1 : Math.floor(previous[state] / STATES)
      if (!mayStepInZone(index, next, cameFrom)) return

      // The cell's price, with the climb into it, any rivers the step
      // crosses, and the search's own nudges
      const rivers = riverSteps[index * NEIGHBOR_STEPS + stepOut]
      const step =
        stepPrice[index * NEIGHBOR_STEPS + stepOut] +
        rivers * riverCrossing +
        (STEP_COST + (isBeside[next] ? BESIDE_PENALTY : 0)) * priceScale
      const nextState = pack(next, nextWater, nextBeside)
      if (here + step < cost[nextState]) {
        cost[nextState] = here + step
        previous[nextState] = state
        frontier.push(cost[nextState] + estimate(next), nextState)
      }
    })
  }

  /** The cheapest state a cell was reached in, or -1 */
  function bestState(index) {
    let best = -1
    for (let s = 0; s < STATES; s++) {
      const state = index * STATES + s
      if (cost[state] < (best === -1 ? Infinity : cost[best])) best = state
    }
    return best
  }

  /**
   * The cell a point asked about is in, or -1. A search that stopped early
   * only knows the cheapest way to its targets; anything else it has found
   * so far may not be the cheapest, so it is not given out as if it were.
   */
  function askedCell(point) {
    const index = findCell(point, grid)
    if (stoppedEarly && index !== -1 && !targetCells.has(index)) {
      throw new Error('costField was asked about a point that was not one of its targets')
    }
    return index
  }

  function costTo(point) {
    const index = askedCell(point)
    if (index === -1) return Infinity
    const best = bestState(index)
    return best === -1 ? Infinity : cost[best]
  }

  function lineTo(point) {
    const index = askedCell(point)
    if (index === -1) return null
    const best = bestState(index)
    if (best === -1) return null

    // Read the cells back from the end to the start
    const path = []
    for (let state = best; state !== -1; state = previous[state]) {
      path.unshift(Math.floor(state / STATES))
    }
    const start = startIn.get(path[0])
    // Through the middle cells' centers, or through the town in a town cell
    const middle = path.slice(1, -1).map((cell) => townIn.get(cell) ?? cellCenter(grid, cell))
    const line = [start, ...middle, point].map(({ lat, lng }) => ({ lat, lng }))
    // A start and end in one cell may be the same point: nothing to build
    return line.length === 2 && kmBetween(line[0], line[1]) === 0 ? null : line
  }

  return { costTo, lineTo }
}

/**
 * Whether track could be built from the sources to a point at all, at any
 * price: on a board with no track built yet, keeping to the cells the
 * search may go in, cutting corners as it may, and bridging no further than
 * the rules allow.
 *
 * Unlike the search, it does not judge each step against the border (see
 * `borderSteps`): a person draws track wherever they like, not from cell
 * center to cell center, so where the border wanders between two cells'
 * centers they can draw round it. A town is left off only when no one
 * could reach it.
 *
 * Unlike `costField`, it goes as far as the rules allow over water, however
 * many cells that is: it only asks whether a cell can be got to, so it keeps
 * one count per cell, the fewest water cells in a row a line has just
 * crossed on getting there (fewer is never worse: any line onward from a
 * longer stretch of water could go on from a shorter one). That keeps it to
 * one pass over the grid, a small part of a priced search's time and memory.
 *
 * Used at setup, to leave off the board any town no one could ever reach
 * (see reachableTowns.js).
 *
 * @param {Object} board - From `searchBoard`
 * @param {Array<{lat: number, lng: number}>} sources - Where track starts
 * @returns {Function} (point: {lat, lng}) => true if track could reach it
 */
export function reachableFrom(board, sources) {
  const { grid, rules, isOpen, isWater, isTownCell } = board
  const maxCells = maxBridgeCells(grid, rules.speedUnitKm)
  const NOT_REACHED = 0xffff
  // Per cell, the fewest water cells in a row on getting there
  const leastWater = new Uint16Array(grid.present.length).fill(NOT_REACHED)
  // Cells to step on from, each again whenever it is got to over less water
  const queue = []

  const mayEnter = (index) => index !== -1 && isOpen[index] === 1
  const isBridge = (index) => isWater[index] === 1 && isTownCell[index] === 0
  const reach = (index, water) => {
    if (water > maxCells || water >= leastWater[index]) return
    leastWater[index] = water
    queue.push(index)
  }

  sources.forEach((point) => {
    const index = findCell(point, grid)
    if (mayEnter(index)) reach(index, isBridge(index) ? 1 : 0)
  })
  for (let i = 0; i < queue.length; i++) {
    const index = queue[i]
    const water = leastWater[index]
    cellNeighbors(grid, index).forEach(({ index: next, sides }) => {
      if (!mayEnter(next)) return
      // Cutting a corner passes by the two cells beside it, so they have to
      // be somewhere a line may go too
      if (sides.some((side) => !mayEnter(side))) return
      reach(next, isBridge(next) ? water + 1 : 0)
    })
  }

  return (point) => {
    const index = findCell(point, grid)
    return index !== -1 && leastWater[index] !== NOT_REACHED
  }
}

/**
 * The line of track a player would build to reach a point, keeping to every
 * build rule, or null if the search finds no such line.
 *
 * The search's cheapest line is judged by the build rules (`lineBlock`). If
 * it breaks one, there is no line: no other way is searched for (see the
 * module notes).
 *
 * @param {Object} board - From `searchBoard`
 * @param {Array<{lat: number, lng: number}>} sources - Where the player may
 *   start building
 * @param {{lat: number, lng: number}} target - Where the track should reach
 * @param {Object} [field] - A search already made from the same sources
 *   (see `costField`), with the target among its targets if it was given
 *   any, used instead of searching again
 * @returns {Array<Object>|null} The line's points, or null
 */
export function planLine(board, sources, target, field = null) {
  const search = field ?? costField(board, sources, { targets: [target] })
  const line = search.lineTo(target)
  return line && !lineBlock(line, board.rules, { isFinished: true }) ? line : null
}

/**
 * The longest start of a line a player can afford to build now, and that is
 * a section the rules allow on its own: a track that has to be built over
 * several turns is built a piece at a time, and each piece must be one that
 * could be built by itself.
 *
 * Price only grows as a line gets longer, so the longest affordable start is
 * found by halving; then it is shortened, if need be, until it ends
 * somewhere a line may end: not on water (a bridge has to reach land), and
 * not beside other players' track (see `endBlockAt`). The whole line keeps
 * to every other rule, so every start of it does too: where it ends is the
 * only thing a start of it can get wrong, and only that is checked.
 *
 * @param {Array<Object>} line - The whole line, buildable as a whole
 * @param {number} budget - What the player can spend
 * @param {Object} rules - See `searchBoard`
 * @param {Function} price - What a section would cost to build:
 *   (points) => dollars (see `priceSection` in trackBuilder.js)
 * @returns {Array<Object>|null} The section to build, or null if not even
 *   its first leg can be afforded
 */
export function affordableSection(line, budget, rules, price) {
  let affordable = 1
  let tooDear = line.length + 1
  while (tooDear - affordable > 1) {
    const middle = Math.floor((affordable + tooDear) / 2)
    if (price(line.slice(0, middle)) <= budget) affordable = middle
    else tooDear = middle
  }
  for (let count = affordable; count >= 2; count--) {
    if (!endBlockAt(line[count - 1], rules)) return line.slice(0, count)
  }
  return null
}
