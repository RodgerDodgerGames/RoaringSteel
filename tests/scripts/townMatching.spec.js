/**
 * Town Matching Tests
 *
 * Tests for how scripts/build-town-points.mjs reads its sources and picks
 * each town's point.
 */

import { describe, it, expect } from 'vitest'
import {
  areasFromLists,
  choosePoint,
  downtown,
  matchKey,
  placesFromGnis
} from '../../scripts/townMatching.mjs'

const HEADER = 'feature_name|feature_class|state_numeric|county_numeric|prim_lat_dec|prim_long_dec'

/** GNIS's file, with these rows */
const gnis = (...rows) => placesFromGnis([HEADER, ...rows].join('\n'))

describe('areasFromLists', () => {
  const newer = [
    'CBSA,MDIV,STCOU,NAME,LSAD',
    '41860,,,"San Francisco-Oakland-Fremont, CA",Metropolitan Statistical Area',
    '41860,41884,,"San Francisco-San Mateo, CA",Metropolitan Division',
    '41860,41884,6075,"San Francisco County, CA",County or equivalent'
  ].join('\n')
  const older = [
    'CBSA,MDIV,STCOU,NAME,LSAD',
    '41860,,,"San Francisco-Oakland-Berkeley, CA",Metropolitan Statistical Area',
    '41860,,06001,"Alameda County, CA",County or equivalent',
    '17460,,,"Cleveland-Elyria, OH",Metropolitan Statistical Area',
    '17460,,39035,"Cuyahoga County, OH",County or equivalent'
  ].join('\n')

  it('should read areas and their counties, not their divisions', () => {
    expect(areasFromLists([newer])).toEqual([
      { code: '41860', name: 'San Francisco-Oakland-Fremont, CA', counties: new Set(['06075']) }
    ])
  })

  it('should take the newer list for an area in both, and keep areas only in the older', () => {
    const areas = areasFromLists([newer, older])

    expect(areas.map(({ name }) => name)).toEqual([
      'Cleveland-Elyria, OH',
      'San Francisco-Oakland-Fremont, CA'
    ])
    expect(areas[1].counties).toEqual(new Set(['06075']))
  })
})

describe('placesFromGnis', () => {
  it('should read populated places only, leaving out those with no point', () => {
    const places = gnis(
      'Yuma|Populated Place|04|027|32.7253|-114.6244',
      'Yuma|Civil|04|027|32.5|-114.5',
      'Nowhere|Populated Place|04|027|0.0|0.0'
    )

    expect([...places]).toEqual([['04:yuma', [{ lat: 32.7253, lon: -114.6244, county: '04027' }]]])
  })

  it('should read past a byte order mark', () => {
    const text = `\uFEFF${HEADER}\nYuma|Populated Place|04|027|32.7|-114.6`

    expect(placesFromGnis(text).has('04:yuma')).toBe(true)
  })

  it('should fail when a column it needs is gone', () => {
    expect(() => placesFromGnis('feature_name|feature_class')).toThrow('state_numeric')
  })
})

describe('matchKey', () => {
  it.each([
    ['Cañon City', 'Canon City'],
    ['Saint Louis', 'St. Louis'],
    ['Sault Sainte Marie', 'Sault Ste. Marie'],
    ["Coeur d'Alene", 'Coeur d Alene']
  ])('should match %s to %s', (a, b) => {
    expect(matchKey(a)).toBe(matchKey(b))
  })
})

describe('downtown', () => {
  it('should take the place in the area over a nearer one of the same name outside it', () => {
    const places = gnis(
      'Springfield|Populated Place|06|001|38.0|-122.0',
      'Springfield|Populated Place|06|075|37.5|-122.5'
    )
    const city = { name: 'Springfield', stateFips: '06', lat: 38.0, lon: -122.0 }
    const area = { counties: new Set(['06075']) }

    expect(downtown(area, city, ['Springfield'], places)).toMatchObject({ lat: 37.5 })
  })

  it('should take the one nearest the Census point of two in the area', () => {
    const places = gnis(
      'Marion|Populated Place|18|053|40.9|-85.1',
      'Marion|Populated Place|18|053|40.55|-85.66'
    )
    const city = { name: 'Marion', stateFips: '18', lat: 40.54, lon: -85.65 }
    const area = { counties: new Set(['18053']) }

    expect(downtown(area, city, ['Marion'], places)).toMatchObject({ lat: 40.55 })
  })

  it.each([
    ['Boise City', 'Boise'],
    ['Urban Honolulu', 'Honolulu']
  ])('should find %s as %s', (name, listed) => {
    const places = gnis(`${listed}|Populated Place|16|001|43.6|-116.2`)
    const city = { name, stateFips: '16', lat: 43.5, lon: -116.1 }
    const area = { counties: new Set(['16001']) }

    expect(downtown(area, city, [name], places)).toMatchObject({ lat: 43.6 })
  })

  it('should match Connecticut by state, as its counties are not the ones GNIS has', () => {
    const places = gnis('Hartford|Populated Place|09|003|41.76|-72.68')
    const city = { name: 'Hartford', stateFips: '09', lat: 41.77, lon: -72.67 }
    const area = { counties: new Set(['09110']) }

    expect(downtown(area, city, ['Hartford'], places)).toMatchObject({ lat: 41.76 })
  })

  it('should find nothing when no place has the name', () => {
    const city = { name: 'Holland', stateFips: '26', lat: 42.77, lon: -86.12 }

    expect(downtown({ counties: new Set(['26005']) }, city, ['Holland'], gnis())).toBeNull()
  })
})

describe('choosePoint', () => {
  const city = { name: 'El Paso', lat: 31.84781, lon: -106.43105 }
  const place = { lat: 31.75872, lon: -106.48693 }

  it('should put the town downtown, rounded', () => {
    expect(choosePoint(city, place, () => true)).toEqual({
      lat: 31.7587,
      lon: -106.4869,
      kept: null
    })
  })

  it('should keep the Census point when downtown is outside the state', () => {
    const isInState = ({ lat }) => lat > 31.8

    expect(choosePoint(city, place, isInState)).toMatchObject({
      lat: 31.8478,
      kept: 'outsideOutline'
    })
  })

  it('should keep the Census point when there is no downtown', () => {
    expect(choosePoint(city, null, () => true).kept).toBe('noMatch')
  })

  it('should refuse a town with no point inside the state', () => {
    expect(() => choosePoint(city, null, () => false)).toThrow('El Paso')
  })
})
