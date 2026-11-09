/**
 * Start Rule Tests
 *
 * Where a network may start: in any town, or — with the game setting on —
 * only in a major city. Computer players weigh up fewer towns than a person
 * may pick from, to keep their thinking time down, but never one the rule
 * forbids.
 */

import { describe, it, expect } from 'vitest'
import { startTowns, startRuleMessage, botStartTowns } from '@/composables/startRule'

const towns = [
  { name: 'Denver', size: 'large' },
  { name: 'Pueblo', size: 'medium' },
  { name: 'Lamar', size: 'small' }
]

const names = (list) => list.map((town) => town.name)

describe('startTowns', () => {
  it('should allow every town when a major city is not required', () => {
    expect(names(startTowns(towns, false))).toEqual(['Denver', 'Pueblo', 'Lamar'])
  })

  it('should allow only the major cities when one is required', () => {
    expect(names(startTowns(towns, true))).toEqual(['Denver'])
  })
})

describe('startRuleMessage', () => {
  it('should say where track may start under each rule', () => {
    expect(startRuleMessage(false)).toContain('start in a town')
    expect(startRuleMessage(true)).toContain('start in a major city')
  })
})

describe('botStartTowns', () => {
  it('should weigh up the major cities and the towns its demands are for', () => {
    expect(names(botStartTowns(towns, false, ['Lamar']))).toEqual(['Denver', 'Lamar'])
  })

  it('should leave out a town its demands are for when a major city is required', () => {
    expect(names(botStartTowns(towns, true, ['Lamar']))).toEqual(['Denver'])
  })

  it('should weigh up each town once, however many demands are for it', () => {
    expect(names(botStartTowns(towns, false, ['Pueblo', 'Pueblo', 'Denver']))).toEqual([
      'Denver',
      'Pueblo'
    ])
  })
})
