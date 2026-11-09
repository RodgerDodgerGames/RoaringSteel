/**
 * Town Sizes Tests
 *
 * The biggest towns on a board are its major cities, the next its medium
 * towns, each a share of the board's towns. A board needs at least one major
 * city, since the game is won by joining them, and a lopsided board — one
 * city far bigger than the rest — must still get a few of each.
 */

import { describe, it, expect } from 'vitest'
import { sizeCounts, assignSizes } from '@/composables/setup/townSizes'

/** Wisconsin's metro and micro areas with their main city in the state, 2023 */
const WISCONSIN = [
  ['Milwaukee', 1566361],
  ['Madison', 683967],
  ['Green Bay', 329375],
  ['Appleton', 244163],
  ['Racine', 196888],
  ['Eau Claire', 172886],
  ['Oshkosh', 171357],
  ['Kenosha', 168413],
  ['Janesville', 163944],
  ['La Crosse', 151177],
  ['Wausau', 138067],
  ['Sheboygan', 117783],
  ['Whitewater', 105447],
  ['Fond du Lac', 104053],
  ['Beaver Dam', 88818],
  ['Watertown', 85867],
  ['Manitowoc', 81314],
  ['Wisconsin Rapids', 74039],
  ['Stevens Point', 70375],
  ['Baraboo', 65759],
  ['Platteville', 51678],
  ['Rice Lake', 46741],
  ['Sparta', 46169],
  ['Menomonie', 45349],
  ['Shawano', 45183],
  ['Marinette', 41907]
].map(([name, population]) => ({ name, population }))

/** The names of the towns given a size */
const named = (towns, size) => towns.filter((town) => town.size === size).map((t) => t.name)

describe('assignSizes', () => {
  it('should give Wisconsin two major cities and two medium towns, though Milwaukee dwarfs the rest', () => {
    const towns = assignSizes(WISCONSIN.map((town) => ({ ...town })))

    expect(named(towns, 'large')).toEqual(['Milwaukee', 'Madison'])
    expect(named(towns, 'medium')).toEqual(['Green Bay', 'Appleton'])
    expect(named(towns, 'small')).toHaveLength(22)
  })

  it('should size towns by population, whatever order they come in', () => {
    const towns = assignSizes([
      { name: 'Small', population: 10 },
      { name: 'Big', population: 1000 },
      { name: 'Middle', population: 100 }
    ])

    expect(named(towns, 'large')).toEqual(['Big'])
    expect(named(towns, 'medium')).toEqual(['Middle'])
    expect(named(towns, 'small')).toEqual(['Small'])
  })
})

describe('sizeCounts', () => {
  it('should give a board with any towns at least one major city', () => {
    expect(sizeCounts(1).large).toBe(1)
    expect(sizeCounts(5).large).toBe(1)
  })

  it('should give a board of three or more towns at least one medium town', () => {
    expect(sizeCounts(2).medium).toBe(0)
    expect(sizeCounts(3).medium).toBe(1)
  })

  it('should grow the major cities and medium towns with the board', () => {
    expect(sizeCounts(50)).toEqual({ large: 4, medium: 4 })
  })

  it('should follow the shares it is given', () => {
    expect(sizeCounts(20, { largeShare: 0.1, mediumShare: 0.25 })).toEqual({ large: 2, medium: 5 })
  })

  it('should have nothing to size on a board with no towns', () => {
    expect(sizeCounts(0)).toEqual({ large: 0, medium: 0 })
  })
})
