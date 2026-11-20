/**
 * Town Limits Tests
 *
 * With the game setting on, a small or medium town takes only so many
 * players' track, by how many players the game has; a major city takes
 * everyone's. A player is in a town when a point of their track is on it,
 * and a full town is closed to everyone else.
 */

import { describe, it, expect } from 'vitest'
import {
  builderLimit,
  builderLimitRows,
  buildersByTown,
  closedTowns,
  townFullMessage
} from '@/composables/townLimits'

const fairmont = { name: 'Fairmont', lat: 43.65, lon: -94.46, size: 'small' }
const mankato = { name: 'Mankato', lat: 44.16, lon: -94.0, size: 'medium' }
const minneapolis = { name: 'Minneapolis', lat: 44.98, lon: -93.27, size: 'large' }
const towns = [fairmont, mankato, minneapolis]

/** A town's point, as track has it */
const pointOf = (town) => ({ lat: town.lat, lng: town.lon })

/** A point well away from every town */
const nowhere = { lat: 44.5, lng: -95.5 }

describe('builderLimit', () => {
  it('should follow the table for small and medium towns at every player count', () => {
    const table = {
      2: [1, 2],
      3: [2, 3],
      4: [2, 3],
      5: [3, 4],
      6: [3, 4],
      7: [3, 4],
      8: [4, 5],
      12: [4, 5]
    }
    Object.entries(table).forEach(([players, [small, medium]]) => {
      expect(builderLimit('small', Number(players))).toBe(small)
      expect(builderLimit('medium', Number(players))).toBe(medium)
    })
  })

  it('should never limit a major city', () => {
    expect(builderLimit('large', 2)).toBe(Infinity)
    expect(builderLimit('large', 8)).toBe(Infinity)
  })

  it('should use the smallest game row for a solo game', () => {
    expect(builderLimit('small', 1)).toBe(1)
  })
})

describe('builderLimitRows', () => {
  it('should label each row with the player counts it covers', () => {
    expect(builderLimitRows().map(({ label }) => label)).toEqual(['2', '3', '4', '5', '6–7', '8+'])
  })
})

describe('buildersByTown', () => {
  it('should count each player with a point of track on the town, once', () => {
    const segments = [
      // Ann ends at Fairmont, and passes through it again on another section
      { ownerId: 1, coordinates: [nowhere, pointOf(fairmont)] },
      { ownerId: 1, coordinates: [pointOf(mankato), pointOf(fairmont), nowhere] },
      // Bo starts from Fairmont
      { ownerId: 2, coordinates: [pointOf(fairmont), nowhere] }
    ]

    const builders = buildersByTown(towns, segments)

    expect([...builders.get('43.650000,-94.460000')]).toEqual([1, 2])
    expect([...builders.get('44.160000,-94.000000')]).toEqual([1])
    expect(builders.has('44.980000,-93.270000')).toBe(false)
  })

  it('should not count track that only comes near a town', () => {
    const near = { lat: fairmont.lat + 0.001, lng: fairmont.lon }

    expect(buildersByTown(towns, [{ ownerId: 1, coordinates: [nowhere, near] }]).size).toBe(0)
  })
})

describe('closedTowns', () => {
  /** Ann (1) in Fairmont and Mankato, Bo (2) in Mankato and Minneapolis */
  const builders = buildersByTown(towns, [
    { ownerId: 1, coordinates: [pointOf(fairmont), pointOf(mankato)] },
    { ownerId: 2, coordinates: [pointOf(mankato), pointOf(minneapolis)] }
  ])
  const names = (closed) => closed.map(({ town }) => town.name)

  it('should close a full town to a player not in it', () => {
    // Two players: a small town takes one, a medium town two
    expect(names(closedTowns(towns, builders, 3, 2))).toEqual(['Fairmont', 'Mankato'])
  })

  it('should never close a town to a player already in it', () => {
    expect(names(closedTowns(towns, builders, 1, 2))).toEqual([])
    expect(names(closedTowns(towns, builders, 2, 2))).toEqual(['Fairmont'])
  })

  it('should leave a town open while it has room', () => {
    // Four players: a small town takes two, a medium town three
    expect(names(closedTowns(towns, builders, 3, 4))).toEqual([])
  })

  it('should open a town again once a player has left it', () => {
    // Ann has torn up her track at Fairmont
    const after = buildersByTown(towns, [
      { ownerId: 2, coordinates: [pointOf(mankato), pointOf(minneapolis)] }
    ])

    expect(names(closedTowns(towns, after, 3, 2))).toEqual([])
  })

  it('should give the limit and player count with each closed town', () => {
    expect(closedTowns(towns, builders, 2, 2)).toEqual([
      { town: fairmont, limit: 1, playerCount: 2 }
    ])
  })
})

describe('townFullMessage', () => {
  it('should name the town, the limit, its size and the game', () => {
    expect(townFullMessage({ town: fairmont, limit: 2, playerCount: 4 })).toBe(
      'Fairmont is full: only 2 players may build into a small town in a 4-player game.'
    )
  })

  it('should speak of one player in the singular', () => {
    expect(townFullMessage({ town: mankato, limit: 1, playerCount: 2 })).toBe(
      'Mankato is full: only 1 player may build into a medium town in a 2-player game.'
    )
  })
})
