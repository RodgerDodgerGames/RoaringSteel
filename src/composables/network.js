/**
 * Rail Network (network.js)
 *
 * The track on the board seen as a railway a train can run on: which places
 * are joined to which, by whose track, and how far apart they are.
 *
 * Track is stored as sections, each a line of points (see the track store).
 * Here every point becomes a stop on the network (a node), and each straight
 * leg between two points a stretch of track (an edge). Sections join where
 * they share a point: a section is always started in a town or on a point of
 * a section already built (an end or a bend), and a town clicked while
 * drawing puts the point exactly on the town, so shared points are exactly
 * equal. Lines that merely
 * cross do not join — as in Empire Builder, where lines cross at a milepost
 * but a train cannot turn from one onto the other there.
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
 * In both cases `lat`/`lng` is the spot itself.
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

  segments.forEach(({ ownerId, coordinates }) => {
    coordinates.slice(1).forEach((to, i) => {
      const from = coordinates[i]
      const a = addNode(from)
      const b = addNode(to)
      // A leg that starts and ends on the same point goes nowhere
      if (a === b) return
      const km = kmBetween(from, to)
      adjacency.get(a).push({ to: b, km, ownerId })
      adjacency.get(b).push({ to: a, km, ownerId })
    })
  })

  return { nodes, adjacency }
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
 * @returns {Array<{from: string|null, to: string, km: number, ownerId: number}>}
 *   Each first step; `from` is the node set off from, or null when the train
 *   is part way along a stretch
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
  const ahead = network.nodes.get(position.ahead)
  if (!ahead) return []
  return [
    {
      from: null,
      to: position.ahead,
      km: kmBetween(position, ahead),
      ownerId: position.ownerId
    }
  ]
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
    // Set off part way along a stretch, the node behind is the one it came from
    .forEach((step) => offer(step.from ?? position.cameFrom, step, step.km, null))

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
 * A binary min-heap of keys by distance, for the route search: the nearest
 * waiting arrival comes out first. A key may be pushed again with a shorter
 * distance; the search skips the longer copy when it comes out later.
 */
class MinHeap {
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
      current = positionAtNode(network, step.to, step.from ?? current.cameFrom)
      continue
    }

    // Runs out part way along this stretch
    const from = step.from ? network.nodes.get(step.from) : current
    const to = network.nodes.get(step.to)
    const share = left / step.km
    km += left
    current = {
      lat: from.lat + (to.lat - from.lat) * share,
      lng: from.lng + (to.lng - from.lng) * share,
      nodeKey: null,
      townId: null,
      cameFrom: step.from ?? current.cameFrom,
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
