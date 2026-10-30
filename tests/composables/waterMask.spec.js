/**
 * Water Mask Tests
 *
 * The map shades every grid cell the game counts as water, so players can
 * see where a bridge is needed. The water is one picture laid over the grid;
 * the map stretches it unevenly north to south, so its rows must be drawn
 * where each row of cells will actually land.
 */

import { describe, it, expect } from 'vitest'
import { waterPicture } from '@/composables/map/waterMask'
import { nlcdCostMap } from '@/config/nlcd'
import { makeTestGrid, CELL } from '../utils/testGrid'

const WATER = nlcdCostMap[11]
const FARM = nlcdCostMap[82]

/** Whether the picture's pixel at a column and row (from the top) is water */
const isShaded = (picture, col, y) => picture.pixels[(y * picture.width + col) * 4 + 3] > 0

/** The latitude the map puts the middle of a row of pixels at (Web Mercator) */
function latitudeOfPixelRow(picture, y) {
  const project = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
  const top = project(picture.bounds.north)
  const bottom = project(picture.bounds.south)
  const projected = top - ((y + 0.5) / picture.height) * (top - bottom)
  return (Math.atan(Math.exp(projected)) * 360) / Math.PI - 90
}

describe('waterPicture', () => {
  it('should shade water cells and leave land alone', () => {
    // A lake in the west cell, a farm in the east
    const grid = makeTestGrid({
      rows: 1,
      cols: 2,
      south: 40,
      west: -100,
      cell: (row, col) => ({ landCover: col === 0 ? WATER : FARM })
    })

    const picture = waterPicture(grid)

    expect(picture.width).toBe(2)
    for (let y = 0; y < picture.height; y++) {
      expect(isShaded(picture, 0, y)).toBe(true)
      expect(isShaded(picture, 1, y)).toBe(false)
    }
  })

  it('should cover the whole grid', () => {
    const grid = makeTestGrid({
      rows: 2,
      cols: 3,
      south: 40,
      west: -100,
      cell: () => ({ landCover: WATER })
    })

    expect(waterPicture(grid).bounds).toEqual({
      south: 40,
      west: -100,
      north: 40 + 2 * CELL,
      east: -100 + 3 * CELL
    })
  })

  it('should give no picture when there is no water', () => {
    const grid = makeTestGrid({ rows: 2, cols: 2, cell: () => ({ landCover: FARM }) })

    expect(waterPicture(grid)).toBeNull()
    expect(waterPicture(null)).toBeNull()
  })

  it('should put a row of water where the map will draw that row, across a state as tall as Texas', () => {
    // 120 rows from 26°N to about 36.8°N, water only in row 60
    const grid = makeTestGrid({
      rows: 120,
      cols: 1,
      south: 26,
      west: -100,
      cell: (row) => ({ landCover: row === 60 ? WATER : FARM })
    })
    const rowSouth = 26 + 60 * CELL
    const rowNorth = rowSouth + CELL

    const picture = waterPicture(grid)

    // Every pixel the map puts inside row 60 is water, and no other
    for (let y = 0; y < picture.height; y++) {
      const lat = latitudeOfPixelRow(picture, y)
      expect(isShaded(picture, 0, y)).toBe(lat >= rowSouth && lat < rowNorth)
    }
  })
})
