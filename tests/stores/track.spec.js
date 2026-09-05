/**
 * Track Store Tests
 *
 * Track is game state: every segment belongs to a player, carries what it cost,
 * and has to survive a JSON round trip. These tests guard those three things —
 * attribution, pricing, and serializability — plus restoring a saved network
 * without colliding with the ids it brought with it.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useTrackStore } from '@/stores/track'

/** A minimal two-point line, in the shape Leaflet hands back */
const line = (points = 2) =>
  Array.from({ length: points }, (_, i) => ({ lat: 44 + i * 0.1, lng: -93 - i * 0.1 }))

describe('track store', () => {
  let trackStore

  beforeEach(() => {
    trackStore = useTrackStore()
  })

  describe('initial state', () => {
    it('should start with no track', () => {
      expect(trackStore.segments).toEqual([])
      expect(trackStore.hasTrack).toBe(false)
      expect(trackStore.totalTrackCost).toBe(0)
      expect(trackStore.error).toBeNull()
    })
  })

  describe('addSegment', () => {
    it('should store a segment with its owner, cost and turn', () => {
      const segment = trackStore.addSegment({
        ownerId: 2,
        coordinates: line(),
        cost: 4000,
        turn: 3
      })

      expect(segment).toMatchObject({ id: 1, ownerId: 2, cost: 4000, turn: 3 })
      expect(segment.coordinates).toEqual(line())
      expect(trackStore.segments).toHaveLength(1)
      expect(trackStore.hasTrack).toBe(true)
    })

    it('should give each segment a unique id', () => {
      const first = trackStore.addSegment({ ownerId: 1, coordinates: line() })
      const second = trackStore.addSegment({ ownerId: 1, coordinates: line() })

      expect(second.id).not.toBe(first.id)
    })

    it('should default cost and turn for a segment built before either matters', () => {
      const segment = trackStore.addSegment({ ownerId: 1, coordinates: line() })

      expect(segment.cost).toBe(0)
      expect(segment.turn).toBe(0)
    })

    it('should reject track with no owner, so no segment goes unattributed', () => {
      expect(trackStore.addSegment({ coordinates: line() })).toBeNull()
      expect(trackStore.error).toBe('Track segment must have an owner')
      expect(trackStore.segments).toEqual([])
    })

    it('should reject a line with fewer than two points', () => {
      expect(trackStore.addSegment({ ownerId: 1, coordinates: line(1) })).toBeNull()
      expect(trackStore.error).toBe('Track segment needs at least two points')
    })

    it('should reject a coordinate that is not a usable position', () => {
      const bad = [{ lat: 44, lng: -93 }, { lat: 44.1 }]

      expect(trackStore.addSegment({ ownerId: 1, coordinates: bad })).toBeNull()
      expect(trackStore.error).toBe('Track segment has an invalid coordinate')
    })

    it('should reject a negative cost', () => {
      expect(trackStore.addSegment({ ownerId: 1, coordinates: line(), cost: -1 })).toBeNull()
      expect(trackStore.error).toBe('Track segment cost must be a non-negative number')
    })

    it('should keep only plain lat/lng, so Leaflet objects cannot reach a save', () => {
      // Leaflet's LatLng carries methods and a prototype that JSON drops
      const latlng = { lat: 44, lng: -93, distanceTo: () => 0 }
      const segment = trackStore.addSegment({ ownerId: 1, coordinates: [latlng, latlng] })

      expect(segment.coordinates[0]).toEqual({ lat: 44, lng: -93 })
      expect(JSON.parse(JSON.stringify(segment))).toEqual(segment)
    })
  })

  describe('ownership', () => {
    beforeEach(() => {
      trackStore.addSegment({ ownerId: 1, coordinates: line(), cost: 1000 })
      trackStore.addSegment({ ownerId: 2, coordinates: line(), cost: 2500 })
      trackStore.addSegment({ ownerId: 1, coordinates: line(), cost: 500 })
    })

    it('should return only the segments a given player built', () => {
      expect(trackStore.segmentsForOwner(1).map((s) => s.cost)).toEqual([1000, 500])
      expect(trackStore.segmentsForOwner(2).map((s) => s.cost)).toEqual([2500])
    })

    it('should return nothing for a player who has built no track', () => {
      expect(trackStore.segmentsForOwner(3)).toEqual([])
    })

    it('should total what the whole network cost', () => {
      expect(trackStore.totalTrackCost).toBe(4000)
    })
  })

  describe('removeSegment', () => {
    it('should remove a segment without disturbing the others', () => {
      const first = trackStore.addSegment({ ownerId: 1, coordinates: line(), cost: 100 })
      const second = trackStore.addSegment({ ownerId: 1, coordinates: line(), cost: 200 })

      expect(trackStore.removeSegment(first.id)).toBe(true)
      expect(trackStore.segments.map((s) => s.id)).toEqual([second.id])
      expect(trackStore.totalTrackCost).toBe(200)
    })

    it('should refuse to remove a segment that does not exist', () => {
      expect(trackStore.removeSegment(99)).toBe(false)
      expect(trackStore.error).toBe('Track segment with ID 99 not found')
    })

    it('should expose a segment by id, so its cost can be refunded on removal', () => {
      const segment = trackStore.addSegment({ ownerId: 1, coordinates: line(), cost: 750 })

      expect(trackStore.getSegment(segment.id).cost).toBe(750)
      expect(trackStore.getSegment(99)).toBeUndefined()
    })
  })

  describe('setTrack', () => {
    it('should restore a saved network', () => {
      trackStore.setTrack([
        { id: 4, ownerId: 1, coordinates: line(), cost: 300, turn: 1 },
        { id: 5, ownerId: 2, coordinates: line(), cost: 700, turn: 1 }
      ])

      expect(trackStore.segments).toHaveLength(2)
      expect(trackStore.totalTrackCost).toBe(1000)
      expect(trackStore.segmentsForOwner(2)[0].cost).toBe(700)
    })

    it('should not reissue an id that a restored segment already holds', () => {
      trackStore.setTrack([{ id: 4, ownerId: 1, coordinates: line(), cost: 300, turn: 1 }])

      const added = trackStore.addSegment({ ownerId: 1, coordinates: line() })

      expect(added.id).toBe(5)
      expect(trackStore.segments.map((s) => s.id)).toEqual([4, 5])
    })

    it('should ignore anything that is not an array', () => {
      trackStore.addSegment({ ownerId: 1, coordinates: line() })
      trackStore.setTrack(undefined)

      expect(trackStore.segments).toHaveLength(1)
    })
  })

  describe('reset', () => {
    it('should clear the network and start ids over', () => {
      trackStore.addSegment({ ownerId: 1, coordinates: line() })
      trackStore.reset()

      expect(trackStore.segments).toEqual([])
      expect(trackStore.hasTrack).toBe(false)
      expect(trackStore.error).toBeNull()
      expect(trackStore.addSegment({ ownerId: 1, coordinates: line() }).id).toBe(1)
    })
  })
})
