/**
 * Map Legend Tests
 *
 * The legend lists the commodities produced on this map, each once, in
 * alphabetical order, with the icon the map shows for each.
 */

import { describe, it, expect } from 'vitest'
import { legendCommodities } from '@/composables/map/legend'
import { commodityIconUrl } from '@/composables/map/commodityIcons'

const coal = { name: 'Coal Mining', industry: 2121 }
const beer = { name: 'Beverage Manufacturing', industry: 3121 }
const tourism = { name: 'Tourism', industry: 9999 }

describe('legendCommodities', () => {
  it('should list a commodity produced in several towns once', () => {
    const towns = [{ industries: [coal] }, { industries: [coal, beer] }]

    expect(legendCommodities(towns).map(({ name }) => name)).toEqual([
      'Beverage Manufacturing',
      'Coal Mining'
    ])
  })

  it('should list the commodities alphabetically', () => {
    const towns = [{ industries: [tourism, coal] }, { industries: [beer] }]

    expect(legendCommodities(towns).map(({ name }) => name)).toEqual([
      'Beverage Manufacturing',
      'Coal Mining',
      'Tourism'
    ])
  })

  it('should show each commodity with the icon the map gives it', () => {
    const [entry] = legendCommodities([{ industries: [coal] }])

    expect(entry).toEqual({ industry: 2121, name: 'Coal Mining', iconUrl: commodityIconUrl(2121) })
  })

  it('should list nothing for a map where no town produces anything', () => {
    expect(legendCommodities([{ industries: [] }])).toEqual([])
    expect(legendCommodities([])).toEqual([])
  })
})
