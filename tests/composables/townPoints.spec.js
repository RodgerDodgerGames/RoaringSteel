/**
 * Town Points Tests
 *
 * The table of where towns go is generated (scripts/build-town-points.mjs),
 * so these check what a rebuild could silently break: a town off its state's
 * outline, which is then left off every board, or a city back out where the
 * Census Bureau's point for it is (#180).
 */

import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { distance } from '@turf/turf'
import points from '@/config/townPoints.json'
import { townPoint, atTownPoint } from '@/composables/setup/townPoints'
import { regionTest } from '@/composables/map/region'

/** Each state's "is this point on the board" test, by FIPS code */
const inState = new Map(
  JSON.parse(readFileSync('public/data/us-states.geojson', 'utf8')).features.map((state) => [
    state.properties.STATE,
    regionTest(state)
  ])
)

describe('townPoints', () => {
  it("should have every town inside its own state's outline", () => {
    const outside = Object.keys(points).filter((code) => {
      const { lat, lon, stateFips } = townPoint(code)
      return !inState.get(stateFips)({ lat, lng: lon })
    })

    expect(outside).toEqual([])
  })

  // Each city's hall, from the USGS's map of government buildings (a
  // different dataset from the table's): [lon, lat]
  it.each([
    ['41860', 'San Francisco', [-122.4193, 37.7793]],
    ['18580', 'Corpus Christi', [-97.4042, 27.7959]],
    ['38860', 'Portland', [-70.2572, 43.6593]],
    ['11260', 'Anchorage', [-149.895, 61.2164]],
    ['49740', 'Yuma', [-114.6203, 32.7219]],
    ['27940', 'Juneau', [-134.4065, 58.2997]],
    ['15580', 'Butte', [-112.5388, 46.0147]]
  ])('should put %s, %s, downtown (#180)', (code, name, center) => {
    const point = townPoint(code)

    expect(point.name).toBe(name)
    expect(distance([point.lon, point.lat], center)).toBeLessThan(3)
  })

  it('should have the areas of older Census releases, for states whose data runs behind', () => {
    // Cleveland-Elyria, which the 2023 list has as 17410
    expect(townPoint('17460').name).toBe('Cleveland')
    expect(townPoint('17410').name).toBe('Cleveland')
  })

  it('should have nothing for an area not in the table', () => {
    expect(townPoint('00000')).toBeNull()
  })

  it('should give a site its point, name and state, and keep the rest', () => {
    const site = {
      msa: '41860',
      name: 'An older name',
      stateCode: '32',
      population: 5,
      lat: 37.7272,
      lon: -123.0322
    }
    const { lat, lon } = townPoint('41860')

    expect(atTownPoint(site)).toEqual({
      ...site,
      name: 'San Francisco',
      stateCode: '06',
      lat,
      lon
    })
  })

  it('should leave a site not in the table as it is', () => {
    const site = { msa: '00000', lat: 1, lon: 2 }

    expect(atTownPoint(site)).toBe(site)
  })
})
