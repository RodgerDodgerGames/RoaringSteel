/**
 * Town Entry Tests
 *
 * Building track into a town costs a fee by the town's size, paid the first
 * time the player's track reaches it: when a line has a point on the town.
 * A line starting in a town pays for it too — a network may start in any
 * town, and the town would otherwise be joined for free — but starting out
 * of a major city is free, as in Empire Builder. Towns the player's track
 * already reaches, and towns a line only passes near, are not charged. Tearing a section up gives
 * back its entry fees, except for a town the player's other track still
 * reaches.
 */

import { describe, it, expect } from 'vitest'
import { townsByKey, entryFees, entryFeesKept } from '@/composables/townEntry'
import { pointKey } from '@/composables/network'
import { gameRules } from '@/config/game'

const town = (name, lon, size) => ({ name, lat: 0, lon, size })
const big = town('Big', 0, 'large')
const middling = town('Middling', 1, 'medium')
const little = town('Little', 2, 'small')
const towns = townsByKey([big, middling, little])

/** The point a town sits on, as a line's point */
const on = ({ lat, lon }) => ({ lat, lng: lon })

const NOTHING_REACHED = new Set()

describe('entryFees', () => {
  it('should charge each town the line reaches by its size', () => {
    const fees = entryFees([on(big), on(middling), on(little)], towns, NOTHING_REACHED)

    expect(fees).toBe(gameRules.townEntry.medium + gameRules.townEntry.small)
  })

  it('should charge a major city the major city fee', () => {
    expect(entryFees([on(middling), on(big)], towns, NOTHING_REACHED)).toBe(
      gameRules.townEntry.medium + gameRules.townEntry.large
    )
  })

  it('should not charge for a major city the line starts from', () => {
    expect(entryFees([on(big), { lat: 0.5, lng: 0.5 }], towns, NOTHING_REACHED)).toBe(0)
  })

  it('should charge for a smaller town the line starts from', () => {
    // Otherwise a line started there and run back to the player's own track
    // would join the town for nothing
    expect(entryFees([on(little), { lat: 0.5, lng: 1.5 }], towns, NOTHING_REACHED)).toBe(
      gameRules.townEntry.small
    )
  })

  it("should not charge for a town the line starts from that the player's track reaches already", () => {
    const reached = new Set([pointKey(on(little))])

    expect(entryFees([on(little), { lat: 0.5, lng: 1.5 }], towns, reached)).toBe(0)
  })

  it('should charge a smaller town once when the line starts from it and comes back to it', () => {
    expect(entryFees([on(little), on(middling), on(little)], towns, NOTHING_REACHED)).toBe(
      gameRules.townEntry.small + gameRules.townEntry.medium
    )
  })

  it("should not charge for a town the player's track reaches already", () => {
    const reached = new Set([pointKey(on(middling))])

    expect(entryFees([on(big), on(middling)], towns, reached)).toBe(0)
  })

  it('should not charge for passing near a town without a point on it', () => {
    // A point a little off the town's own point does not join it
    const nearby = { lat: 0.01, lng: middling.lon }

    expect(entryFees([on(big), nearby, on(little)], towns, NOTHING_REACHED)).toBe(
      gameRules.townEntry.small
    )
  })

  it('should charge a town once however often the line comes back to it', () => {
    const backAndForth = [on(big), on(little), { lat: 0.5, lng: 2 }, on(little)]

    expect(entryFees(backAndForth, towns, NOTHING_REACHED)).toBe(gameRules.townEntry.small)
  })

  it('should not charge a line that loops back to where it started', () => {
    expect(entryFees([on(big), on(middling), on(big)], towns, NOTHING_REACHED)).toBe(
      gameRules.townEntry.medium
    )
  })

  it('should charge nothing for a line with no points', () => {
    expect(entryFees([], towns, NOTHING_REACHED)).toBe(0)
  })
})

describe('entryFeesKept', () => {
  /** A section of track through these points */
  let nextId = 1
  const section = (...points) => ({ id: nextId++, coordinates: points })

  it("should keep the fee for a town the player's other track still reaches", () => {
    // The first section paid to enter Little; the second reached it for free
    const first = section(on(big), on(little))
    const second = section(on(middling), on(little))

    expect(entryFeesKept(first, [first, second], towns)).toBe(gameRules.townEntry.small)
  })

  it('should give the whole fee back when nothing else reaches the town', () => {
    const only = section(on(big), on(little))

    expect(entryFeesKept(only, [only], towns)).toBe(0)
  })

  it('should keep nothing back for a section that paid no fee', () => {
    // The second section reached Little after the first had paid for it
    const first = section(on(big), on(little))
    const second = section(on(middling), on(little))

    expect(entryFeesKept(second, [first, second], towns)).toBe(0)
  })

  it('should keep back only the towns still reached', () => {
    const first = section(on(big), on(middling), on(little))
    const second = section({ lat: 1, lng: 2 }, on(little))

    expect(entryFeesKept(first, [first, second], towns)).toBe(gameRules.townEntry.small)
  })
})
