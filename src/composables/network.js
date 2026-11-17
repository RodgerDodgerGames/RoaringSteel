/**
 * Rail Network (network.js)
 *
 * The track on the board seen as a railway a train can run on: which places
 * are joined to which, by whose track, and how far apart they are.
 *
 * Track is stored as sections, each a line of points (see the track store).
 * Here every point becomes a stop on the network (a node), and each straight
 * leg between two points a stretch of track (an edge).
 *
 * Track joins wherever it meets, whoever owns it:
 * - where two sections share a point (a section started on an end or bend
 *   of another, or a town clicked while drawing, which puts the point
 *   exactly on the town);
 * - where a point of one section lies on a leg of another, part way along
 *   it (a line drawn to or from the middle of a leg);
 * - where two legs cross.
 * A train may turn from one line onto the other at any of these, as on a
 * player's own track in Empire Builder; running on someone else's track
 * still costs the fee (see the trains store). The second and third kinds
 * are found here, each time the network is built, rather than written into
 * the saved track, so a game saved before track joined this way joins as
 * soon as it is loaded.
 *
 * "Lies on" and "cross" are judged as the map draws track: a leg is a
 * straight line on the map's Web Mercator projection, and the drawing tool
 * snaps a point onto a leg along that line. A point counts as on a leg
 * within `TOUCH_KM`, which only has to absorb floating-point noise; lines
 * that merely pass close to each other do not join.
 *
 * Every town is a node too, joined to whatever track has a point on it, so a
 * town with no track still has a place on the network (with nowhere to go).
 *
 * Where a train is (its position) is one of:
 * - on a node: `nodeKey` is the node, and `cameFrom` the node it arrived
 *   from (null if it has not moved since it was placed);
 * - part way along a stretch of track, where its last move ran out:
 *   `nodeKey` is null, `cameFrom` and `ahead` are the nodes behind and in
 *   front of it, and `ownerId` whose track it is on.
 * In both cases `lat`/`lng` is the spot itself. Track built since a train
 * stopped part way along can put a junction between it and `cameFrom` or
 * `ahead`; the stretch it is on is then found afresh (see `stretchAt`).
 *
 * A train may only reverse in a town (Empire Builder's rule), so a train
 * standing anywhere else must carry on the way it was going: its first step
 * may not be back to `cameFrom`.
 *
 * Pure functions over plain data, so the rules can be tested without a map.
 *
 * @module composables/network
 */

import { kmBetween } from '@/composables/map/trackCost'

/** How close, in km, two lengths may be and still count as equal */
const KM_EPSILON = 1e-9

/**
 * How close, in km, a point must be to a leg of track to count as on it: 2 m.
 * A point the drawing tool snapped onto a leg is on it to within a hair, so
 * this is kept small, and lines a player only drew near each other do not
 * join.
 */
const TOUCH_KM = 0.002

/**
 * Slack, in degrees, added round each leg's box when looking for legs that
 * might meet (see `findJunctions`): comfortably more than `TOUCH_KM`, so no
 * pair within it is missed.
 */
const BOX_SLACK = 1e-4

/**
 * A point on the map's Web Mercator projection, in degrees: longitude as it
 * is, and latitude stretched as the map stretches it toward the poles. A
 * straight leg on the map is a straight line here.
 * @param {{lat: number, lng: number}} point - The point
 * @returns {{x: number, y: number}} Its place on the projection
 */
function toMercator({ lat, lng }) {
  return { x: lng, y: (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI }
}

/**
 * The point at a place on the Web Mercator projection: `toMercator` undone.
 * @param {{x: number, y: number}} place - The place, in degrees
 * @returns {{lat: number, lng: number}} The point
 */
function fromMercator({ x, y }) {
  return { lat: (Math.atan(Math.exp((y * Math.PI) / 180)) * 360) / Math.PI - 90, lng: x }
}

/**
 * Where along a leg a point falls, and how far off the leg it is.
 * @param {{lat: number, lng: number}} point - The point
 * @param {{a: Object, b: Object, A: Object, B: Object}} leg - The leg: its
 *   ends `a` and `b`, and the same on the projection as `A` and `B`
 * @returns {{t: number, km: number}} `t` runs from 0 at `a` to 1 at `b` (the
 *   nearest place on the leg's line, kept to the leg itself), and `km` is
 *   how far the point is from that place
 */
function placeOnLeg(point, leg) {
  const P = toMercator(point)
  const dx = leg.B.x - leg.A.x
  const dy = leg.B.y - leg.A.y
  const lengthSquared = dx * dx + dy * dy
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(1, Math.max(0, ((P.x - leg.A.x) * dx + (P.y - leg.A.y) * dy) / lengthSquared))
  const nearest = fromMercator({ x: leg.A.x + t * dx, y: leg.A.y + t * dy })
  return { t, km: kmBetween(point, nearest) }
}

/**
 * Whether a point lies on a leg part way along it: on its line, and not at
 * (or within a hair of) either end, where the leg already has a node.
 * @param {{lat: number, lng: number}} point - The point
 * @param {Object} leg - The leg (see `placeOnLeg`)
 * @returns {number|null} Where along the leg it lies (see `placeOnLeg`), or
 *   null when it is not part way along it
 */
function partWayAlong(point, leg) {
  const { t, km } = placeOnLeg(point, leg)
  if (km > TOUCH_KM) return null
  if (kmBetween(point, leg.a) <= TOUCH_KM || kmBetween(point, leg.b) <= TOUCH_KM) return null
  return t
}

/**
 * Where two legs cross part way along both, if they do.
 *
 * Only a true crossing counts: legs that are parallel, or that meet at (or
 * within a hair of) an end of either, do not cross here. A meeting at an end
 * is either a shared point or an end lying on the other leg, both of which
 * are found otherwise.
 *
 * @param {Object} first - One leg (see `placeOnLeg`)
 * @param {Object} second - The other
 * @returns {{point: Object, s: number, t: number}|null} The crossing, and
 *   where along each leg it is (see `placeOnLeg`); null if they do not cross
 */
function crossing(first, second) {
  const rx = first.B.x - first.A.x
  const ry = first.B.y - first.A.y
  const qx = second.B.x - second.A.x
  const qy = second.B.y - second.A.y
  const denominator = rx * qy - ry * qx
  if (denominator === 0) return null
  const wx = second.A.x - first.A.x
  const wy = second.A.y - first.A.y
  const s = (wx * qy - wy * qx) / denominator
  const t = (wx * ry - wy * rx) / denominator
  if (s <= 0 || s >= 1 || t <= 0 || t >= 1) return null
  const point = fromMercator({ x: first.A.x + s * rx, y: first.A.y + s * ry })
  const nearAnEnd = [first.a, first.b, second.a, second.b].some(
    (end) => kmBetween(point, end) <= TOUCH_KM
  )
  return nearAnEnd ? null : { point, s, t }
}

/**
 * Every leg of every section, ready for finding where they meet: its ends,
 * their keys, the same ends on the projection, and its box there. A leg that
 * starts and ends on the same point goes nowhere and is left out.
 * @param {Array<Object>} segments - Every section of track
 * @returns {Array<Object>} The legs, each { a, b, aKey, bKey, A, B, ownerId,
 *   minX, maxX, minY, maxY, splits }, where `splits` is filled with the
 *   junctions found part way along it (see `findJunctions`)
 */
function legsOf(segments) {
  const legs = []
  segments.forEach(({ ownerId, coordinates }) => {
    coordinates.slice(1).forEach((b, i) => {
      const a = coordinates[i]
      const aKey = pointKey(a)
      const bKey = pointKey(b)
      if (aKey === bKey) return
      const A = toMercator(a)
      const B = toMercator(b)
      legs.push({
        a,
        b,
        aKey,
        bKey,
        A,
        B,
        ownerId,
        minX: Math.min(A.x, B.x) - BOX_SLACK,
        maxX: Math.max(A.x, B.x) + BOX_SLACK,
        minY: Math.min(A.y, B.y) - BOX_SLACK,
        maxY: Math.max(A.y, B.y) + BOX_SLACK,
        splits: []
      })
    })
  })
  return legs
}

/**
 * Finds every junction part way along a leg — where a point of another leg
 * lies on it, or another leg crosses it — and notes each on the leg it
 * splits, as { t, point } (see `placeOnLeg`). A crossing splits both legs at
 * the same point, so both get the same node.
 *
 * Every leg is checked against every other whose box overlaps its own,
 * found by sorting the legs west to east and sweeping across them, so the
 * many legs of a long network are not all checked against each other.
 *
 * @param {Array<Object>} legs - From `legsOf`; their `splits` are filled in
 */
function findJunctions(legs) {
  const sorted = [...legs].sort((first, second) => first.minX - second.minX)
  sorted.forEach((first, i) => {
    for (let j = i + 1; j < sorted.length && sorted[j].minX <= first.maxX; j++) {
      const second = sorted[j]
      if (second.minY > first.maxY || second.maxY < first.minY) continue
      const firstKeys = [first.aKey, first.bKey]
      const secondKeys = [second.aKey, second.bKey]

      // A point of one leg lying part way along the other
      ;[
        [first, second, secondKeys],
        [second, first, firstKeys]
      ].forEach(([leg, other, otherKeys]) => {
        ;[
          [leg.a, leg.aKey],
          [leg.b, leg.bKey]
        ].forEach(([point, key]) => {
          if (otherKeys.includes(key)) return
          const t = partWayAlong(point, other)
          if (t !== null) other.splits.push({ t, point })
        })
      })

      // Legs that share a point cannot also cross part way along both
      if (firstKeys.some((key) => secondKeys.includes(key))) continue
      const crossed = crossing(first, second)
      if (crossed) {
        first.splits.push({ t: crossed.s, point: crossed.point })
        second.splits.push({ t: crossed.t, point: crossed.point })
      }
    }
  })
}

/**
 * The key a point is filed under. Rounded to six decimal places (about a
 * tenth of a meter), so the same point read back from a save — or from a
 * town's own coordinates — files under the same key.
 * @param {{lat: number, lng: number}} point - The point
 * @returns {string} Its key
 */
export function pointKey({ lat, lng }) {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`
}

/**
 * The key of the node a town sits on.
 * @param {Object} town - A town, with lat and lon
 * @returns {string} Its key
 */
export function townKey(town) {
  return pointKey({ lat: town.lat, lng: town.lon })
}

/**
 * Builds the network from the track and towns.
 *
 * @param {Array<Object>} segments - Every section of track, each with
 *   `ownerId` and `coordinates` [{lat, lng}, ...]
 * @param {Array<Object>} towns - Every town, each with lat and lon
 * @returns {{nodes: Map<string, Object>, adjacency: Map<string, Array<Object>>}}
 *   `nodes` maps each key to { key, lat, lng, town } (`town` null where no
 *   town sits); `adjacency` maps each key to the stretches of track leaving
 *   it, each { to, km, ownerId }
 */
export function buildNetwork(segments, towns) {
  const nodes = new Map()
  const adjacency = new Map()

  const addNode = (point, town = null) => {
    const key = pointKey(point)
    const existing = nodes.get(key)
    if (existing) {
      if (town && !existing.town) existing.town = town
      return key
    }
    nodes.set(key, { key, lat: point.lat, lng: point.lng, town })
    adjacency.set(key, [])
    return key
  }

  towns.forEach((town) => addNode({ lat: town.lat, lng: town.lon }, town))

  const legs = legsOf(segments)
  findJunctions(legs)

  // Each leg runs from one end to the other through its junctions in order,
  // a stretch of track between each stop and the next
  legs.forEach((leg) => {
    const stops = [
      leg.a,
      ...leg.splits.sort((first, second) => first.t - second.t).map(({ point }) => point),
      leg.b
    ]
    stops.slice(1).forEach((to, i) => {
      const from = stops[i]
      const a = addNode(from)
      const b = addNode(to)
      // Two junctions at the same point (two legs crossing there) are one
      if (a === b) return
      const km = kmBetween(from, to)
      adjacency.get(a).push({ to: b, km, ownerId: leg.ownerId })
      adjacency.get(b).push({ to: a, km, ownerId: leg.ownerId })
    })
  })

  return { nodes, adjacency }
}

/**
 * Whether a point lies on a section of track in a way that joins it: exactly
 * on one of its points (the same key), or part way along one of its legs, as
 * the map draws them (see the module notes) — the two ways `buildNetwork`
 * joins a point to track. A point within a hair of an end or bend without
 * being on it would not join, so it does not count. Where a player may start
 * a new section: anywhere on their own track, since the new section joins
 * the network wherever it starts on it.
 * @param {{lat: number, lng: number}} point - The point
 * @param {Array<Object>} segments - The sections to look on
 * @returns {boolean} True if the point is on one of them
 */
export function liesOnTrack(point, segments) {
  const key = pointKey(point)
  return legsOf(segments).some(
    (leg) => leg.aKey === key || leg.bKey === key || partWayAlong(point, leg) !== null
  )
}

/**
 * A train position standing on a node.
 * @param {Object} network - From `buildNetwork`
 * @param {string} key - The node's key
 * @param {string|null} [cameFrom] - The node the train arrived from
 * @returns {Object} The position
 */
export function positionAtNode(network, key, cameFrom = null) {
  const node = network.nodes.get(key)
  return {
    lat: node.lat,
    lng: node.lng,
    nodeKey: key,
    townId: node.town?.msa ?? null,
    cameFrom,
    ahead: null,
    ownerId: null
  }
}

/**
 * The first steps a train may take from where it stands: the stretches of
 * track it may set off along, honoring the no-reversing rule.
 * @param {Object} network - From `buildNetwork`
 * @param {Object} position - Where the train is (see the module notes)
 * @returns {Array<{from: string|null, behind?: string, to: string, km: number,
 *   ownerId: number}>} Each first step; `from` is the node set off from, or
 *   null when the train is part way along a stretch, and then `behind` is
 *   the node just behind it there (see `stretchAt`)
 */
function firstSteps(network, position) {
  if (position.nodeKey) {
    const node = network.nodes.get(position.nodeKey)
    if (!node) return []
    // Only a town is somewhere a train may turn round
    const mayReverse = Boolean(node.town)
    return network.adjacency
      .get(position.nodeKey)
      .filter((edge) => mayReverse || edge.to !== position.cameFrom)
      .map((edge) => ({ from: position.nodeKey, ...edge }))
  }

  // Part way along a stretch: only onward, to the node ahead
  const { behind, ahead } = stretchAt(network, position)
  const aheadNode = network.nodes.get(ahead)
  if (!aheadNode) return []
  return [
    {
      from: null,
      behind,
      to: ahead,
      km: kmBetween(position, aheadNode),
      ownerId: position.ownerId
    }
  ]
}

/**
 * The stretch of track a train stopped part way along is on now: the nodes
 * just behind and just ahead of it.
 *
 * Those are `cameFrom` and `ahead` as the train stopped, unless track built
 * since has put a junction between it and one of them — a line crossing the
 * leg, or drawn to the middle of it. Such a junction lies on the line from
 * `cameFrom` to `ahead`, so the stretch is found by walking that line from
 * `cameFrom`, node by node, until the next node is past the train.
 *
 * @param {Object} network - From `buildNetwork`
 * @param {Object} position - A position part way along a stretch (see the
 *   module notes)
 * @returns {{behind: string, ahead: string}} The node keys behind and ahead
 *   of the train; `cameFrom` and `ahead` as they are when either is no
 *   longer on the network, or no track joins them any more
 */
export function stretchAt(network, position) {
  const asStopped = { behind: position.cameFrom, ahead: position.ahead }
  const start = network.nodes.get(position.cameFrom)
  const end = network.nodes.get(position.ahead)
  if (!start || !end) return asStopped
  const leg = { a: start, b: end, A: toMercator(start), B: toMercator(end) }
  const trainAt = placeOnLeg(position, leg).t

  let behind = position.cameFrom
  let behindAt = 0
  for (;;) {
    // The nearest node further along the line than `behind`, joined to it
    let next = null
    network.adjacency.get(behind).forEach(({ to }) => {
      let at = 1
      if (to !== position.ahead) {
        const { t, km } = placeOnLeg(network.nodes.get(to), leg)
        if (km > TOUCH_KM || t <= behindAt || t >= 1) return
        at = t
      }
      if (!next || at < next.at) next = { key: to, at }
    })
    if (!next) return asStopped
    // A junction exactly where the train stands counts as ahead of it
    if (next.at >= trainAt) return { behind, ahead: next.key }
    behind = next.key
    behindAt = next.at
  }
}

/**
 * The shortest way from where a train stands to every node it can reach.
 *
 * The no-reversing rule depends on which way the train is going, not only
 * where it is, so the search is over arrivals — "at this node, having come
 * from that one" — rather than over nodes. From an arrival the train may go
 * on along any stretch except the one back where it came from, unless the
 * node is a town. Searching nodes alone would let a route turn round on any
 * bend: out one stretch and straight back.
 *
 * @param {Object} network - From `buildNetwork`
 * @param {Object} position - Where the train is (see the module notes)
 * @param {Object} [options]
 * @param {Set<number>|null} [options.owners] - Whose track may be used; null
 *   for anyone's
 * @returns {Map<string, {km: number, steps: Array<Object>}>} For each node
 *   reached, its distance and the steps there, each { from, to, km, ownerId }
 *   in order; the node the train stands on is not included
 */
export function shortestRoutes(network, position, { owners = null } = {}) {
  const isAllowed = (edge) => !owners || owners.has(edge.ownerId)
  // The best way found to each arrival, keyed "from>to": how far, the step
  // that arrived, and the arrival it came on from (null for a first step).
  // `behind` is the node just left, which the train may not go straight
  // back to. Only the last step is kept; a route is read back at the end.
  const arrivals = new Map()
  const settled = new Set()
  const frontier = new MinHeap()

  const offer = (behind, step, km, previous) => {
    const key = `${behind}>${step.to}`
    const known = arrivals.get(key)
    if (known && known.km <= km) return
    arrivals.set(key, { behind, step, km, previous })
    frontier.push(km, key)
  }

  firstSteps(network, position)
    .filter(isAllowed)
    // Set off part way along a stretch, the node behind is the one just
    // behind the train on it
    .forEach((step) => offer(step.from ?? step.behind, step, step.km, null))

  // For each node, the arrival that reaches it soonest
  const nearest = new Map()
  while (frontier.size) {
    const key = frontier.pop()
    if (settled.has(key)) continue
    settled.add(key)

    const { behind, step, km } = arrivals.get(key)
    const here = step.to
    if (!nearest.has(here)) nearest.set(here, key)

    const mayReverse = Boolean(network.nodes.get(here).town)
    network.adjacency
      .get(here)
      .filter((edge) => isAllowed(edge) && (mayReverse || edge.to !== behind))
      .forEach((edge) => offer(here, { from: here, ...edge }, km + edge.km, key))
  }

  // Each node's route, read back from its arrival through the ones before
  const best = new Map()
  nearest.forEach((key, node) => {
    const steps = []
    for (let at = key; at !== null; at = arrivals.get(at).previous) {
      steps.unshift(arrivals.get(at).step)
    }
    best.set(node, { km: arrivals.get(key).km, steps })
  })

  // A train already standing on a node has nowhere to go to reach it
  if (position.nodeKey) best.delete(position.nodeKey)
  return best
}

/**
 * The town nearest a train by track, to say where a train stopped out on
 * the line is ("3 spaces away from Pueblo").
 *
 * Measured along the track, on anyone's, in either direction: the
 * no-reversing rule is ignored, since this describes where the train is, not
 * where it can go. A train waiting at the end of its track, with no town
 * ahead, is still near the town behind it.
 *
 * @param {Object} network - From `buildNetwork`
 * @param {Object} position - Where the train is (see the module notes)
 * @returns {{town: Object, km: number}|null} The town and how far it is by
 *   track (0 for a train standing in it), or null if no track leads to one
 */
export function nearestTown(network, position) {
  // Where the search starts: the node the train is on, or, part way along a
  // stretch, the nodes at either end of it (see `stretchAt`), each as far as
  // the train is from it. A node no longer on the network (say, a save whose
  // towns have since changed) is no place to start from.
  const stretch = position.nodeKey ? null : stretchAt(network, position)
  const starts = (
    position.nodeKey
      ? [{ key: position.nodeKey, km: 0 }]
      : [stretch.behind, stretch.ahead].map((key) => ({
          key,
          km: network.nodes.has(key) ? kmBetween(position, network.nodes.get(key)) : 0
        }))
  ).filter(({ key }) => network.nodes.has(key))

  // The shortest way found to each node so far
  const best = new Map()
  const frontier = new MinHeap()
  const offer = (key, km) => {
    if (best.has(key) && best.get(key) <= km) return
    best.set(key, km)
    frontier.push(km, key)
  }
  starts.forEach(({ key, km }) => offer(key, km))

  const settled = new Set()
  while (frontier.size) {
    const key = frontier.pop()
    if (settled.has(key)) continue
    settled.add(key)
    const km = best.get(key)
    // Nodes come out nearest first, so the first town out is the nearest
    const town = network.nodes.get(key).town
    if (town) return { town, km }
    network.adjacency.get(key).forEach((edge) => offer(edge.to, km + edge.km))
  }
  return null
}

/**
 * A binary min-heap of keys by distance, for the route search: the nearest
 * waiting arrival comes out first. A key may be pushed again with a shorter
 * distance; the search skips the longer copy when it comes out later.
 *
 * Exported for the computer player's track search too (see
 * bot/botPathfinder.js), which files grid cells by what they cost to reach
 * rather than by km; the heap only ever compares the numbers.
 */
export class MinHeap {
  constructor() {
    this.items = []
  }

  get size() {
    return this.items.length
  }

  /**
   * @param {number} km - The distance it is filed by
   * @param {string} key - What is filed
   */
  push(km, key) {
    const items = this.items
    items.push({ km, key })
    let i = items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (items[parent].km <= items[i].km) break
      ;[items[parent], items[i]] = [items[i], items[parent]]
      i = parent
    }
  }

  /** @returns {string} The key with the least distance, taken out */
  pop() {
    const items = this.items
    const top = items[0]
    const last = items.pop()
    if (items.length) {
      items[0] = last
      let i = 0
      for (;;) {
        const left = 2 * i + 1
        const right = left + 1
        let least = i
        if (left < items.length && items[left].km < items[least].km) least = left
        if (right < items.length && items[right].km < items[least].km) least = right
        if (least === i) break
        ;[items[least], items[i]] = [items[i], items[least]]
        i = least
      }
    }
    return top.key
  }
}

/**
 * Runs a train along a route as far as it can go.
 *
 * The train follows the steps in order until the route ends or the
 * kilometers run out. If they run out part way along a stretch, the train
 * stops there.
 *
 * @param {Object} network - From `buildNetwork`
 * @param {Object} position - Where the train starts
 * @param {Array<Object>} steps - The route, from `shortestRoutes`
 * @param {number} maxKm - How far the train may go
 * @returns {{position: Object, km: number, arrived: boolean, ownersUsed:
 *   Set<number>}} Where the train ends up, how far it went, whether it got to
 *   the end of the route, and whose track it ran on
 */
export function runRoute(network, position, steps, maxKm) {
  let km = 0
  let current = position
  const ownersUsed = new Set()

  for (const step of steps) {
    const left = maxKm - km
    if (left <= KM_EPSILON) break

    ownersUsed.add(step.ownerId)
    if (step.km <= left + KM_EPSILON) {
      km += step.km
      // The node it came from: the one the step set off from, or, for a step
      // begun part way along a stretch, the node behind it on that stretch
      current = positionAtNode(network, step.to, step.from ?? step.behind)
      continue
    }

    // Runs out part way along this stretch. The spot is found on the map's
    // projection, where the stretch is drawn straight, so the train stands on
    // the line as drawn — and where `stretchAt` measures junctions along it.
    const from = toMercator(step.from ? network.nodes.get(step.from) : current)
    const to = toMercator(network.nodes.get(step.to))
    const share = left / step.km
    km += left
    current = {
      ...fromMercator({
        x: from.x + (to.x - from.x) * share,
        y: from.y + (to.y - from.y) * share
      }),
      nodeKey: null,
      townId: null,
      cameFrom: step.from ?? step.behind,
      ahead: step.to,
      ownerId: step.ownerId
    }
    return { position: current, km, arrived: false, ownersUsed }
  }

  const arrived = steps.length > 0 && current.nodeKey === steps.at(-1).to
  return { position: current, km, arrived, ownersUsed }
}

/**
 * The most major cities a player's own track joins together: the largest
 * number of major cities ("large" towns) on any one connected piece of their
 * network. Cities on two separate pieces of track are not joined.
 *
 * @param {Object} network - From `buildNetwork`
 * @param {number} ownerId - The player
 * @returns {number} How many major cities their best-joined piece reaches
 */
export function majorCitiesJoined(network, ownerId) {
  // Union-find over the nodes the player's own track touches
  const parent = new Map()
  const find = (key) => {
    while (parent.get(key) !== key) {
      parent.set(key, parent.get(parent.get(key)))
      key = parent.get(key)
    }
    return key
  }

  network.adjacency.forEach((edges, key) => {
    edges
      .filter((edge) => edge.ownerId === ownerId)
      .forEach((edge) => {
        if (!parent.has(key)) parent.set(key, key)
        if (!parent.has(edge.to)) parent.set(edge.to, edge.to)
        parent.set(find(key), find(edge.to))
      })
  })

  const citiesPerPiece = new Map()
  parent.forEach((_, key) => {
    if (network.nodes.get(key).town?.size !== 'large') return
    const piece = find(key)
    citiesPerPiece.set(piece, (citiesPerPiece.get(piece) ?? 0) + 1)
  })
  return Math.max(0, ...citiesPerPiece.values())
}
