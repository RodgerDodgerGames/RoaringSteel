/**
 * Rail Network Tests
 *
 * The track seen as a railway: sections join where they share a point (not
 * where they merely cross), trains find the shortest way along it, stop part
 * way when they run out of distance, may only reverse in towns, and a
 * player's major cities count as joined only on one connected piece of their
 * own track.
 */

import { describe, it, expect } from 'vitest'
import {
  buildNetwork,
  pointKey,
  townKey,
  positionAtNode,
  shortestRoutes,
  runRoute,
  majorCitiesJoined
} from '@/composables/network'
import { kmBetween } from '@/composables/map/trackCost'

// Towns on a line of latitude near the equator, where 0.1 degrees of
// longitude is about 11.1 km, so distances are easy to reason about
const town = (name, lng, size = 'small') => ({ name, msa: name, lat: 0, lon: lng, size })
const west = town('West', 0, 'large')
const middle = town('Middle', 0.1)
const east = town('East', 0.2, 'large')
const far = town('Far', 0.3, 'large')
const towns = [west, middle, east, far]

const p = (t) => ({ lat: t.lat, lng: t.lon })
const segment = (ownerId, ...points) => ({ ownerId, coordinates: points })

/** About 11.1 km: 0.1 degrees of longitude on the equator */
const LEG_KM = kmBetween(p(west), p(middle))

describe('network', () => {
  describe('buildNetwork', () => {
    it('should join sections that share a point', () => {
      const network = buildNetwork(
        [segment(1, p(west), p(middle)), segment(1, p(middle), p(east))],
        towns
      )

      const routes = shortestRoutes(network, positionAtNode(network, townKey(west)))

      expect(routes.get(townKey(east)).km).toBeCloseTo(2 * LEG_KM)
    })

    it('should not join lines that only cross', () => {
      // A north-south line crossing the east-west one between its points
      const network = buildNetwork(
        [
          segment(1, p(west), p(middle)),
          segment(2, { lat: -0.05, lng: 0.05 }, { lat: 0.05, lng: 0.05 })
        ],
        towns
      )

      const routes = shortestRoutes(network, positionAtNode(network, townKey(west)))

      expect(routes.has(pointKey({ lat: 0.05, lng: 0.05 }))).toBe(false)
    })

    it('should give every town a node, with or without track', () => {
      const network = buildNetwork([], towns)

      expect(network.nodes.get(townKey(far)).town).toBe(far)
      expect(network.adjacency.get(townKey(far))).toEqual([])
    })
  })

  describe('shortestRoutes', () => {
    it('should take the shorter of two ways', () => {
      const network = buildNetwork(
        [
          segment(1, p(west), p(east)),
          segment(1, p(west), { lat: 0.2, lng: 0.1 }, p(east)) // a detour north
        ],
        towns
      )

      const route = shortestRoutes(network, positionAtNode(network, townKey(west))).get(
        townKey(east)
      )

      expect(route.km).toBeCloseTo(2 * LEG_KM)
      expect(route.steps).toHaveLength(1)
    })

    it('should keep to the given owners track when asked', () => {
      const network = buildNetwork(
        [segment(1, p(west), p(middle)), segment(2, p(middle), p(east))],
        towns
      )
      const start = positionAtNode(network, townKey(west))

      expect(shortestRoutes(network, start, { owners: new Set([1]) }).has(townKey(east))).toBe(
        false
      )
      expect(shortestRoutes(network, start).has(townKey(east))).toBe(true)
    })

    it('should not let a train reverse away from a town', () => {
      // West - bend - East, the train standing on the bend having come from West
      const bend = { lat: 0.05, lng: 0.1 }
      const network = buildNetwork([segment(1, p(west), bend, p(east))], towns)
      const onBend = positionAtNode(network, pointKey(bend), townKey(west))

      const routes = shortestRoutes(network, onBend)
      const toEast = routes.get(townKey(east))

      // Back to West only by running on to East, turning round there, and
      // coming all the way back
      expect(routes.get(townKey(west)).steps[0].to).toBe(townKey(east))
      expect(routes.get(townKey(west)).km).toBeGreaterThan(2 * toEast.km)
    })

    // The bug: the train could run on one stretch to the next bend and turn
    // round there, so it reversed anywhere just past where it stopped
    it('should not let a train turn round on a bend further along', () => {
      // Off the line the towns are on, so neither bend is a town
      const b1 = { lat: 0.02, lng: 0.05 }
      const b2 = { lat: 0.02, lng: 0.1 }
      const network = buildNetwork([segment(1, p(west), b1, b2, p(east))], towns)
      const onB1 = positionAtNode(network, pointKey(b1), townKey(west))

      const toWest = shortestRoutes(network, onB1).get(townKey(west))

      // On to East to turn round there
      expect(toWest.steps.map((step) => step.to)).toContain(townKey(east))
    })

    it('should not let a train stopped part way along turn round on the next bend', () => {
      const bend = { lat: 0.02, lng: 0.1 }
      const network = buildNetwork([segment(1, p(west), bend, p(east))], towns)
      const halfway = {
        lat: 0.01,
        lng: 0.05,
        nodeKey: null,
        townId: null,
        cameFrom: townKey(west),
        ahead: pointKey(bend),
        ownerId: 1
      }

      const toWest = shortestRoutes(network, halfway).get(townKey(west))

      expect(toWest.steps.map((step) => step.to)).toContain(townKey(east))
    })

    it('should let a train come back the way it came by going round a loop', () => {
      // West - bend - East, with a loop out of the bend and back into it
      const bend = { lat: 0.02, lng: 0.1 }
      const loopA = { lat: 0.07, lng: 0.15 }
      const loopB = { lat: -0.03, lng: 0.15 }
      const network = buildNetwork(
        [segment(1, p(west), bend), segment(1, bend, loopA, loopB, bend)],
        towns
      )
      const onBend = positionAtNode(network, pointKey(bend), townKey(west))

      const toWest = shortestRoutes(network, onBend).get(townKey(west))

      // Round the loop, either way, back through the bend and on to West
      expect(toWest.steps).toHaveLength(4)
      expect(toWest.steps.slice(-2).map((step) => step.to)).toEqual([pointKey(bend), townKey(west)])
    })

    it('should let a train reverse in a town', () => {
      const network = buildNetwork([segment(1, p(west), p(middle), p(east))], towns)
      // In Middle, having come from West
      const inMiddle = positionAtNode(network, townKey(middle), townKey(west))

      expect(shortestRoutes(network, inMiddle).has(townKey(west))).toBe(true)
    })

    it('should only go onward from part way along a stretch', () => {
      const network = buildNetwork([segment(1, p(west), p(east))], towns)
      const halfway = {
        lat: 0,
        lng: 0.1,
        nodeKey: null,
        townId: null,
        cameFrom: townKey(west),
        ahead: townKey(east),
        ownerId: 1
      }

      const routes = shortestRoutes(network, halfway)

      expect(routes.get(townKey(east)).km).toBeCloseTo(LEG_KM)
      // Back to West only by way of turning round in East
      expect(routes.get(townKey(west)).km).toBeCloseTo(3 * LEG_KM)
    })
  })

  describe('runRoute', () => {
    const network = buildNetwork(
      [segment(1, p(west), p(middle)), segment(2, p(middle), p(east))],
      towns
    )
    const start = positionAtNode(network, townKey(west))
    const { steps } = shortestRoutes(network, start).get(townKey(east))

    it('should arrive when the route is within reach', () => {
      const result = runRoute(network, start, steps, 100)

      expect(result.arrived).toBe(true)
      expect(result.position.townId).toBe('East')
      expect(result.km).toBeCloseTo(2 * LEG_KM)
    })

    it('should note whose track was run on', () => {
      expect([...runRoute(network, start, steps, 100).ownersUsed]).toEqual([1, 2])
    })

    it('should stop part way along a stretch when the distance runs out', () => {
      const result = runRoute(network, start, steps, 1.5 * LEG_KM)

      expect(result.arrived).toBe(false)
      expect(result.km).toBeCloseTo(1.5 * LEG_KM)
      expect(result.position.nodeKey).toBeNull()
      expect(result.position.lng).toBeCloseTo(0.15)
      expect(result.position.cameFrom).toBe(townKey(middle))
      expect(result.position.ahead).toBe(townKey(east))
      expect(result.position.ownerId).toBe(2)
    })

    it('should count the track it stopped part way along as used', () => {
      expect([...runRoute(network, start, steps, 1.5 * LEG_KM).ownersUsed]).toEqual([1, 2])
    })

    it('should not count track it never reached', () => {
      expect([...runRoute(network, start, steps, LEG_KM).ownersUsed]).toEqual([1])
    })

    it('should carry on from part way along a stretch', () => {
      const stopped = runRoute(network, start, steps, 1.5 * LEG_KM).position
      const onward = shortestRoutes(network, stopped).get(townKey(east))

      const result = runRoute(network, stopped, onward.steps, 100)

      expect(result.arrived).toBe(true)
      expect(result.km).toBeCloseTo(0.5 * LEG_KM)
      // Arrived along the stretch from Middle
      expect(result.position.cameFrom).toBe(townKey(middle))
    })
  })

  describe('majorCitiesJoined', () => {
    it('should count the major cities on one connected piece of own track', () => {
      const network = buildNetwork(
        [segment(1, p(west), p(middle)), segment(1, p(middle), p(east))],
        towns
      )

      expect(majorCitiesJoined(network, 1)).toBe(2)
    })

    it('should not join cities on separate pieces of track', () => {
      const network = buildNetwork(
        [segment(1, p(west), p(middle)), segment(1, p(east), p(far))],
        towns
      )

      // West alone on one piece; East and Far on the other
      expect(majorCitiesJoined(network, 1)).toBe(2)
    })

    it('should not count other players track', () => {
      const network = buildNetwork(
        [segment(1, p(west), p(middle)), segment(2, p(middle), p(east))],
        towns
      )

      expect(majorCitiesJoined(network, 1)).toBe(1)
    })

    it('should be zero for a player with no track', () => {
      expect(majorCitiesJoined(buildNetwork([], towns), 1)).toBe(0)
    })
  })
})
