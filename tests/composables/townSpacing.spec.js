/**
 * Town Spacing Tests
 *
 * No two towns on a board may be closer than the spacing distance. Major and
 * medium cities too close together are merged into one town, which is sized
 * by its combined people and given its industries from all its areas' jobs;
 * the board keeps its counts of major and medium cities. Small towns too
 * close to another are left off, a town that alone makes something kept
 * ahead of a bigger one.
 */

import { describe, it, expect } from 'vitest'
import { mergeCities, combinedJobs, thinTowns } from '@/composables/setup/townSpacing'

/** How close two towns may be, in km, in these tests */
const KM = 40

/**
 * Degrees of latitude between two towns on the same meridian: 0.2 is about
 * 22 km, well inside the spacing distance; 1 is about 111 km, well outside
 */
const NEAR = 0.2
const FAR = 1

/**
 * A town on one meridian, so how far apart two are is just the difference in
 * their latitudes. Its area code is its name, to keep the tests readable.
 * @param {string} name - The town's name, and its area code
 * @param {number} population - Its people
 * @param {number} lat - Its latitude
 * @param {Object} [more] - Anything else, such as size or industries
 * @returns {Object} The town
 */
function town(name, population, lat, more = {}) {
  return {
    msa: name,
    name,
    fullName: `${name} area`,
    population,
    lon: -93,
    lat,
    industries: [],
    ...more
  }
}

/** A small town that makes the industries with these codes */
function smallMaker(name, population, lat, ...codes) {
  return town(name, population, lat, {
    size: 'small',
    industries: codes.map((code) => ({ name: `Industry ${code}`, industry: code }))
  })
}

/** The towns' names */
const names = (towns) => towns.map(({ name }) => name)

/** A town's size, by its name */
const sizeOf = (towns, name) => towns.find((t) => t.name === name).size

describe('mergeCities', () => {
  /** A major and a medium city close together, and two small towns far off */
  const triangle = () => [
    town('Raleigh', 1500000, 0),
    town('Durham', 600000, NEAR),
    town('Fayetteville', 400000, 5),
    town('Wilson', 80000, 10)
  ]

  it('should make one town of a major and a medium city too close together', () => {
    const { towns, areasOf } = mergeCities(triangle(), { large: 1, medium: 1 }, KM)

    expect(names(towns)).toEqual(['Raleigh-Durham', 'Fayetteville', 'Wilson'])
    // At the bigger city's spot, under its area code, with everyone's people
    expect(towns[0]).toMatchObject({
      msa: 'Raleigh',
      lat: 0,
      population: 2100000,
      fullName: 'Raleigh area / Durham area'
    })
    expect(areasOf).toEqual(new Map([['Raleigh', ['Raleigh', 'Durham']]]))
  })

  it("should keep the board's counts of major and medium cities, promoting the next town", () => {
    const { towns } = mergeCities(triangle(), { large: 1, medium: 1 }, KM)

    expect(sizeOf(towns, 'Raleigh-Durham')).toBe('large')
    expect(sizeOf(towns, 'Fayetteville')).toBe('medium')
    expect(sizeOf(towns, 'Wilson')).toBe('small')
  })

  it('should leave major and medium cities further apart alone', () => {
    const spread = triangle()
    spread[1].lat = FAR

    const { towns, areasOf } = mergeCities(spread, { large: 1, medium: 1 }, KM)

    expect(names(towns)).toEqual(['Raleigh', 'Durham', 'Fayetteville', 'Wilson'])
    expect(sizeOf(towns, 'Durham')).toBe('medium')
    expect(areasOf.size).toBe(0)
  })

  it('should never merge a small town, however close', () => {
    const towns = [
      town('Raleigh', 1500000, 0),
      town('Durham', 600000, FAR),
      town('Cary', 50000, NEAR)
    ]

    const { towns: merged } = mergeCities(towns, { large: 1, medium: 1 }, KM)

    expect(names(merged)).toEqual(['Raleigh', 'Durham', 'Cary'])
    expect(sizeOf(merged, 'Cary')).toBe('small')
  })

  it('should size a merged town by its combined people', () => {
    // Two medium cities that together outgrow the major city
    const towns = [
      town('Denver', 1000000, 0),
      town('Fort Collins', 600000, 5),
      town('Greeley', 500000, 5 + NEAR),
      town('Laramie', 40000, 10)
    ]

    const { towns: merged } = mergeCities(towns, { large: 1, medium: 2 }, KM)

    expect(sizeOf(merged, 'Fort Collins-Greeley')).toBe('large')
    expect(sizeOf(merged, 'Denver')).toBe('medium')
    expect(sizeOf(merged, 'Laramie')).toBe('medium')
  })

  it('should merge a chain of close cities into the biggest, though its ends are far apart', () => {
    // A and C are about 67 km apart, but each is close to B
    const towns = [
      town('A', 1000000, 0),
      town('B', 800000, 0.3),
      town('C', 600000, 0.6),
      town('D', 10000, 10)
    ]

    const { towns: merged, areasOf } = mergeCities(towns, { large: 1, medium: 2 }, KM)

    expect(names(merged)).toEqual(['A-B-C', 'D'])
    expect(merged[0].population).toBe(2400000)
    expect(areasOf.get('A')).toEqual(['A', 'B', 'C'])
  })

  it('should pass over a town too close to a big city when promoting, leaving it small', () => {
    // Big and Mid merge, freeing Mid's place. Near is next in line but close
    // to Big, so it stays small (to be thinned), and Far is promoted instead.
    const towns = [
      town('Big', 1000000, 0),
      town('Mid', 500000, NEAR),
      town('Near', 100000, -NEAR),
      town('Far', 10000, 10)
    ]

    const { towns: merged, areasOf } = mergeCities(towns, { large: 1, medium: 1 }, KM)

    expect(names(merged)).toEqual(['Big-Mid', 'Near', 'Far'])
    expect(sizeOf(merged, 'Near')).toBe('small')
    expect(sizeOf(merged, 'Far')).toBe('medium')
    expect(areasOf).toEqual(new Map([['Big', ['Big', 'Mid']]]))
  })

  it('should not promote two towns too close to each other', () => {
    // Two merges free two places. P and Q, next in line, are far from the
    // big cities but close to each other: only the bigger is promoted.
    const towns = [
      town('A', 1000000, 0),
      town('A2', 900000, NEAR),
      town('B', 800000, 5),
      town('B2', 700000, 5 + NEAR),
      town('P', 100000, 10),
      town('Q', 90000, 10 + NEAR),
      town('R', 80000, 15)
    ]

    const { towns: merged } = mergeCities(towns, { large: 2, medium: 2 }, KM)

    expect(merged.map(({ name, size }) => [name, size])).toEqual([
      ['A-A2', 'large'],
      ['B-B2', 'large'],
      ['P', 'medium'],
      ['Q', 'small'],
      ['R', 'medium']
    ])
  })

  it('should not change the towns it is given', () => {
    const given = triangle().map((t) => Object.freeze(t))

    mergeCities(given, { large: 1, medium: 1 }, KM)

    expect(given[0].size).toBeUndefined()
    expect(given[0].name).toBe('Raleigh')
  })
})

describe('combinedJobs', () => {
  const employment = () => [
    { industry: 1, meanEmp: { Raleigh: 100, Durham: 50, Wilson: 7 } },
    { industry: 2, meanEmp: { Durham: 30 } }
  ]
  const totalJobs = () => ({ Raleigh: 1000, Durham: 500, Wilson: 70 })
  const merged = new Map([['Raleigh', ['Raleigh', 'Durham']]])

  it("should add a merged town's areas together under its own code, in every industry", () => {
    const jobs = combinedJobs(employment(), totalJobs(), merged)

    expect(jobs.employment[0].meanEmp).toMatchObject({ Raleigh: 150, Wilson: 7 })
    // Jobs only the smaller city had
    expect(jobs.employment[1].meanEmp.Raleigh).toBe(30)
    expect(jobs.totalJobs).toMatchObject({ Raleigh: 1500, Wilson: 70 })
  })

  it('should not change the jobs it is given', () => {
    const given = employment()
    const totals = totalJobs()

    combinedJobs(given, totals, merged)

    expect(given[0].meanEmp.Raleigh).toBe(100)
    expect(totals.Raleigh).toBe(1000)
  })

  it('should give the jobs back as they are when nothing was merged', () => {
    const given = employment()
    const totals = totalJobs()

    const jobs = combinedJobs(given, totals, new Map())

    expect(jobs.employment).toBe(given)
    expect(jobs.totalJobs).toBe(totals)
  })
})

describe('thinTowns', () => {
  it('should leave off a small town too close to a bigger one', () => {
    const towns = [
      smallMaker('Sunbury', 109000, 0),
      smallMaker('Selinsgrove', 40000, NEAR),
      smallMaker('Williamsport', 113000, FAR)
    ]

    expect(names(thinTowns(towns, KM))).toEqual(['Sunbury', 'Williamsport'])
  })

  it('should keep major and medium cities, whatever is near them', () => {
    const towns = [
      town('Denver', 3000000, 0, { size: 'large' }),
      town('Boulder', 330000, NEAR, { size: 'medium' }),
      smallMaker('Longmont', 100000, 2 * NEAR)
    ]

    expect(names(thinTowns(towns, KM))).toEqual(['Denver', 'Boulder'])
  })

  it('should keep a small town that alone makes something ahead of a bigger one', () => {
    // Rocky Mount makes only what a town far off makes too; Wilson is the
    // board's only tobacco town
    const towns = [
      smallMaker('Rocky Mount', 145000, 0, 1),
      smallMaker('Wilson', 79000, NEAR, 2),
      smallMaker('Greenville', 177000, FAR, 1)
    ]

    expect(names(thinTowns(towns, KM))).toEqual(['Wilson', 'Greenville'])
  })

  it('should not count a town as the only maker of what another town makes too', () => {
    const towns = [
      smallMaker('Big', 100000, 0),
      smallMaker('Little', 60000, NEAR, 7),
      smallMaker('Elsewhere', 30000, FAR, 7)
    ]

    expect(names(thinTowns(towns, KM))).toEqual(['Big', 'Elsewhere'])
  })

  it('should leave off a town that alone makes something when it is too close to a big city', () => {
    const towns = [
      town('Ogden', 653000, 0, { size: 'medium' }),
      smallMaker('Brigham City', 66000, NEAR, 5)
    ]

    expect(names(thinTowns(towns, KM))).toEqual(['Ogden'])
  })

  it('should keep the bigger of two towns that each alone make something, too close together', () => {
    const towns = [smallMaker('Amsterdam', 50000, NEAR, 2), smallMaker('Gloversville', 52000, 0, 1)]

    expect(names(thinTowns(towns, KM))).toEqual(['Gloversville'])
  })

  it('should let only the towns kept crowd others out, and keep the order given', () => {
    // B is too close to A and goes; C is too close to B but not to A, so it
    // stays
    const towns = [
      smallMaker('C', 100000, 0.6),
      smallMaker('A', 300000, 0),
      smallMaker('B', 200000, 0.3)
    ]

    expect(names(thinTowns(towns, KM))).toEqual(['C', 'A'])
  })
})
