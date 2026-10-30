/**
 * Cell Grid Tests
 *
 * The board's grid in rows and columns. Finding the cell a point is in must
 * give the same answer the old search over every cell gave — the cell with
 * the nearest center — including for points in the holes the sea leaves,
 * and points off the grid altogether. A grid saved and loaded again must be
 * the same grid.
 */

import { describe, it, expect } from 'vitest'
import {
  findCell,
  cellContaining,
  cellCenter,
  cellBounds,
  cellNeighbors,
  stepsBetween,
  cellIndexes,
  isEmptyGrid,
  packGrid,
  unpackGrid
} from '@/composables/map/cellGrid'
import { makeTestGrid, cellsOf, CELL } from '../utils/testGrid'
import { seededRandom } from '../utils/botBoard'

/**
 * The cell with the nearest center, by searching every cell: what pricing
 * used before the grid had rows and columns, kept here as the answer the
 * quick lookup must agree with.
 */
function nearestBySearch(point, grid) {
  const lngScale = Math.cos((point.lat * Math.PI) / 180)
  let nearest = -1
  let nearestDistance = Infinity
  cellIndexes(grid).forEach((index) => {
    const center = cellCenter(grid, index)
    const dLat = point.lat - center.lat
    const dLng = (point.lng - center.lng) * lngScale
    const distance = dLat * dLat + dLng * dLng
    if (distance < nearestDistance) {
      nearest = index
      nearestDistance = distance
    }
  })
  return nearest
}

/** A 6 x 8 grid in Maryland's latitudes, a quarter of its cells holes */
function holeyGrid(seed = 1) {
  const random = seededRandom(seed)
  return makeTestGrid({
    rows: 6,
    cols: 8,
    south: 38,
    west: -78,
    lngStep: CELL * 1.3,
    cell: (row, col) => (random() < 0.25 ? null : { cost: row * 10 + col })
  })
}

describe('cellGrid', () => {
  describe('findCell', () => {
    const grid = makeTestGrid({ rows: 3, cols: 4 })

    it('should find the cell a point lies in', () => {
      expect(findCell({ lat: 1.2 * CELL, lng: 2.9 * CELL }, grid)).toBe(1 * 4 + 2)
    })

    it('should find nothing on an empty grid, or none at all', () => {
      expect(
        findCell({ lat: 0, lng: 0 }, makeTestGrid({ rows: 2, cols: 2, cell: () => null }))
      ).toBe(-1)
      expect(findCell({ lat: 0, lng: 0 }, null)).toBe(-1)
    })

    it('should give a point in a hole the nearest cell on the board', () => {
      // Every cell of the middle row is a hole but the last
      const holed = makeTestGrid({
        rows: 3,
        cols: 4,
        cell: (row, col) => (row === 1 && col < 3 ? null : {})
      })

      // Just north of the middle of the hole's first cell: the row above is nearer
      expect(findCell({ lat: 1.6 * CELL, lng: 0.5 * CELL }, holed)).toBe(2 * 4 + 0)
      // Just south of it: the row below
      expect(findCell({ lat: 1.4 * CELL, lng: 0.5 * CELL }, holed)).toBe(0)
    })

    it('should give a point off the grid the nearest cell at its edge', () => {
      expect(findCell({ lat: -5 * CELL, lng: 1.5 * CELL }, grid)).toBe(1)
      expect(findCell({ lat: 10 * CELL, lng: 10 * CELL }, grid)).toBe(2 * 4 + 3)
    })

    it('should agree with a search of every cell, holes and all', () => {
      const random = seededRandom(7)
      for (let seed = 1; seed <= 5; seed++) {
        const grid = holeyGrid(seed)
        for (let probe = 0; probe < 200; probe++) {
          // Over the grid and a few cells around it
          const point = {
            lat: grid.south + (random() * 10 - 2) * grid.latStep,
            lng: grid.west + (random() * 12 - 2) * grid.lngStep
          }
          const found = findCell(point, grid)
          const searched = nearestBySearch(point, grid)
          // Two centers can be exactly as near; either is the nearest
          const distanceTo = (index) => {
            const center = cellCenter(grid, index)
            const lngScale = Math.cos((point.lat * Math.PI) / 180)
            return Math.hypot(point.lat - center.lat, (point.lng - center.lng) * lngScale)
          }
          expect(distanceTo(found)).toBeCloseTo(distanceTo(searched), 12)
        }
      }
    })
  })

  describe('cellContaining', () => {
    it('should give no cell for a point in a hole or off the grid', () => {
      const holed = makeTestGrid({ rows: 1, cols: 3, cell: (row, col) => (col === 1 ? null : {}) })

      expect(cellContaining({ lat: 0.5 * CELL, lng: 0.5 * CELL }, holed)).toBe(0)
      expect(cellContaining({ lat: 0.5 * CELL, lng: 1.5 * CELL }, holed)).toBe(-1)
      expect(cellContaining({ lat: 0.5 * CELL, lng: 9 * CELL }, holed)).toBe(-1)
    })
  })

  describe('cellCenter and cellBounds', () => {
    it('should place a cell by its row from the south and column from the west', () => {
      const grid = makeTestGrid({ rows: 2, cols: 3, south: 40, west: -100, lngStep: 0.2 })
      const index = 1 * 3 + 2

      expect(cellCenter(grid, index).lat).toBeCloseTo(40 + 1.5 * CELL, 12)
      expect(cellCenter(grid, index).lng).toBeCloseTo(-100 + 2.5 * 0.2, 12)
      const bounds = cellBounds(grid, index)
      expect(bounds.south).toBeCloseTo(40 + CELL, 12)
      expect(bounds.north).toBeCloseTo(40 + 2 * CELL, 12)
      expect(bounds.west).toBeCloseTo(-100 + 0.4, 12)
      expect(bounds.east).toBeCloseTo(-100 + 0.6, 12)
    })
  })

  describe('cellNeighbors', () => {
    it('should give the eight cells around one, leaving out holes and the edge', () => {
      const grid = makeTestGrid({
        rows: 3,
        cols: 3,
        cell: (row, col) => (row === 0 && col === 0 ? null : {})
      })

      expect(
        cellNeighbors(grid, 4)
          .map(({ index }) => index)
          .sort()
      ).toEqual([1, 2, 3, 5, 6, 7, 8])
      expect(
        cellNeighbors(grid, 8)
          .map(({ index }) => index)
          .sort()
      ).toEqual([4, 5, 7])
    })

    it('should give a diagonal step the two cells beside it', () => {
      const grid = makeTestGrid({ rows: 3, cols: 3 })

      const northEast = cellNeighbors(grid, 4).find(({ index }) => index === 8)
      expect(northEast.sides.sort()).toEqual([5, 7])
      const east = cellNeighbors(grid, 4).find(({ index }) => index === 5)
      expect(east.sides).toEqual([])
    })
  })

  describe('stepsBetween', () => {
    it('should count a diagonal step as one', () => {
      const grid = makeTestGrid({ rows: 5, cols: 5 })

      expect(stepsBetween(grid, 0, 4 * 5 + 2)).toBe(4)
    })
  })

  describe('packGrid and unpackGrid', () => {
    it('should give back the same grid', () => {
      const grid = holeyGrid()
      const unpacked = unpackGrid(JSON.parse(JSON.stringify(packGrid(grid))))

      expect(cellsOf(unpacked)).toEqual(cellsOf(grid))
      expect(unpacked.count).toBe(grid.count)
      expect(cellBounds(unpacked, 9)).toEqual(cellBounds(grid, 9))
    })

    it('should not read a grid saved as a list of cells', () => {
      const oldForm = [{ id: '0-0', centroid: { lat: 40, lng: -100 }, cost: 100 }]

      expect(unpackGrid(oldForm)).toBeNull()
      expect(unpackGrid({ cells: oldForm })).toBeNull()
      expect(unpackGrid(undefined)).toBeNull()
    })

    it('should not read a damaged grid', () => {
      const packed = packGrid(holeyGrid())

      expect(unpackGrid({ ...packed, cost: 'not base64!' })).toBeNull()
      expect(unpackGrid({ ...packed, rows: packed.rows + 1 })).toBeNull()
      expect(unpackGrid({ ...packed, present: undefined })).toBeNull()
      expect(unpackGrid({ ...packed, latStep: 0 })).toBeNull()
    })
  })

  describe('isEmptyGrid', () => {
    it('should count a grid of holes as empty', () => {
      expect(isEmptyGrid(makeTestGrid({ rows: 2, cols: 2, cell: () => null }))).toBe(true)
      expect(isEmptyGrid(makeTestGrid({ rows: 2, cols: 2 }))).toBe(false)
      expect(isEmptyGrid(null)).toBe(true)
    })
  })
})
