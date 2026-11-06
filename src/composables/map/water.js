/**
 * Water (water.js)
 *
 * Where the board's water is, and what bridging it costs. The water is
 * Natural Earth's rivers, lakes and sea, trimmed for the game into
 * public/data/water.json (see scripts/build-water-data.mjs and the water
 * store). Water comes in two kinds, bridged two ways:
 *
 * - Lakes and the sea are areas. A grid cell is water when its center is in
 *   one (see `waterCells`); the grid keeps that per cell, worked out once as
 *   the grid is built. A line of track crossing water cells pays a bridge
 *   for each, priced per speed unit of water crossed, and a crossing longer
 *   than the rules allow cannot be built (see `gameRules.bridges`).
 *
 * - Rivers are lines with no width. They are not water cells: track may run
 *   alongside a river freely, through the same cells, and pays a river
 *   bridge each time it crosses the river's line (see `riverCrossings`).
 *   River crossings are never too long to build.
 *
 * The land cover's own open water (the NLCD's, see config/nlcd.js) is
 * priced as ground and is not bridged: it marks every pond and marsh pool,
 * and the board's water should be only the big rivers and lakes.
 *
 * Pure functions over plain data, so the rules can be tested without a map.
 *
 * @module composables/map/water
 */

import { gameRules } from '@/config/game'
import { cellKm, cellContaining, walkCells } from '@/composables/map/cellGrid'

/**
 * @param {Object} grid - The grid (see cellGrid.js)
 * @param {number} cell - A cell's index
 * @returns {boolean} True if the cell is lake or sea, which track bridges
 */
export function isWaterCell(grid, cell) {
  return grid.water[cell] === 1
}

/**
 * What the bridge over one water cell costs: `gameRules.bridges.perSpeedUnit`
 * for each speed unit of the cell's width, in whole dollars. Every water cell
 * of a crossing costs the same, so a crossing costs in proportion to how far
 * it spans.
 * @param {Object} grid - The grid
 * @param {number} speedUnitKm - The board's speed unit (see boardScale.js)
 * @returns {number} Dollars
 */
export function bridgeCellPrice(grid, speedUnitKm) {
  return Math.round((gameRules.bridges.perSpeedUnit * cellKm(grid)) / speedUnitKm)
}

/**
 * How many water cells in a row a bridge may cross on this board: as many as
 * fit in `gameRules.bridges.maxSpeedUnits` speed units. (A hair's leeway
 * keeps a crossing that ends exactly at the limit within it.)
 * @param {Object} grid - The grid
 * @param {number} speedUnitKm - The board's speed unit (see boardScale.js)
 * @returns {number} Cells
 */
export function maxBridgeCells(grid, speedUnitKm) {
  return Math.floor((gameRules.bridges.maxSpeedUnits * speedUnitKm) / cellKm(grid) + 1e-9)
}

/**
 * The longest crossing of water along a line: the most water cells it
 * passes through between one land cell and the next. A water cell the line
 * comes back to within a crossing counts once.
 * @param {Array<number>} path - Grid cells in order along a line (see
 *   `cellPath` in trackCost.js)
 * @param {Object} grid - The grid the cells are in
 * @param {Array<number>} [landCells] - Cells to count as land whatever they
 *   are: the cells towns sit in, since a town on the shore is the land a
 *   bridge reaches even when its cell's center is in the water
 * @returns {number} How many water cells the longest crossing has; 0 for none
 */
export function longestCrossing(path, grid, landCells = []) {
  const land = new Set(landCells)
  let longest = 0
  const crossing = new Set()
  path.forEach((cell) => {
    if (isWaterCell(grid, cell) && !land.has(cell)) crossing.add(cell)
    else crossing.clear()
    longest = Math.max(longest, crossing.size)
  })
  return longest
}

/**
 * Which cells of a grid are water: those whose center is inside one of the
 * polygons (lakes and sea).
 *
 * Worked out a row of cells at a time (a scanline fill): along the line of
 * latitude through a row's centers, every place a polygon's edge crosses it
 * is found, and the cells between each pair of crossings, counted from the
 * west, are inside. Counting crossings this way also leaves out the holes a
 * polygon has — the islands in a lake, the land in the sea. Far quicker than
 * testing each cell's center against each polygon on its own: a board has a
 * quarter of a million cells, and the sea's outline tens of thousands of
 * points.
 *
 * Latitude and longitude are treated as flat, as the grid itself is: its
 * cells are equal steps of each.
 *
 * @param {Object} shape - The grid's shape (see `createCellGrid`): rows,
 *   cols, south, west, latStep, lngStep
 * @param {Array<Array<Array<Array<number>>>>} polygons - Each polygon's
 *   rings, as GeoJSON Polygon coordinates: [lng, lat] points
 * @returns {Uint8Array} Per cell, 1 if it is water
 */
export function waterCells({ rows, cols, south, west, latStep, lngStep }, polygons) {
  const water = new Uint8Array(rows * cols)
  polygons.forEach((rings) => {
    let minLat = Infinity
    let maxLat = -Infinity
    rings.forEach((ring) =>
      ring.forEach(([, lat]) => {
        minLat = Math.min(minLat, lat)
        maxLat = Math.max(maxLat, lat)
      })
    )
    // The rows whose centers the polygon reaches north to south
    const firstRow = Math.max(0, Math.ceil((minLat - south) / latStep - 0.5))
    const lastRow = Math.min(rows - 1, Math.floor((maxLat - south) / latStep - 0.5))

    for (let row = firstRow; row <= lastRow; row++) {
      const lat = south + (row + 0.5) * latStep
      // Where the polygon's edges cross this row's line of latitude, west to
      // east. An edge counts when its two ends are on opposite sides of the
      // line, an end lying exactly on it counted as below, so a vertex on the
      // line is crossed once, not twice.
      const crossings = []
      rings.forEach((ring) => {
        for (let i = 0; i < ring.length; i++) {
          const [lng1, lat1] = ring[i]
          const [lng2, lat2] = ring[(i + 1) % ring.length]
          if (lat1 <= lat !== lat2 <= lat) {
            crossings.push(lng1 + ((lat - lat1) / (lat2 - lat1)) * (lng2 - lng1))
          }
        }
      })
      crossings.sort((a, b) => a - b)

      // Between the first and second crossing is inside, between the second
      // and third outside, and so on: fill the columns whose centers lie
      // inside
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const firstCol = Math.max(0, Math.ceil((crossings[k] - west) / lngStep - 0.5))
        const lastCol = Math.min(cols - 1, Math.floor((crossings[k + 1] - west) / lngStep - 0.5))
        for (let col = firstCol; col <= lastCol; col++) water[row * cols + col] = 1
      }
    }
  })
  return water
}

/**
 * The rivers near a grid, ready for finding where track crosses them: each
 * straight piece of each river line, filed under every grid cell it runs
 * through, so a line of track is only tested against the river pieces in
 * the cells it crosses rather than against every river on the board.
 *
 * Pieces that lie wholly outside the grid's rectangle are left out: no track
 * can reach them.
 *
 * @param {Object} grid - The grid (see cellGrid.js)
 * @param {Array<Array<Array<number>>>} lines - The river lines, each as
 *   [lng, lat] points (GeoJSON LineString coordinates)
 * @returns {{pieces: Float64Array, byCell: Map<number, Array<number>>}} Each
 *   piece's ends as four numbers in a row (lng, lat, lng, lat), and per cell
 *   the pieces that run through it, by their place in `pieces`
 */
export function riverIndex(grid, lines) {
  const north = grid.south + grid.rows * grid.latStep
  const east = grid.west + grid.cols * grid.lngStep
  const ends = []
  const byCell = new Map()

  lines.forEach((line) => {
    for (let i = 1; i < line.length; i++) {
      const [lng1, lat1] = line[i - 1]
      const [lng2, lat2] = line[i]
      const isOff =
        Math.max(lng1, lng2) < grid.west ||
        Math.min(lng1, lng2) > east ||
        Math.max(lat1, lat2) < grid.south ||
        Math.min(lat1, lat2) > north
      if (isOff) continue

      const piece = ends.length / 4
      ends.push(lng1, lat1, lng2, lat2)
      const from = { lat: lat1, lng: lng1 }
      const to = { lat: lat2, lng: lng2 }
      walkCells(from, to, grid, (row, col) => {
        if (row < 0 || row >= grid.rows || col < 0 || col >= grid.cols) return
        const cell = row * grid.cols + col
        const pieces = byCell.get(cell)
        if (!pieces) byCell.set(cell, [piece])
        else if (pieces.at(-1) !== piece) pieces.push(piece)
      })
    }
  })
  return { pieces: Float64Array.from(ends), byCell }
}

/**
 * Where two straight pieces cross, if they do: the first from a to b, the
 * second from c to d, each end as {lat, lng}. Pieces that run along the
 * same line (parallel) never cross.
 *
 * A crossing exactly on a piece's end counts, and one exactly on its start
 * does not. Lines and rivers are chains of pieces, each starting where the
 * one before ended, so a crossing on the point where two meet belongs to the
 * first of them only. That is what keeps one crossing from being paid twice
 * where track built in two sections meets on a river: the first section,
 * ending on the river, pays its bridge; the next, starting from there, does
 * not pay it again.
 * @returns {{lat: number, lng: number}|null} The crossing, or null
 */
function crossingOf(a, b, c, d) {
  const rLng = b.lng - a.lng
  const rLat = b.lat - a.lat
  const sLng = d.lng - c.lng
  const sLat = d.lat - c.lat
  const across = rLng * sLat - rLat * sLng
  if (across === 0) return null
  const toCLng = c.lng - a.lng
  const toCLat = c.lat - a.lat
  // How far along each piece the crossing is, from 0 at its start to 1 at its end
  const t = (toCLng * sLat - toCLat * sLng) / across
  const u = (toCLng * rLat - toCLat * rLng) / across
  if (t <= 0 || t > 1 || u <= 0 || u > 1) return null
  return { lat: a.lat + t * rLat, lng: a.lng + t * rLng }
}

/**
 * Every place a line of track crosses a river, each once.
 *
 * Each leg of the line is walked cell by cell (see `walkCells`) and tested
 * against the river pieces filed under those cells (see `riverIndex`). A
 * crossing in a water cell is left out: there the track is on a lake's or
 * the sea's bridge already, and a river line running into a lake is not
 * another bridge. Where the line or the river bends exactly on the crossing,
 * the two legs (or pieces) meeting there both find it; it is counted once.
 *
 * @param {Array<{lat: number, lng: number}>} latlngs - The line's vertices
 * @param {Object} grid - The grid
 * @param {Object|null} [rivers] - The rivers (see `riverIndex`), or none for
 *   a board without them
 * @returns {Array<{lat: number, lng: number}>} The crossings, in no
 *   particular order
 */
export function riverCrossings(latlngs, grid, rivers) {
  if (!rivers || latlngs.length < 2) return []
  const { pieces, byCell } = rivers
  const found = new Map()

  latlngs.slice(1).forEach((to, i) => {
    const from = latlngs[i]
    const nearby = new Set()
    walkCells(from, to, grid, (row, col) => {
      if (row < 0 || row >= grid.rows || col < 0 || col >= grid.cols) return
      byCell.get(row * grid.cols + col)?.forEach((piece) => nearby.add(piece))
    })
    nearby.forEach((piece) => {
      const o = piece * 4
      const start = { lng: pieces[o], lat: pieces[o + 1] }
      const end = { lng: pieces[o + 2], lat: pieces[o + 3] }
      const crossing = crossingOf(from, to, start, end)
      if (!crossing) return
      const cell = cellContaining(crossing, grid)
      if (cell !== -1 && isWaterCell(grid, cell)) return
      // To a ten-millionth of a degree, about a centimeter
      const key = `${Math.round(crossing.lat * 1e7)},${Math.round(crossing.lng * 1e7)}`
      found.set(key, crossing)
    })
  })
  return [...found.values()]
}
