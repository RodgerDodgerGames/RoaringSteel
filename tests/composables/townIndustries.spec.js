/**
 * Town Industries Tests
 *
 * Each town's industries are scored by their extra jobs: its jobs in an
 * industry beyond what an average town of its size would have. Pairs of
 * town and industry go out from the most extra jobs down, a town making at
 * most three things (Tourism included) and an industry going to at most a
 * share of the board's towns. Then the board is shaped: few towns keep a
 * third thing, not too many a second, and the weakest are emptied until
 * enough towns make nothing.
 */

import { describe, it, expect } from 'vitest'
import { assignIndustries, candidatePairs } from '@/composables/setup/townIndustries'
import { townIndustryConfig } from '@/config/towns'

/**
 * Settings with every board-wide limit open, so a test sees one rule at a
 * time: spelled out, so the tests do not move when config/towns.js does
 */
const OPEN = {
  minExtraShare: 0.005,
  maxPerTown: 3,
  maxTownShare: 1,
  maxThreeShare: 1,
  maxTwoShare: 1,
  minNoneShare: 0,
  undercountMultiplier: 2.5,
  undercountIndustries: [1121]
}

/**
 * An industry, as the towns store hands it over.
 * @param {number} code - Its NAICS code
 * @param {number} nationalShare - Its share of the country's jobs
 * @param {Object} meanEmp - Its jobs by area code
 * @returns {Object} The industry
 */
const industry = (code, nationalShare, meanEmp) => ({
  industry: code,
  label: `I${code}`,
  nationalShare,
  meanEmp
})

/**
 * A town on the board.
 * @param {string} msa - Its area's code
 * @param {Array<Object>} [industries] - What it makes already
 * @returns {Object} The town
 */
const town = (msa, industries = []) => ({ msa, name: `T${msa}`, industries })

/** Tourism, as the towns store gives it to a major city */
const TOURISM = { name: 'Tourism', industry: 9999 }

/**
 * The names of what a town makes.
 * @param {Object} t - The town
 * @returns {Array<string>} Its industries' names
 */
const names = (t) => t.industries.map(({ name }) => name)

/**
 * Towns that each make one thing, of differing strength: town i has i + 1
 * hundred jobs in industry 3116 out of 10,000.
 * @param {number} count - How many towns
 * @returns {{towns: Array, employment: Array, totalJobs: Object}} The board
 */
function oneEach(count) {
  const towns = Array.from({ length: count }, (_, i) => town(String(i)))
  const meanEmp = Object.fromEntries(towns.map((t, i) => [t.msa, (i + 1) * 100]))
  const totalJobs = Object.fromEntries(towns.map((t) => [t.msa, 10000]))
  return { towns, employment: [industry(3116, 0, meanEmp)], totalJobs }
}

describe('townIndustries', () => {
  describe('candidatePairs', () => {
    it("should score an industry by its jobs beyond an average town's of the same size", () => {
      // An average town of 10,000 jobs has 1% of them, 100, in meat
      const pairs = candidatePairs(
        [town('1')],
        [industry(3116, 0.01, { 1: 300 })],
        { 1: 10000 },
        OPEN
      )

      expect(pairs).toHaveLength(1)
      expect(pairs[0].extra).toBeCloseTo(200)
      expect(pairs[0].strength).toBeCloseTo(0.02)
    })

    it("should leave out an industry whose extra jobs are under 0.5% of the town's", () => {
      // 49 and 50 extra jobs out of 10,000
      const under = industry(3116, 0.01, { 1: 149 })
      const at = industry(3115, 0.01, { 1: 150 })

      const pairs = candidatePairs([town('1')], [under, at], { 1: 10000 }, OPEN)

      expect(pairs.map(({ industry }) => industry.industry)).toEqual([3115])
    })

    it('should leave out an industry a town has no more of than an average town', () => {
      const pairs = candidatePairs(
        [town('1')],
        [industry(3116, 0.05, { 1: 300 })],
        { 1: 10000 },
        OPEN
      )

      expect(pairs).toEqual([])
    })

    it('should leave out a town with no jobs data', () => {
      const pairs = candidatePairs([town('1')], [industry(3116, 0, { 1: 300 })], {}, OPEN)

      expect(pairs).toEqual([])
    })

    it("should multiply the farm industries' extra jobs, which the jobs data undercounts", () => {
      // 40 extra jobs: under the cutoff of 50, but 100 once multiplied
      const cattle = industry(1121, 0.01, { 1: 140 })
      const meat = industry(3116, 0.01, { 1: 140 })

      const pairs = candidatePairs([town('1')], [cattle, meat], { 1: 10000 }, OPEN)

      expect(pairs).toHaveLength(1)
      expect(pairs[0].industry).toBe(cattle)
      expect(pairs[0].extra).toBeCloseTo(100)
    })

    it('should put the pairs with the most extra jobs first', () => {
      const pairs = candidatePairs(
        [town('1'), town('2')],
        [industry(3116, 0, { 1: 100, 2: 300 }), industry(3115, 0, { 1: 200 })],
        { 1: 10000, 2: 10000 },
        OPEN
      )

      expect(pairs.map(({ extra }) => extra)).toEqual([300, 200, 100])
    })
  })

  describe('assignIndustries', () => {
    it('should give a town the three industries it has the most extra jobs in', () => {
      const employment = [
        industry(1, 0, { 1: 100 }),
        industry(2, 0, { 1: 400 }),
        industry(3, 0, { 1: 300 }),
        industry(4, 0, { 1: 200 })
      ]

      const [result] = assignIndustries([town('1')], employment, { 1: 10000 }, OPEN)

      expect(names(result)).toEqual(['I2', 'I3', 'I4'])
    })

    it("should count Tourism toward a town's three, and keep it first", () => {
      const employment = [
        industry(1, 0, { 1: 100 }),
        industry(2, 0, { 1: 300 }),
        industry(3, 0, { 1: 200 })
      ]

      const [result] = assignIndustries([town('1', [TOURISM])], employment, { 1: 10000 }, OPEN)

      expect(names(result)).toEqual(['Tourism', 'I2', 'I3'])
    })

    it('should hold an industry to its share of the towns, those with the most extra jobs keeping it', () => {
      // 20% of 10 towns: 2
      const { towns, employment, totalJobs } = oneEach(10)

      const result = assignIndustries(towns, employment, totalJobs, { ...OPEN, maxTownShare: 0.2 })

      const makers = result.filter((t) => t.industries.length > 0).map(({ msa }) => msa)
      expect(makers).toEqual(['8', '9'])
    })

    it('should let an industry go to one town however few towns its share comes to', () => {
      // 20% of 3 towns is less than one
      const { towns, employment, totalJobs } = oneEach(3)

      const result = assignIndustries(towns, employment, totalJobs, { ...OPEN, maxTownShare: 0.2 })

      expect(result.filter((t) => t.industries.length > 0)).toHaveLength(1)
    })

    it('should give a town its next industry when its best one has all the towns it may have', () => {
      // Town 2 has more meat than town 1, and meat may go to one town only
      const employment = [industry(3116, 0, { 1: 300, 2: 400 }), industry(3115, 0, { 1: 100 })]

      const result = assignIndustries(
        [town('1'), town('2'), town('3')],
        employment,
        { 1: 10000, 2: 10000, 3: 10000 },
        { ...OPEN, maxTownShare: 0.2 }
      )

      expect(names(result[0])).toEqual(['I3115'])
      expect(names(result[1])).toEqual(['I3116'])
    })

    it('should keep a third industry only in the towns that lean on it hardest', () => {
      // The big city has more extra jobs in its third industry, but it is a
      // bigger share of the small town's jobs. Half of 2 towns may keep three.
      const employment = [
        industry(1, 0, { small: 300, big: 30000 }),
        industry(2, 0, { small: 200, big: 20000 }),
        industry(3, 0, { small: 50, big: 2000 })
      ]

      const [small, big] = assignIndustries(
        [town('small'), town('big')],
        employment,
        { small: 1000, big: 100000 },
        { ...OPEN, maxThreeShare: 0.5 }
      )

      expect(names(small)).toEqual(['I1', 'I2', 'I3'])
      expect(names(big)).toEqual(['I1', 'I2'])
    })

    it('should keep a second industry only in the towns that lean on it hardest', () => {
      const employment = [
        industry(1, 0, { small: 300, big: 30000 }),
        industry(2, 0, { small: 200, big: 2000 })
      ]

      const [small, big] = assignIndustries(
        [town('small'), town('big')],
        employment,
        { small: 1000, big: 100000 },
        { ...OPEN, maxTwoShare: 0.5 }
      )

      expect(names(small)).toEqual(['I1', 'I2'])
      expect(names(big)).toEqual(['I1'])
    })

    it('should empty the towns whose one industry is weakest until enough make nothing', () => {
      // Half of 4 towns: the two with the fewest jobs in it
      const { towns, employment, totalJobs } = oneEach(4)

      const result = assignIndustries(towns, employment, totalJobs, { ...OPEN, minNoneShare: 0.5 })

      expect(result.map((t) => t.industries.length)).toEqual([0, 0, 1, 1])
    })

    it('should round the towns that make nothing up to a whole town, but not past it', () => {
      // 14% of 7 towns is 0.98: one town. Of 50 towns, 7, though the
      // arithmetic comes out a hair over.
      const settings = { ...OPEN, minNoneShare: 0.14 }
      const seven = oneEach(7)
      const fifty = oneEach(50)
      const empty = (result) => result.filter((t) => t.industries.length === 0).length

      expect(
        empty(assignIndustries(seven.towns, seven.employment, seven.totalJobs, settings))
      ).toBe(1)
      expect(
        empty(assignIndustries(fifty.towns, fifty.employment, fifty.totalJobs, settings))
      ).toBe(7)
    })

    it('should count the towns that make nothing already toward those that must', () => {
      // Town 0 has no jobs data, so it is empty from the start
      const { towns, employment, totalJobs } = oneEach(4)
      delete totalJobs['0']

      const result = assignIndustries(towns, employment, totalJobs, { ...OPEN, minNoneShare: 0.5 })

      expect(result.map((t) => t.industries.length)).toEqual([0, 0, 1, 1])
    })

    it('should never take Tourism away, nor empty a major city', () => {
      // Town 0 is a major city that makes nothing but Tourism
      const { towns, employment, totalJobs } = oneEach(4)
      towns[0].industries = [TOURISM]
      delete employment[0].meanEmp['0']

      const result = assignIndustries(towns, employment, totalJobs, { ...OPEN, minNoneShare: 0.5 })

      expect(names(result[0])).toEqual(['Tourism'])
      expect(result.map((t) => t.industries.length)).toEqual([1, 0, 0, 1])
    })

    it('should not change the towns it is given', () => {
      const { towns, employment, totalJobs } = oneEach(2)

      assignIndustries(towns, employment, totalJobs, OPEN)

      expect(towns.every((t) => t.industries.length === 0)).toBe(true)
    })

    it("should hold a board to the game's limits", () => {
      // 50 towns and 40 industries, each town with jobs in every industry,
      // more or fewer as a fixed pseudo-random sequence falls
      let seed = 7
      const next = () => (seed = (seed * 48271) % 2147483647) / 2147483647
      const towns = Array.from({ length: 50 }, (_, i) => town(String(i)))
      const totalJobs = Object.fromEntries(towns.map((t) => [t.msa, 5000 + next() * 200000]))
      const employment = Array.from({ length: 40 }, (_, i) =>
        industry(
          3000 + i,
          0.005,
          Object.fromEntries(towns.map((t) => [t.msa, totalJobs[t.msa] * 0.03 * next() ** 3]))
        )
      )

      const result = assignIndustries(towns, employment, totalJobs, townIndustryConfig)

      const shapes = result.map((t) => t.industries.length)
      const count = (n) => shapes.filter((s) => s === n).length
      // 8% of 50, rounded down; 40%; 14%, rounded up
      expect(count(3)).toBeLessThanOrEqual(4)
      expect(count(2)).toBeLessThanOrEqual(20)
      expect(count(0)).toBeGreaterThanOrEqual(7)
      // Not every town is empty
      expect(count(1) + count(2) + count(3)).toBeGreaterThan(0)
      // 12% of 50, rounded down
      const townsOf = new Map()
      result.forEach((t) =>
        t.industries.forEach(({ industry: code }) =>
          townsOf.set(code, (townsOf.get(code) ?? 0) + 1)
        )
      )
      expect(Math.max(...townsOf.values())).toBeLessThanOrEqual(6)
    })
  })
})
