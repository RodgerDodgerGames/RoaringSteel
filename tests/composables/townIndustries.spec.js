/**
 * Town Industries Tests
 *
 * A board plays with some of the game's industries: more on a bigger board,
 * between a floor and a ceiling, taken a category at a time so every kind of
 * work is there. Each industry goes to the towns where it is most
 * concentrated, a town making at most three things and an industry going to
 * no more than its share of the board's jobs (held to 20%) of the towns.
 */

import { describe, it, expect } from 'vitest'
import {
  assignIndustries,
  boardEmployment,
  chooseIndustries,
  industryCount,
  naturalBreaks
} from '@/composables/setup/townIndustries'

/** The knobs, spelled out so the tests do not move when config/towns.js does */
const CONFIG = {
  industriesPerTown: 0.75,
  minIndustries: 10,
  maxIndustries: 30,
  minJobShare: 0.001,
  maxPerTown: 3,
  maxTownShare: 0.2
}

/**
 * An industry's jobs data, as the industry store has it.
 * @param {number} code - Its NAICS code
 * @param {string} category - Its kind
 * @param {Object} meanEmp - Its jobs by area
 * @returns {Object} The industry
 */
const industry = (code, category, meanEmp) => ({
  industry: code,
  category,
  label: `I${code}`,
  meanEmp
})

/**
 * A town on the board.
 * @param {string} msa - Its area's code
 * @param {number} population - Its people
 * @param {Array<string>} [makes] - What it makes already
 * @returns {Object} The town
 */
const town = (msa, population, makes = []) => ({
  msa,
  name: `Town ${msa}`,
  population,
  industries: makes.map((name) => ({ name }))
})

describe('industryCount', () => {
  it('should give a board a share of its towns, between the floor and the ceiling', () => {
    expect(industryCount(9, 100, CONFIG)).toBe(10)
    expect(industryCount(23, 100, CONFIG)).toBe(17)
    expect(industryCount(30, 100, CONFIG)).toBe(23)
    expect(industryCount(80, 300, CONFIG)).toBe(30)
  })

  it('should give no more industries than the towns have room for', () => {
    expect(industryCount(2, 5, CONFIG)).toBe(5)
  })
})

describe('boardEmployment', () => {
  it('should count only the jobs in areas whose towns are on the board', () => {
    // Area 2's town is off the board
    const [steel] = boardEmployment([industry(1, 'Metals', { 1: 100, 2: 900 })], [town('1', 1000)])

    expect(steel.meanEmp).toEqual({ 1: 100 })
  })

  it('should keep the choice from taking an industry no town on the board has', () => {
    const employment = boardEmployment(
      [industry(1, 'Metals', { 2: 900 }), industry(2, 'Farm', { 1: 100 })],
      [town('1', 1000)]
    )

    expect(chooseIndustries(employment, 2, CONFIG).map(({ industry: code }) => code)).toEqual([2])
  })
})

describe('chooseIndustries', () => {
  /** A farming board: lots of farms, a little of everything else */
  const EMPLOYMENT = [
    industry(1, 'Farm', { A: 5000 }),
    industry(2, 'Farm', { A: 4000 }),
    industry(3, 'Farm', { A: 3000 }),
    industry(4, 'Food', { A: 2000 }),
    industry(5, 'Food', { A: 1000 }),
    industry(6, 'Metals', { A: 500 }),
    // A sliver of the board's jobs: under 0.1% of them
    industry(7, 'Mining', { A: 10 })
  ]

  it('should take each category in turn, the one with the most jobs first', () => {
    const chosen = chooseIndustries(EMPLOYMENT, 4, CONFIG)

    // Farm, Food, Metals, then Farm's second
    expect(chosen.map(({ industry: code }) => code)).toEqual([1, 4, 6, 2])
  })

  it('should pass over an industry with only a sliver of the board’s jobs', () => {
    const chosen = chooseIndustries(EMPLOYMENT, 10, CONFIG)

    expect(chosen.map(({ industry: code }) => code)).not.toContain(7)
    expect(chosen).toHaveLength(6)
  })

  it('should choose nothing from a board with no jobs', () => {
    expect(chooseIndustries([industry(1, 'Farm', {})], 5, CONFIG)).toEqual([])
  })
})

describe('naturalBreaks', () => {
  it('should split the values at their two widest gaps', () => {
    // Gaps of 1, 1, 8, 1, 9: breaks before 11 and before 21
    expect(naturalBreaks([1, 2, 3, 11, 12, 21], 3)).toEqual([0, 0, 0, 1, 1, 2])
  })

  it('should keep the values in the order given', () => {
    expect(naturalBreaks([21, 1, 12], 3)).toEqual([2, 0, 1])
  })

  it('should put a lone value in the highest class', () => {
    expect(naturalBreaks([5], 3)).toEqual([2])
  })
})

describe('assignIndustries', () => {
  it('should give an industry to the towns where it is most concentrated, not the biggest', () => {
    const towns = [town('big', 1000000), town('mill', 20000), town('other', 50000)]
    // Most of the jobs in the big town, but a far bigger share of the mill
    // town's people
    const steel = industry(1, 'Metals', { big: 3000, mill: 2000, other: 100 })

    const result = assignIndustries(towns, [steel], CONFIG)

    expect(result.find((t) => t.msa === 'mill').industries).toEqual([{ name: 'I1', industry: 1 }])
    expect(result.find((t) => t.msa === 'big').industries).toEqual([])
  })

  it('should never give a town more than three things, Tourism included', () => {
    const towns = [town('A', 1000, ['Tourism', 'Coal']), town('B', 1000)]
    const chosen = [1, 2, 3].map((code) => industry(code, 'Goods', { A: 900, B: 10 }))

    const result = assignIndustries(towns, chosen, CONFIG)

    expect(result[0].industries).toHaveLength(3)
  })

  it('should give an industry no more towns than its share of the jobs, held to 20%', () => {
    // Ten towns, and one industry with all the jobs: 20% of ten is two
    const towns = Array.from({ length: 10 }, (_, i) => town(`T${i}`, 1000))
    const meanEmp = Object.fromEntries(towns.map((t) => [t.msa, 500]))

    const result = assignIndustries(towns, [industry(1, 'Goods', meanEmp)], CONFIG)

    expect(result.filter((t) => t.industries.length > 0)).toHaveLength(2)
  })

  it('should give every industry at least one town, even a small one', () => {
    const towns = [town('A', 1000), town('B', 1000)]
    const big = industry(1, 'Goods', { A: 10000, B: 9000 })
    const small = industry(2, 'Farm', { A: 5 })

    const result = assignIndustries(towns, [big, small], CONFIG)

    expect(result.flatMap((t) => t.industries.map((i) => i.industry))).toContain(2)
  })

  it('should let each industry take its best town before any takes its second', () => {
    // One town with room for one more, the best town for both industries.
    // The first listed gets it; the second still gets a town of its own.
    const towns = [
      town('best', 1000, ['Tourism', 'Coal']),
      ...Array.from({ length: 9 }, (_, i) => town(`T${i}`, 1000))
    ]
    const meanEmp = (best) => ({
      best,
      ...Object.fromEntries(towns.slice(1).map((t) => [t.msa, 1]))
    })
    const first = industry(1, 'Goods', meanEmp(900))
    const second = industry(2, 'Farm', meanEmp(800))

    const result = assignIndustries(towns, [first, second], CONFIG)
    const townsOf = (code) =>
      result.filter((t) => t.industries.some((i) => i.industry === code)).map((t) => t.msa)

    expect(townsOf(1)).toContain('best')
    expect(townsOf(2).length).toBeGreaterThan(0)
    expect(townsOf(2)).not.toContain('best')
  })

  it('should let the industry with fewer towns to choose from choose first', () => {
    // One place left in each of two towns. Plastics, listed first, is made in
    // both; Copper only in the first. Copper must get it, Plastics the other.
    const towns = [town('X', 1000, ['Tourism', 'Coal']), town('Y', 1000, ['Fish', 'Cattle'])]
    const plastics = industry(1, 'Materials', { X: 900, Y: 800 })
    const copper = industry(2, 'Metals', { X: 500 })

    const result = assignIndustries(towns, [plastics, copper], CONFIG)

    expect(result.map((t) => t.industries.at(-1).industry)).toEqual([2, 1])
  })

  it('should give an industry a town where it is less concentrated when its best are full', () => {
    // Steel's high and medium classes are each one town, and both are full;
    // only its low class, B and C, has room
    const towns = [
      town('high', 1000, ['Tourism', 'Coal', 'Cattle']),
      town('medium', 1000, ['Fish', 'Coal', 'Cattle']),
      town('B', 100000),
      town('C', 100000)
    ]
    const steel = industry(1, 'Metals', { high: 900, medium: 300, B: 10, C: 11 })

    const result = assignIndustries(towns, [steel], CONFIG)

    // The more concentrated of the two
    expect(
      result.filter((t) => t.industries.some((i) => i.industry === 1)).map((t) => t.msa)
    ).toEqual(['C'])
  })

  it('should not use the less concentrated towns for an industry that already has one', () => {
    // Ten towns, so Steel may have two. Its high class is the mill town and
    // its medium class a full one; the rest, its low class, stay unused.
    const towns = [
      town('mill', 1000),
      town('full', 1000, ['Tourism', 'Coal', 'Cattle']),
      ...Array.from({ length: 8 }, (_, i) => town(`T${i}`, 100000))
    ]
    const meanEmp = {
      mill: 900,
      full: 300,
      ...Object.fromEntries(towns.slice(2).map((t) => [t.msa, 10]))
    }

    const result = assignIndustries(towns, [industry(1, 'Metals', meanEmp)], CONFIG)

    expect(
      result.filter((t) => t.industries.some((i) => i.industry === 1)).map((t) => t.msa)
    ).toEqual(['mill'])
  })

  it('should leave the towns it is given as they were', () => {
    const towns = [town('A', 1000)]

    assignIndustries(towns, [industry(1, 'Goods', { A: 100 })], CONFIG)

    expect(towns[0].industries).toEqual([])
  })
})
