/**
 * Rail Network Tests
 *
 * The track seen as a railway: sections join wherever they meet — a shared
 * point, a point part way along another's leg, or a crossing, whoever owns
 * the track — trains find the shortest way along it, stop part
 * way when they run out of distance, may only reverse in towns, are placed
 * by the town nearest them along the track, and a
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
  nearestTown,
  majorCitiesJoined,
  stretchAt,
  liesOnTrack
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

    it('should join lines that cross, whoever owns them', () => {
      // A north-south line of player 2's crossing player 1's east-west one
      // half way between West and Middle
      const north = { lat: 0.05, lng: 0.05 }
      const network = buildNetwork(
        [segment(1, p(west), p(middle)), segment(2, { lat: -0.05, lng: 0.05 }, north)],
        towns
      )

      const routes = shortestRoutes(network, positionAtNode(network, townKey(west)))

      // Half a leg east to the crossing, then half a leg north
      expect(routes.get(pointKey(north)).km).toBeCloseTo(LEG_KM, 1)
      // Player 1's own line still runs on through the crossing to Middle
      expect(routes.get(townKey(middle)).km).toBeCloseTo(LEG_KM)
    })

    it('should join a section that ends part way along a leg', () => {
      // West to East in one leg, with a line drawn down onto the middle of it
      const north = { lat: 0.05, lng: 0.15 }
      const network = buildNetwork(
        [segment(1, p(west), p(east)), segment(1, north, { lat: 0, lng: 0.15 })],
        towns
      )

      const routes = shortestRoutes(network, positionAtNode(network, townKey(west)))

      expect(routes.get(pointKey(north)).km).toBeCloseTo(1.5 * LEG_KM + LEG_KM / 2, 1)
      // The leg split at the junction is still the whole way to East
      expect(routes.get(townKey(east)).km).toBeCloseTo(2 * LEG_KM)
    })

    it('should split a leg at every junction along it, in order', () => {
      // Two lines crossing the West–Far leg, the farther one listed first
      const nearEnd = { lat: 0.05, lng: 0.05 }
      const farEnd = { lat: 0.05, lng: 0.25 }
      const network = buildNetwork(
        [
          segment(1, p(west), p(far)),
          segment(2, { lat: -0.05, lng: 0.25 }, farEnd),
          segment(2, { lat: -0.05, lng: 0.05 }, nearEnd)
        ],
        towns
      )

      const routes = shortestRoutes(network, positionAtNode(network, townKey(west)))

      expect(routes.get(pointKey(nearEnd)).km).toBeCloseTo(LEG_KM, 1)
      expect(routes.get(pointKey(farEnd)).km).toBeCloseTo(3 * LEG_KM, 1)
      expect(routes.get(townKey(far)).km).toBeCloseTo(3 * LEG_KM)
    })

    it('should not join lines that only pass close to each other', () => {
      // A point 50 m north of the West–Middle leg, and a line running
      // alongside it 50 m south
      const network = buildNetwork(
        [
          segment(1, p(west), p(middle)),
          segment(2, { lat: 0.00045, lng: 0.05 }, { lat: 0.05, lng: 0.05 }),
          segment(3, { lat: -0.00045, lng: 0.01 }, { lat: -0.00045, lng: 0.09 })
        ],
        towns
      )

      const routes = shortestRoutes(network, positionAtNode(network, townKey(west)))

      expect([...routes.keys()]).toEqual([townKey(middle)])
    })

    it('should join the bend of a section drawn onto a leg on screen', () => {
      // From a playtest save: the Willmar–Hutchinson section's middle bend was
      // snapped onto the St. Cloud line's first leg (kept here alone), part
      // way along it. Off by
      // 12 m measured as the crow flies, it is on the leg as the map draws it.
      const willmar = { name: 'Willmar', msa: 'W', lat: 45.1210292, lon: -95.0587343 }
      const hutchinson = { name: 'Hutchinson', msa: 'H', lat: 44.885358, lon: -94.3768758 }
      const lineStart = { lat: 44.99661707591089, lng: -94.36569213867189 }
      const network = buildNetwork(
        [
          segment(1, lineStart, { lat: 44.742526567065525, lng: -94.78729248046876 }),
          segment(
            1,
            p(willmar),
            { lat: 45.021428413573524, lng: -94.8394775390625 },
            { lat: 44.88126104636463, lng: -94.55732765868329 },
            p(hutchinson)
          )
        ],
        [willmar, hutchinson]
      )

      const routes = shortestRoutes(network, positionAtNode(network, pointKey(lineStart)))

      expect(routes.has(townKey(willmar))).toBe(true)
      expect(routes.has(townKey(hutchinson))).toBe(true)
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

    it('should stop on the line as the map draws it, on a slanting leg far from the equator', () => {
      const north = { lat: 46, lng: -94 }
      const south = { lat: 44, lng: -96 }
      const slanting = buildNetwork([segment(1, north, south)], [])
      const from = positionAtNode(slanting, pointKey(north))
      const [step] = shortestRoutes(slanting, from).get(pointKey(south)).steps

      const { position } = runRoute(slanting, from, [step], step.km / 3)

      expect(liesOnTrack(position, [segment(1, north, south)])).toBe(true)
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

  describe('stretchAt', () => {
    // A train stopped a quarter of the way from West to East, heading east
    const stopped = {
      lat: 0,
      lng: 0.05,
      nodeKey: null,
      townId: null,
      cameFrom: townKey(west),
      ahead: townKey(east),
      ownerId: 1
    }

    it('should be the stretch the train stopped on when nothing has been built since', () => {
      const network = buildNetwork([segment(1, p(west), p(east))], towns)

      expect(stretchAt(network, stopped)).toEqual({
        behind: townKey(west),
        ahead: townKey(east)
      })
    })

    it('should end at a junction built ahead of the train since it stopped', () => {
      const junction = { lat: 0, lng: 0.15 }
      const north = { lat: 0.05, lng: 0.15 }
      const network = buildNetwork(
        [segment(1, p(west), p(east)), segment(2, { lat: -0.05, lng: 0.15 }, north)],
        towns
      )

      expect(stretchAt(network, stopped)).toEqual({
        behind: townKey(west),
        ahead: pointKey(junction)
      })
      // So the train may turn there: a leg on to the junction, half a leg north
      expect(shortestRoutes(network, stopped).get(pointKey(north)).km).toBeCloseTo(1.5 * LEG_KM, 1)
    })

    it('should start at a junction built behind the train since it stopped', () => {
      const network = buildNetwork(
        [
          segment(1, p(west), p(east)),
          segment(2, { lat: -0.05, lng: 0.02 }, { lat: 0.05, lng: 0.02 })
        ],
        towns
      )

      expect(stretchAt(network, stopped)).toEqual({
        behind: pointKey({ lat: 0, lng: 0.02 }),
        ahead: townKey(east)
      })
    })
  })

  describe('liesOnTrack', () => {
    const track = [segment(1, p(west), p(middle), { lat: 0.1, lng: 0.1 })]

    it('should be true on a point of the track', () => {
      expect(liesOnTrack(p(middle), track)).toBe(true)
    })

    it('should be true part way along a leg', () => {
      expect(liesOnTrack({ lat: 0.05, lng: 0.1 }, track)).toBe(true)
    })

    it('should be false a hair off a bend, where a section would not join', () => {
      // About 1 m north of the bend at Middle
      expect(liesOnTrack({ lat: 0.000009, lng: 0.1 }, track)).toBe(false)
    })

    it('should be false off the track, even close by', () => {
      // About 50 m north of the first leg
      expect(liesOnTrack({ lat: 0.00045, lng: 0.05 }, track)).toBe(false)
    })
  })

  describe('nearestTown', () => {
    it('should be the town a train stands in, no distance away', () => {
      const network = buildNetwork([segment(1, p(west), p(middle))], towns)

      expect(nearestTown(network, positionAtNode(network, townKey(middle)))).toEqual({
        town: middle,
        km: 0
      })
    })

    it('should measure along the track, not in a straight line', () => {
      // A spur from West that ends just north of East: East is far nearer as
      // the crow flies, but the track only leads back to West
      const end = { lat: 0.05, lng: 0.2 }
      const network = buildNetwork(
        [segment(1, p(west), end), segment(2, p(middle), p(east))],
        towns
      )

      const nearest = nearestTown(network, positionAtNode(network, pointKey(end), townKey(west)))

      expect(nearest.town).toBe(west)
      expect(nearest.km).toBeCloseTo(kmBetween(p(west), end))
    })

    it('should look back the way the train came, as a train waiting at the end of its track', () => {
      // East, then a stub beyond it with no town ahead
      const end = { lat: 0, lng: 0.25 }
      const network = buildNetwork([segment(1, p(west), p(middle), p(east), end)], towns)

      const nearest = nearestTown(network, positionAtNode(network, pointKey(end), townKey(east)))

      expect(nearest.town).toBe(east)
      expect(nearest.km).toBeCloseTo(0.5 * LEG_KM)
    })

    it('should measure both ways from part way along a stretch', () => {
      const network = buildNetwork([segment(1, p(west), p(middle), p(east))], towns)
      const start = positionAtNode(network, townKey(west))
      const { steps } = shortestRoutes(network, start).get(townKey(east))
      // Stopped a quarter of the way from Middle toward East: Middle is behind
      // the train but nearer than East ahead
      const stopped = runRoute(network, start, steps, 1.25 * LEG_KM).position

      const nearest = nearestTown(network, stopped)

      expect(nearest.town).toBe(middle)
      expect(nearest.km).toBeCloseTo(0.25 * LEG_KM)
    })

    it('should be null for a train on a point no longer on the network', () => {
      const network = buildNetwork([segment(1, p(west), p(middle))], towns)
      const gone = { lat: 5, lng: 5, nodeKey: pointKey({ lat: 5, lng: 5 }), cameFrom: null }

      expect(nearestTown(network, gone)).toBeNull()
    })

    it('should be null when no track leads to a town', () => {
      const a = { lat: 1, lng: 1 }
      const b = { lat: 1, lng: 1.1 }
      const network = buildNetwork([segment(1, a, b)], towns)

      expect(nearestTown(network, positionAtNode(network, pointKey(a)))).toBeNull()
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

    it('should join pieces of own track where they cross', () => {
      // West to the north-east and East to the north-west, crossing between
      const network = buildNetwork(
        [segment(1, p(west), { lat: 0.1, lng: 0.2 }), segment(1, p(east), { lat: 0.1, lng: 0 })],
        towns
      )

      expect(majorCitiesJoined(network, 1)).toBe(2)
    })

    it("should not join pieces of own track across another player's line", () => {
      // Each piece crosses player 2's line, not the other piece
      const network = buildNetwork(
        [
          segment(1, p(west), { lat: 0.1, lng: 0 }),
          segment(1, p(east), { lat: 0.1, lng: 0.2 }),
          segment(2, { lat: 0.05, lng: -0.05 }, { lat: 0.05, lng: 0.25 })
        ],
        towns
      )

      expect(majorCitiesJoined(network, 1)).toBe(1)
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
