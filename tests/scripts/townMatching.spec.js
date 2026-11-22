/**
 * Town Matching Tests
 *
 * Tests for how scripts/build-town-points.mjs reads its sources and picks
 * each town's point.
 */

import { describe, it, expect } from 'vitest'
import { distance } from '@turf/turf'
import { regionOutline, regionTest } from '@/composables/map/region'
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

describe('downtown, for the towns GNIS lists differently', () => {
  it('should take the place it is told to, even across a county line', () => {
    const places = gnis('Holland|Populated Place|26|139|42.7875|-86.1089')
    const city = { name: 'Holland', stateFips: '26', lat: 42.77, lon: -86.12 }
    const area = { code: '26090', counties: new Set(['26005']) }

    expect(downtown(area, city, ['Holland'], places)).toMatchObject({ lat: 42.7875 })
  })

  it('should take the place it is told to, by another name', () => {
    const places = gnis(
      'Barnstable|Populated Place|25|001|41.7001|-70.2995',
      'Hyannis|Populated Place|25|001|41.6529|-70.2828'
    )
    const city = { name: 'Barnstable Town', stateFips: '25', lat: 41.66, lon: -70.36 }
    const area = { code: '12700', counties: new Set(['25001']) }

    expect(downtown(area, city, ['Barnstable Town'], places)).toMatchObject({ lat: 41.6529 })
  })

  it('should fail when the place it is told to take is gone', () => {
    const city = { name: 'Holland', stateFips: '26', lat: 42.77, lon: -86.12 }
    const area = { code: '26090', counties: new Set(['26005']) }

    expect(() => downtown(area, city, ['Holland'], gnis())).toThrow('26090')
  })
})

describe('choosePoint', () => {
  /** A square state, a degree across, and its border */
  const state = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-107, 31],
          [-106, 31],
          [-106, 32],
          [-107, 32],
          [-107, 31]
        ]
      ]
    }
  }
  const isInState = regionTest(state)
  const border = regionOutline(isInState)
  const city = { name: 'El Paso', lat: 31.84781, lon: -106.43105 }
  const choose = (place, from = city) => choosePoint(from, place, isInState, border)
  const kmApart = (a, b) => distance([a.lon, a.lat], [b.lon, b.lat])

  it('should put the town downtown, rounded', () => {
    expect(choose({ lat: 31.75872, lon: -106.48693 })).toEqual({
      lat: 31.7587,
      lon: -106.4869,
      note: null
    })
  })

  it.each([
    ['south', { lat: 30.999, lon: -106.5 }],
    ['north', { lat: 32.015, lon: -106.5 }],
    ['east', { lat: 31.5, lon: -105.99 }],
    ['west', { lat: 31.5, lon: -107.01 }],
    ['corner', { lat: 32.005, lon: -105.995 }]
  ])('should nudge a downtown just past the %s of the border to just inside it', (side, place) => {
    const point = choose(place)
    const nearestOnBorder = {
      lat: Math.min(32, Math.max(31, place.lat)),
      lon: Math.min(-106, Math.max(-107, place.lon))
    }

    expect(point.note).toBe('nudged')
    expect(isInState({ lat: point.lat, lng: point.lon })).toBe(true)
    expect(kmApart(point, nearestOnBorder)).toBeLessThan(0.1)
  })

  it('should nudge inward a downtown inside the border that rounds to outside it', () => {
    const north = 31.99998
    const rings = [
      [-107, 31],
      [-106, 31],
      [-106, north],
      [-107, north],
      [-107, 31]
    ]
    const isIn = regionTest({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [rings] }
    })
    const point = choosePoint(city, { lat: 31.99996, lon: -106.3 }, isIn, regionOutline(isIn))

    expect(point.note).toBe('nudged')
    expect(point.lat).toBeLessThan(north)
    expect(point.lon).toBeCloseTo(-106.3, 3)
  })

  it('should nudge a downtown into a sharp corner', () => {
    const rings = [
      [-107, 31],
      [-106, 31.5],
      [-107, 31.6],
      [-107, 31]
    ]
    const isIn = regionTest({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [rings] }
    })
    const point = choosePoint(city, { lat: 31.51, lon: -105.998 }, isIn, regionOutline(isIn))

    expect(point.note).toBe('nudged')
    expect(kmApart(point, { lat: 31.5, lon: -106 })).toBeLessThan(0.1)
  })

  it('should keep the Census point when downtown is too far outside to nudge', () => {
    expect(choose({ lat: 32.1, lon: -106.5 })).toMatchObject({
      lat: 31.8478,
      note: 'outsideOutline'
    })
  })

  it('should nudge even when the Census point is outside too', () => {
    const atSea = { name: 'At Sea', lat: 40, lon: -120 }

    expect(choose({ lat: 30.999, lon: -106.5 }, atSea).note).toBe('nudged')
  })

  it('should keep the Census point when there is no downtown', () => {
    expect(choose(null).note).toBe('noMatch')
  })

  it('should refuse a town with no point inside the state', () => {
    expect(() => choose(null, { name: 'At Sea', lat: 40, lon: -120 })).toThrow('At Sea')
  })
})
