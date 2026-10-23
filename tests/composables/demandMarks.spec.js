/**
 * Demand Marks Tests
 *
 * A demand line picked out on the cards is shown on the map by marking its
 * towns: a halo round the destination town, and a halo round the commodity's
 * icon at every town that produces it. These tests cover which towns and
 * icons are marked, and in which colors.
 */

import { describe, it, expect } from 'vitest'
import { demandMarks } from '@/composables/map/demandMarks'

const towns = [
  { name: 'Denver', industries: [{ name: 'Coal Mining' }, { name: 'Beverage Manufacturing' }] },
  { name: 'Pueblo', industries: [{ name: 'Coal Mining' }] },
  { name: 'Greeley', industries: [{ name: 'Cattle Ranching and Farming' }] },
  { name: 'Lamar', industries: [] }
]

describe('demandMarks', () => {
  it('should mark the destination, and the commodity at every town producing it', () => {
    const lines = [{ destination: 'Lamar', industry: 'Coal Mining', color: 'gold' }]

    expect(demandMarks(lines, towns)).toEqual({
      destinations: { Lamar: ['gold'] },
      producers: {
        Denver: { 'Coal Mining': ['gold'] },
        Pueblo: { 'Coal Mining': ['gold'] }
      }
    })
  })

  it('should give a town every color of the lines it is the destination of', () => {
    const lines = [
      { destination: 'Lamar', industry: 'Coal Mining', color: 'gold' },
      { destination: 'Lamar', industry: 'Cattle Ranching and Farming', color: 'cyan' }
    ]

    expect(demandMarks(lines, towns).destinations).toEqual({ Lamar: ['gold', 'cyan'] })
  })

  it('should give a commodity every color of the lines that want it', () => {
    const lines = [
      { destination: 'Lamar', industry: 'Coal Mining', color: 'gold' },
      { destination: 'Greeley', industry: 'Coal Mining', color: 'cyan' }
    ]

    expect(demandMarks(lines, towns).producers.Pueblo).toEqual({ 'Coal Mining': ['gold', 'cyan'] })
  })

  it('should keep the commodities a town produces apart', () => {
    const lines = [
      { destination: 'Lamar', industry: 'Coal Mining', color: 'gold' },
      { destination: 'Greeley', industry: 'Beverage Manufacturing', color: 'cyan' }
    ]

    expect(demandMarks(lines, towns).producers.Denver).toEqual({
      'Coal Mining': ['gold'],
      'Beverage Manufacturing': ['cyan']
    })
  })

  it('should still mark the destination of a commodity no town produces', () => {
    const lines = [{ destination: 'Lamar', industry: 'Fruit and Tree Nut Farming', color: 'gold' }]

    expect(demandMarks(lines, towns)).toEqual({ destinations: { Lamar: ['gold'] }, producers: {} })
  })

  it('should mark nothing with no lines picked out', () => {
    expect(demandMarks([], towns)).toEqual({ destinations: {}, producers: {} })
  })
})
