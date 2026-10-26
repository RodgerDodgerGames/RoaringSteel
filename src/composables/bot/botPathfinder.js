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
 * - it stays in cells inside the region (or a town's cell, see buildRules.js);
 * - it counts water cells in a row and never bridges more than the rules
 *   allow, and prices each bridge cell as pricing does (see water.js);
 * - it marks the cells right beside track already built and lets a line pass
 *   through no more than two of them in a row, which is about what crossing
 *   a line takes, so it crosses track rather than running alongside it.
 *
 * "Nearly always" is not good enough for a player who must never break the
 * rules, so every line found is then judged by the build rules themselves
 * (`lineBlock`, the same check a person's line gets). If it breaks one, the
 * cell where it first goes wrong is shut and the search runs again, a few
 * times at most. A line that cannot be made to pass is not built at all.
 *
 * Where the line passes through a town's cell it goes through the town
 * itself rather than the cell's center, so the town joins the network on the
 * way (the network only joins a town that track has a point on — see
 * network.js).
 *
 * Pure functions over plain data, so they can be tested without a map.
 *
 * @module composables/bot/botPathfinder
 */

import { gameRules } from '@/config/game'
import { findCell, pointsAlongLine, kmBetween, priceLine } from '@/composables/map/trackCost'
import { lineBlock } from '@/composables/map/buildRules'
import { isWaterCell, bridgeCellCost } from '@/composables/map/water'
import { MinHeap } from '@/composables/network'

/**
 * How many cells right beside built track a line may pass through in a row.
 * Two lets a line cross track at any angle (a line drawn between two cell
 * centers has cells beside it on both sides); three in a row is running
 * alongside it.
 */
const MAX_BESIDE_CELLS = 2

/**
 * What passing through a cell beside built track adds to a line's cost in
 * the search, in dollars. Not a real cost: it only makes the search prefer
 * to keep its distance and cross track squarely, which the build rules like.
 */
const BESIDE_PENALTY = 400

/**
 * What every cell adds to a line's cost in the search, on top of its price.
 * Keeps the search from taking a long way round to save a few dollars, and
 * from treating cells with no price (missing terrain data) as free to wander.
 */
const STEP_COST = 50

/** How many times a line that breaks a build rule is searched for again */
const MAX_ATTEMPTS = 6

/**
 * The distinct values in a list of numbers, smallest first. Values a hair
 * apart (floating-point noise) count as one.
 * @param {Array<number>} values - The numbers
 * @returns {Array<number>} The distinct values
 */
function distinctSorted(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.filter((value, i) => i === 0 || value - sorted[i - 1] > 1e-9)
}

/**
 * The smallest gap between neighboring values: the grid's spacing.
 * @param {Array<number>} sorted - Distinct values, smallest first
 * @returns {number} The spacing; 1 when there is only one value
 */
function spacing(sorted) {
  let gap = Infinity
  for (let i = 1; i < sorted.length; i++) gap = Math.min(gap, sorted[i] - sorted[i - 1])
  return Number.isFinite(gap) ? gap : 1
}

/**
 * The grid as rows and columns, so a cell's neighbors can be found at once.
 *
 * The grid store lays cells out in rows of equal latitude and columns of
 * equal longitude (see grid.js), but saves do not always carry the
 * "row-col" ids it gives them, so the rows and columns are worked out from
 * the cells' centers instead.
 *
 * @param {Array<Object>} grid - Grid cells, each with a `centroid`
 * @returns {{cells: Array<Object>, rowOf: Int32Array, colOf: Int32Array,
 *   at: Function, cellNear: Function, neighbors: Function}} The lattice:
 *   `at(row, col)` is the index of the cell there (or -1); `cellNear(point)`
 *   the index of the cell a point is in; `neighbors(index)` the indexes of
 *   the up to eight cells around one, each with whether it is diagonal
 */
export function gridLattice(grid) {
  const lats = distinctSorted(grid.map(({ centroid }) => centroid.lat))
  const lngs = distinctSorted(grid.map(({ centroid }) => centroid.lng))
  const latStep = spacing(lats)
  const lngStep = spacing(lngs)
  const rowFor = (lat) => Math.round((lat - lats[0]) / latStep)
  const colFor = (lng) => Math.round((lng - lngs[0]) / lngStep)

  const rowOf = new Int32Array(grid.length)
  const colOf = new Int32Array(grid.length)
  const byPlace = new Map()
  grid.forEach(({ centroid }, index) => {
    rowOf[index] = rowFor(centroid.lat)
    colOf[index] = colFor(centroid.lng)
    byPlace.set(`${rowOf[index]},${colOf[index]}`, index)
  })

  const at = (row, col) => byPlace.get(`${row},${col}`) ?? -1

  /**
   * The cell a point is in, the way pricing finds it (`findCell`: the cell
   * with the nearest center), but only looking at the cells around where
   * the point falls rather than at the whole grid.
   */
  function cellNear(point) {
    const row = rowFor(point.lat)
    const col = colFor(point.lng)
    const lngScale = Math.cos((point.lat * Math.PI) / 180)
    let nearest = -1
    let nearestDistance = Infinity
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const index = at(row + dr, col + dc)
        if (index === -1) continue
        const { centroid } = grid[index]
        const dLat = point.lat - centroid.lat
        const dLng = (point.lng - centroid.lng) * lngScale
        const distance = dLat * dLat + dLng * dLng
        if (distance < nearestDistance) {
          nearest = index
          nearestDistance = distance
        }
      }
    }
    if (nearest !== -1) return nearest
    // Off the edge of the lattice, or in a hole in it: ask the whole grid
    return grid.indexOf(findCell(point, grid))
  }

  const OFFSETS = [
    [-1, 0, false],
    [1, 0, false],
    [0, -1, false],
    [0, 1, false],
    [-1, -1, true],
    [-1, 1, true],
    [1, -1, true],
    [1, 1, true]
  ]

  function neighbors(index) {
    const list = []
    OFFSETS.forEach(([dr, dc, isDiagonal]) => {
      const next = at(rowOf[index] + dr, colOf[index] + dc)
      if (next === -1) return
      // A diagonal step passes the corner between the two cells beside it
      const sides = isDiagonal
        ? [at(rowOf[index] + dr, colOf[index]), at(rowOf[index], colOf[index] + dc)]
        : []
      list.push({ index: next, sides })
    })
    return list
  }

  return { cells: grid, rowOf, colOf, at, cellNear, neighbors }
}

/**
 * Everything the search needs to know about the board, worked out once per
 * search: which cells a line may pass through, which are water, which are
 * right beside track already built, and where the towns are.
 *
 * @param {Object} rules - What lines are judged against, as the track builder
 *   holds them (`buildRules` in trackBuilder.js): `grid`, `isInRegion`,
 *   `townCells` and `builtLegs`
 * @param {Array<Object>} towns - Every town, each with lat and lon
 * @returns {Object} The board, for `costField` and `planLine`
 */
export function searchBoard(rules, towns) {
  const lattice = gridLattice(rules.grid)
  const count = rules.grid.length
  const townCellSet = new Set(rules.townCells)

  const isTownCell = new Uint8Array(count)
  const isOpen = new Uint8Array(count)
  const isWater = new Uint8Array(count)
  rules.grid.forEach((cell, index) => {
    isTownCell[index] = townCellSet.has(cell) ? 1 : 0
    // Town cells may be built in even where they reach outside the region
    isOpen[index] = isTownCell[index] || rules.isInRegion(cell.centroid) ? 1 : 0
    isWater[index] = isWaterCell(cell) ? 1 : 0
  })

  // Cells with a center within the spacing distance of built track. Track is
  // walked at the points pricing checks it at, and the cells around each are
  // measured; a quarter-cell gap between points is allowed for.
  const { nearKm } = gameRules.trackSpacing
  const isBeside = new Uint8Array(count)
  ;(rules.builtLegs ?? []).forEach((leg) => {
    pointsAlongLine(leg).forEach((point) => {
      const middle = lattice.cellNear(point)
      if (middle === -1) return
      ;[middle, ...lattice.neighbors(middle).map(({ index }) => index)].forEach((index) => {
        if (!isTownCell[index] && kmBetween(point, rules.grid[index].centroid) <= nearKm) {
          isBeside[index] = 1
        }
      })
    })
  })

  // The town in each town cell, so a line through the cell goes through it
  const townIn = new Map()
  towns.forEach((town) => {
    const index = lattice.cellNear({ lat: town.lat, lng: town.lon })
    if (index !== -1 && !townIn.has(index)) townIn.set(index, { lat: town.lat, lng: town.lon })
  })

  return { lattice, rules, isOpen, isWater, isTownCell, isBeside, townIn }
}

/**
 * What one grid cell costs a line passing through it, in the search: its
 * price as land, or a bridge's price by how far into its crossing it is.
 * @param {Object} cell - The grid cell
 * @param {boolean} isWater - Whether it is water
 * @param {number} crossing - Its place in its row of water cells, from 1
 * @returns {number} The cost
 */
function cellCost(cell, isWater, crossing) {
  if (isWater) return bridgeCellCost(crossing)
  return Number.isFinite(cell.cost) ? cell.cost : 0
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
 * @param {Object} board - From `searchBoard`
 * @param {Array<{lat: number, lng: number}>} sources - Where the player may
 *   start building (see `startPoints` in trackBuilder.js)
 * @param {Object} [options]
 * @param {Set<number>} [options.shut] - Cells the line may not pass through
 * @returns {{costTo: Function, lineTo: Function}} `costTo(point)` is what
 *   the cheapest line to a point costs (Infinity if none can reach it);
 *   `lineTo(point)` is that line's points, from its start to the point
 *   itself, or null
 */
export function costField(board, sources, { shut = new Set() } = {}) {
  const { lattice, isOpen, isWater, isTownCell, isBeside, townIn } = board
  const cells = lattice.cells
  const { maxCells } = gameRules.bridges

  // A search state is a cell plus the two running counts, packed into one
  // number: cell * STATES + water * (MAX_BESIDE_CELLS + 1) + beside
  const besideStates = MAX_BESIDE_CELLS + 1
  const STATES = (maxCells + 1) * besideStates
  const pack = (cell, water, beside) => cell * STATES + water * besideStates + beside

  const cost = new Float64Array(cells.length * STATES).fill(Infinity)
  const previous = new Int32Array(cells.length * STATES).fill(-1)
  // Where each starting cell's line begins: the source point in it
  const startIn = new Map()
  const frontier = new MinHeap()
  // States whose cheapest cost is known. A state is pushed again each time a
  // cheaper way to it is found; the dearer copies are skipped as they come out.
  const settled = new Uint8Array(cells.length * STATES)

  const mayEnter = (index) => index !== -1 && isOpen[index] && !shut.has(index)

  sources.forEach((point) => {
    const index = lattice.cellNear(point)
    if (!mayEnter(index) || startIn.has(index)) return
    startIn.set(index, point)
    const water = isWater[index] && !isTownCell[index] ? 1 : 0
    const state = pack(index, water, isBeside[index])
    cost[state] = cellCost(cells[index], isWater[index], 1)
    frontier.push(cost[state], state)
  })

  while (frontier.size) {
    const state = frontier.pop()
    if (settled[state]) continue
    settled[state] = 1
    const index = Math.floor(state / STATES)
    const water = Math.floor((state % STATES) / besideStates)
    const beside = state % besideStates
    const here = cost[state]

    lattice.neighbors(index).forEach(({ index: next, sides }) => {
      if (!mayEnter(next)) return
      // Cutting a corner passes by the two cells beside it, so they have to
      // be somewhere a line may go too
      if (sides.some((side) => !mayEnter(side))) return

      const isBridge = isWater[next] && !isTownCell[next]
      const nextWater = isBridge ? water + 1 : 0
      if (nextWater > maxCells) return
      const nextBeside = isBeside[next] ? beside + 1 : 0
      if (nextBeside > MAX_BESIDE_CELLS) return

      const step =
        cellCost(cells[next], isWater[next], water + 1) +
        STEP_COST +
        (isBeside[next] ? BESIDE_PENALTY : 0)
      const nextState = pack(next, nextWater, nextBeside)
      if (here + step < cost[nextState]) {
        cost[nextState] = here + step
        previous[nextState] = state
        frontier.push(cost[nextState], nextState)
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

  function costTo(point) {
    const index = lattice.cellNear(point)
    if (index === -1) return Infinity
    const best = bestState(index)
    return best === -1 ? Infinity : cost[best]
  }

  function lineTo(point) {
    const index = lattice.cellNear(point)
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
    const middle = path.slice(1, -1).map((cell) => townIn.get(cell) ?? cells[cell].centroid)
    const line = [start, ...middle, point].map(({ lat, lng }) => ({ lat, lng }))
    // A start and end in one cell may be the same point: nothing to build
    return line.length === 2 && kmBetween(line[0], line[1]) === 0 ? null : line
  }

  return { costTo, lineTo }
}

/**
 * How many of a line's points can be kept before it first breaks a build
 * rule: the longest start of it the rules allow while it is still being
 * drawn. Breaking a rule never comes undone further along (a line that has
 * strayed outside the region, bridged too far or run alongside track has
 * done so for good), so the answer is found by halving.
 * @param {Array<Object>} line - The line's points
 * @param {Object} rules - See `searchBoard`
 * @returns {number} How many points pass; the whole line's length if it does
 */
function pointsThatPass(line, rules) {
  let passing = 1
  let failing = line.length + 1
  while (failing - passing > 1) {
    const middle = Math.floor((passing + failing) / 2)
    if (lineBlock(line.slice(0, middle), rules)) failing = middle
    else passing = middle
  }
  return passing
}

/**
 * The line of track a player would build to reach a point, keeping to every
 * build rule, or null if no such line can be found.
 *
 * The search's line is judged by the build rules (`lineBlock`). If it breaks
 * one, the cell of the point where it goes wrong is shut and the search runs
 * again — or the cell before it, when the point it goes wrong at is the
 * end, which cannot be moved. A line whose very first leg breaks a rule
 * cannot be mended this way, and none is offered.
 *
 * @param {Object} board - From `searchBoard`
 * @param {Array<{lat: number, lng: number}>} sources - Where the player may
 *   start building
 * @param {{lat: number, lng: number}} target - Where the track should reach
 * @param {Object} [field] - A search already made from the same sources
 *   (see `costField`), used for the first try instead of searching again
 * @returns {Array<Object>|null} The line's points, or null
 */
export function planLine(board, sources, target, field = null) {
  const shut = new Set()
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const search = attempt === 0 && field ? field : costField(board, sources, { shut })
    const line = search.lineTo(target)
    if (!line) return null
    if (!lineBlock(line, board.rules, { isFinished: true })) return line

    // The first point the line cannot get to without breaking a rule. When
    // the whole line passes as it is drawn, it only fails as a finished one,
    // which is ending on water, and that is the end's cell.
    const passing = pointsThatPass(line, board.rules)
    const badPoint = Math.min(passing, line.length - 1)
    const movable = badPoint < line.length - 1 ? badPoint : badPoint - 1
    if (movable < 1) return null
    shut.add(board.lattice.cellNear(line[movable]))
  }
  return null
}

/**
 * The longest start of a line a player can afford to build now, and that is
 * a section the rules allow on its own: a track that has to be built over
 * several turns is built a piece at a time, and each piece must be one that
 * could be built by itself.
 *
 * Price only grows as a line gets longer, so the longest affordable start is
 * found by halving; then it is shortened, if need be, until it does not end
 * on water (a bridge has to reach land). The whole line keeps to every other
 * rule, so every start of it does too: ending on water is the only rule a
 * start of it can break, and only that is checked.
 *
 * @param {Array<Object>} line - The whole line, buildable as a whole
 * @param {number} budget - What the player can spend
 * @param {Object} rules - See `searchBoard`
 * @returns {Array<Object>|null} The section to build, or null if not even
 *   its first leg can be afforded
 */
export function affordableSection(line, budget, rules) {
  let affordable = 1
  let tooDear = line.length + 1
  while (tooDear - affordable > 1) {
    const middle = Math.floor((affordable + tooDear) / 2)
    if (priceLine(line.slice(0, middle), rules.grid) <= budget) affordable = middle
    else tooDear = middle
  }
  for (let count = affordable; count >= 2; count--) {
    const end = findCell(line[count - 1], rules.grid)
    if (!isWaterCell(end) || rules.townCells.includes(end)) return line.slice(0, count)
  }
  return null
}
