/**
 * Cell Grid (cellGrid.js)
 *
 * The board's grid of cells, kept compactly: a rectangle of rows and columns
 * laid over the region's bounding box, each cell the same size in degrees,
 * with its terrain held in typed arrays rather than as one object per cell.
 *
 * Why typed arrays: a cell object took about 185 bytes; the same cell in
 * typed arrays takes 11. The grid is also the thing every line of track is
 * priced and checked against, point by point as the cursor moves, so how
 * fast a cell can be found matters. With the cells in rows and columns, the
 * cell a point lies in is worked out by arithmetic instead of by searching
 * the whole grid for the nearest center.
 *
 * A cell is named by its index: `row * cols + col`, counting rows from the
 * south and columns from the west. An index of -1 means "no cell".
 *
 * Not every cell in the rectangle is on the board. The sea, and land beyond
 * the US border that the land cover has nothing for, are left out (see
 * `isUsableCell` in stores/grid.js): such a cell is a hole, marked absent in
 * `present`, and is never returned as a cell.
 *
 * The grid object is plain data and is never made reactive (see
 * stores/grid.js): Vue's proxies around arrays this size made every lookup
 * many times slower.
 *
 * @module composables/map/cellGrid
 */

/**
 * @typedef {Object} CellGrid
 * @property {number} rows - Rows of cells, south to north
 * @property {number} cols - Columns of cells, west to east
 * @property {number} south - Latitude of the grid's southern edge
 * @property {number} west - Longitude of the grid's western edge
 * @property {number} latStep - Degrees of latitude one cell spans
 * @property {number} lngStep - Degrees of longitude one cell spans
 * @property {number} count - How many cells are on the board (not holes)
 * @property {Uint8Array} present - Per cell, 1 if it is on the board
 * @property {Float32Array} elevation - Per cell, height in meters (NaN for a hole)
 * @property {Uint16Array} landCover - Per cell, the land cover's cost
 *   (see config/nlcd.js); 0 for a hole
 * @property {Float32Array} cost - Per cell, what track through it costs;
 *   NaN where the cost could not be worked out
 */

/**
 * A new grid with every cell a hole, ready to have its cells filled in.
 *
 * The values a cell holds all fit their arrays exactly: heights are whole
 * meters, land cover costs whole dollars no more than 9,990, and a cell's
 * cost — land cover plus the height differences to its neighbors — is a
 * whole number far below the 16 million a Float32 counts to without
 * rounding.
 *
 * @param {Object} shape - Where the grid is and how it is divided
 * @param {number} shape.rows - Rows of cells
 * @param {number} shape.cols - Columns of cells
 * @param {number} shape.south - Latitude of the southern edge
 * @param {number} shape.west - Longitude of the western edge
 * @param {number} shape.latStep - Degrees of latitude per cell
 * @param {number} shape.lngStep - Degrees of longitude per cell
 * @returns {CellGrid} The grid, all holes
 */
export function createCellGrid({ rows, cols, south, west, latStep, lngStep }) {
  const size = rows * cols
  return {
    rows,
    cols,
    south,
    west,
    latStep,
    lngStep,
    count: 0,
    present: new Uint8Array(size),
    elevation: new Float32Array(size).fill(NaN),
    landCover: new Uint16Array(size),
    cost: new Float32Array(size).fill(NaN)
  }
}

/**
 * Puts a cell on the board with its terrain.
 * @param {CellGrid} grid - The grid
 * @param {number} index - The cell
 * @param {Object} terrain - What the cell holds
 * @param {number} terrain.elevation - Height in meters
 * @param {number} terrain.landCover - The land cover's cost
 * @param {number} [terrain.cost] - What track through it costs, if known yet
 */
export function setCell(grid, index, { elevation, landCover, cost = NaN }) {
  if (!grid.present[index]) grid.count++
  grid.present[index] = 1
  grid.elevation[index] = elevation
  grid.landCover[index] = landCover
  // A missing cost (null) is held as NaN, which is what `Number.isFinite`
  // checks for when the cost is read
  grid.cost[index] = cost ?? NaN
}

/**
 * Whether a grid has no cells on the board: none built yet, or none usable.
 * @param {CellGrid|null} grid - The grid, or null before there is one
 * @returns {boolean} True if there are no cells
 */
export function isEmptyGrid(grid) {
  return !grid || grid.count === 0
}

/**
 * The cell at a row and column.
 * @param {CellGrid} grid - The grid
 * @param {number} row - Row, from the south
 * @param {number} col - Column, from the west
 * @returns {number} Its index, or -1 if it is off the grid or a hole
 */
export function cellAt(grid, row, col) {
  if (row < 0 || row >= grid.rows || col < 0 || col >= grid.cols) return -1
  const index = row * grid.cols + col
  return grid.present[index] ? index : -1
}

/** The row a cell is in, from the south */
export const rowOf = (grid, index) => Math.floor(index / grid.cols)

/** The column a cell is in, from the west */
export const colOf = (grid, index) => index % grid.cols

/**
 * The center of a cell.
 * @param {CellGrid} grid - The grid
 * @param {number} index - The cell
 * @returns {{lat: number, lng: number}} Its center
 */
export function cellCenter(grid, index) {
  return {
    lat: grid.south + (rowOf(grid, index) + 0.5) * grid.latStep,
    lng: grid.west + (colOf(grid, index) + 0.5) * grid.lngStep
  }
}

/**
 * The edges of a cell.
 * @param {CellGrid} grid - The grid
 * @param {number} index - The cell
 * @returns {{south: number, west: number, north: number, east: number}} Its
 *   edges, in degrees
 */
export function cellBounds(grid, index) {
  const south = grid.south + rowOf(grid, index) * grid.latStep
  const west = grid.west + colOf(grid, index) * grid.lngStep
  return { south, west, north: south + grid.latStep, east: west + grid.lngStep }
}

/**
 * Every cell on the board, in index order.
 * @param {CellGrid} grid - The grid
 * @returns {Array<number>} Their indexes
 */
export function cellIndexes(grid) {
  const indexes = []
  for (let index = 0; index < grid.present.length; index++) {
    if (grid.present[index]) indexes.push(index)
  }
  return indexes
}

/**
 * The row and column a point falls in, whether or not that cell is on the
 * board.
 * @param {{lat: number, lng: number}} point - The point
 * @param {CellGrid} grid - The grid
 * @returns {{row: number, col: number}} Possibly off the grid
 */
function placeOf({ lat, lng }, grid) {
  return {
    row: Math.floor((lat - grid.south) / grid.latStep),
    col: Math.floor((lng - grid.west) / grid.lngStep)
  }
}

/**
 * The cell whose edges a point lies within, if it is on the board. Unlike
 * `findCell`, a point in a hole or off the grid is in no cell at all, rather
 * than being given the nearest one.
 * @param {{lat: number, lng: number}} point - The point
 * @param {CellGrid} grid - The grid
 * @returns {number} The cell's index, or -1
 */
export function cellContaining(point, grid) {
  const { row, col } = placeOf(point, grid)
  return cellAt(grid, row, col)
}

/**
 * Finds the cell a point lies in: the one whose center is nearest.
 *
 * For a point inside a cell on the board, that is simply the cell it falls
 * in, found by arithmetic: the cells are a grid of equal rectangles, and the
 * nearest center to any point in a rectangle is that rectangle's own.
 *
 * A point in a hole, or off the grid altogether, gets the nearest cell that
 * is on the board, searched for outward from where it falls, ring by ring.
 * Distances are measured on a flat projection (longitude shrunk by the
 * cosine of the latitude), as they always have been: at the size of a grid
 * cell the difference from the globe is nothing.
 *
 * @param {{lat: number, lng: number}} point - The point
 * @param {CellGrid|null} grid - The grid
 * @returns {number} The cell's index, or -1 for an empty grid
 */
export function findCell(point, grid) {
  if (isEmptyGrid(grid)) return -1
  const inside = cellContaining(point, grid)
  if (inside !== -1) return inside
  const { row, col } = placeOf(point, grid)
  return nearestCell(point, row, col, grid)
}

/**
 * The cell on the board with the center nearest a point that is in a hole or
 * off the grid (see `findCell`).
 *
 * The search goes out in square rings around the place the point falls:
 * ring k is every cell k rows or columns away, at most. A cell in ring k is
 * at least k - ½ cells from the point in one direction or the other, so once
 * the nearest found is closer than that, no ring further out can do better
 * and the search stops.
 *
 * @param {{lat: number, lng: number}} point - The point
 * @param {number} row - The row it falls in (may be off the grid)
 * @param {number} col - The column it falls in (may be off the grid)
 * @param {CellGrid} grid - The grid, with at least one cell
 * @returns {number} The nearest cell's index
 */
function nearestCell(point, row, col, grid) {
  const lngScale = Math.cos((point.lat * Math.PI) / 180)
  const rowSize = grid.latStep
  const colSize = grid.lngStep * lngScale
  // The least distance one row or column of cells can be across
  const step = Math.min(rowSize, colSize)

  /** Squared distance from the point to a cell's center */
  const distanceTo = (r, c) => {
    const dLat = point.lat - (grid.south + (r + 0.5) * grid.latStep)
    const dLng = (point.lng - (grid.west + (c + 0.5) * grid.lngStep)) * lngScale
    return dLat * dLat + dLng * dLng
  }

  // Rings nearer than the grid's edge hold no cells at all, so start at the
  // first ring that reaches the grid; stop after the last that touches it
  const rowsOff = row < 0 ? -row : row >= grid.rows ? row - grid.rows + 1 : 0
  const colsOff = col < 0 ? -col : col >= grid.cols ? col - grid.cols + 1 : 0
  const firstRing = Math.max(rowsOff, colsOff)
  const lastRing = Math.max(row, grid.rows - 1 - row, col, grid.cols - 1 - col)

  let nearest = -1
  let nearestDistance = Infinity
  /** Considers one cell, if it is on the board */
  const consider = (r, c) => {
    const index = cellAt(grid, r, c)
    if (index === -1) return
    const distance = distanceTo(r, c)
    if (distance < nearestDistance) {
      nearest = index
      nearestDistance = distance
    }
  }

  for (let ring = firstRing; ring <= lastRing; ring++) {
    const reach = Math.max(0, ring - 0.5) * step
    if (nearest !== -1 && nearestDistance <= reach * reach) break

    // The ring's rows, clipped to the grid: its top and bottom rows are
    // walked in full, the rows between only at its two ends
    const top = Math.max(0, row - ring)
    const bottom = Math.min(grid.rows - 1, row + ring)
    for (let r = top; r <= bottom; r++) {
      if (Math.abs(r - row) === ring) {
        const left = Math.max(0, col - ring)
        const right = Math.min(grid.cols - 1, col + ring)
        for (let c = left; c <= right; c++) consider(r, c)
      } else {
        consider(r, col - ring)
        if (ring > 0) consider(r, col + ring)
      }
    }
  }
  return nearest
}

/**
 * The up to eight cells around one, on the board.
 *
 * A diagonal step between two cells passes the corner the two cells beside
 * it share, so each diagonal neighbor comes with those two `sides`: a line
 * may only cut the corner if it could go through both (see botPathfinder.js).
 *
 * @param {CellGrid} grid - The grid
 * @param {number} index - The cell
 * @returns {Array<{index: number, sides: Array<number>}>} Each neighbor, and
 *   for a diagonal one the two cells beside the step (either may be -1)
 */
export function cellNeighbors(grid, index) {
  const row = rowOf(grid, index)
  const col = colOf(grid, index)
  const list = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const next = cellAt(grid, row + dr, col + dc)
      if (next === -1) continue
      const sides = dr && dc ? [cellAt(grid, row + dr, col), cellAt(grid, row, col + dc)] : []
      list.push({ index: next, sides })
    }
  }
  return list
}

/**
 * How many rows or columns apart two cells are, whichever is more: the
 * fewest steps between them for a line that may step diagonally.
 * @param {CellGrid} grid - The grid
 * @param {number} a - A cell
 * @param {number} b - Another cell
 * @returns {number} Steps
 */
export function stepsBetween(grid, a, b) {
  return Math.max(
    Math.abs(rowOf(grid, a) - rowOf(grid, b)),
    Math.abs(colOf(grid, a) - colOf(grid, b))
  )
}

/** The typed arrays a grid holds, by name, and the kind each is */
const ARRAYS = {
  present: Uint8Array,
  elevation: Float32Array,
  landCover: Uint16Array,
  cost: Float32Array
}

/**
 * A typed array's bytes as base64 text.
 *
 * Bytes are written in the machine's own order, which is little-endian on
 * every computer and phone a browser game will meet, so a grid packed on one
 * reads back on another.
 *
 * @param {ArrayBufferView} array - The array
 * @returns {string} Base64
 */
function toBase64(array) {
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength)
  // String.fromCharCode takes its bytes as arguments, and a few hundred
  // thousand arguments overflow the stack, so the bytes go in pieces
  let binary = ''
  const PIECE = 0x8000
  for (let i = 0; i < bytes.length; i += PIECE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + PIECE))
  }
  return btoa(binary)
}

/**
 * A typed array back from base64 text (see `toBase64`).
 * @param {string} text - Base64
 * @param {Function} Kind - The typed array's constructor
 * @returns {ArrayBufferView} The array
 */
function fromBase64(text, Kind) {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Kind(bytes.buffer)
}

/**
 * A grid as plain JSON-safe data, for saving: its shape as numbers and its
 * arrays as base64 text. About 15 bytes of text per cell, against well over
 * a hundred for the cell objects saves held before.
 * @param {CellGrid} grid - The grid
 * @returns {Object} The packed grid
 */
export function packGrid(grid) {
  const { rows, cols, south, west, latStep, lngStep } = grid
  const packed = { rows, cols, south, west, latStep, lngStep }
  Object.keys(ARRAYS).forEach((name) => {
    packed[name] = toBase64(grid[name])
  })
  return packed
}

/**
 * A grid back from saved data (see `packGrid`).
 *
 * Anything else — a grid saved in the old list-of-cells form, or a damaged
 * one — gives null rather than a grid that would price track wrongly.
 *
 * @param {*} packed - What was saved
 * @returns {CellGrid|null} The grid, or null if the data is not a packed grid
 */
export function unpackGrid(packed) {
  if (!packed || typeof packed !== 'object' || Array.isArray(packed)) return null
  const { rows, cols, south, west, latStep, lngStep } = packed
  const shape = [rows, cols, south, west, latStep, lngStep]
  if (!shape.every(Number.isFinite) || !Number.isInteger(rows) || !Number.isInteger(cols)) {
    return null
  }
  // A grid with no size, or cells of no size, would find no cell for any point
  if (rows <= 0 || cols <= 0 || latStep <= 0 || lngStep <= 0) return null

  const grid = { rows, cols, south, west, latStep, lngStep, count: 0 }
  try {
    for (const [name, Kind] of Object.entries(ARRAYS)) {
      if (typeof packed[name] !== 'string') return null
      const array = fromBase64(packed[name], Kind)
      if (array.length !== rows * cols) return null
      grid[name] = array
    }
  } catch {
    // Not base64, or a byte count that does not divide into the array's kind
    return null
  }
  grid.count = grid.present.reduce((total, flag) => total + (flag ? 1 : 0), 0)
  return grid
}
