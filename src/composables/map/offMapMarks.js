/**
 * Off-Map Marks (offMapMarks.js)
 *
 * In the Build view the map is zoomed in, so the town a player is building
 * toward is usually off the screen. (The board game never has this problem:
 * the whole board is always in front of the players.) For the demand lines
 * marked on the map (see demandMarks.js), this works out which of their
 * towns lie off the screen, and where along the map's edge to put a label
 * for each, with an arrow pointing the way the town lies.
 *
 * For each marked line it labels:
 *
 * - its destination, when that is off the screen;
 * - the town producing its commodity nearest the middle of the screen, when
 *   no town producing it is on the screen. Only the nearest one, since a
 *   commodity can be made in many towns and a label for each would crowd
 *   the edge.
 *
 * Each label sits where a line from the middle of the screen to its town
 * crosses the map's edge. Labels that would land on top of each other are
 * spread out along the edge (see `layoutEdgeLabels`).
 *
 * Pure: everything is in screen pixels, handed in by useOffMapMarks, which
 * draws the labels. That keeps the rules testable without a map.
 *
 * @module composables/map/offMapMarks
 */

/**
 * The towns of some demand lines that need a label on the map's edge.
 *
 * A town wanted for the same reason by several lines (two lines hauling Coal
 * from the same town, say) gets one label carrying all their colors, as its
 * halo on the map stacks them into rings.
 *
 * @param {Array<{destination: string, industry: string, color: string}>} lines -
 *   The marked lines, in order (the demand cards store's `markedLines`)
 * @param {Array<Object>} towns - Every town, with its name, msa and industries
 * @param {function(Object): {x: number, y: number}} pointOf - Where a town is
 *   on the screen, in pixels from the map's top-left corner (it may be far
 *   outside the map)
 * @param {{width: number, height: number}} size - The map's size in pixels
 * @returns {Array<{key: string, kind: 'destination'|'producer', town: Object,
 *   industry: string, colors: Array<string>, point: {x: number, y: number}}>}
 *   One entry per label, in the order the lines came; `key` is unique to
 *   each and stays the same while the label means the same thing
 */
export function offMapTargets(lines, towns, pointOf, size) {
  const onScreen = ({ x, y }) => x >= 0 && x <= size.width && y >= 0 && y <= size.height
  const center = { x: size.width / 2, y: size.height / 2 }
  const targets = new Map()

  /** Adds a label for a town, or adds a color to the one it already has */
  function add(kind, town, industry, color, point) {
    const key = `${kind}|${town.msa}|${industry}`
    const existing = targets.get(key)
    if (existing) {
      if (!existing.colors.includes(color)) existing.colors.push(color)
      return
    }
    targets.set(key, { key, kind, town, industry, colors: [color], point })
  }

  lines.forEach(({ destination, industry, color }) => {
    // Demands name their towns, so the destination is found by name
    const destinationTown = towns.find(({ name }) => name === destination)
    if (destinationTown) {
      const point = pointOf(destinationTown)
      if (!onScreen(point)) add('destination', destinationTown, industry, color, point)
    }

    const producers = towns
      .filter((town) => town.industries.some(({ name }) => name === industry))
      .map((town) => ({ town, point: pointOf(town) }))
    // One producer in sight is enough: the player can see where to go
    if (producers.length === 0 || producers.some(({ point }) => onScreen(point))) return
    const nearest = producers.reduce((best, candidate) =>
      distance(candidate.point, center) < distance(best.point, center) ? candidate : best
    )
    add('producer', nearest.town, industry, color, nearest.point)
  })

  return [...targets.values()]
}

/**
 * Straight-line distance between two screen points.
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b
 * @returns {number} Pixels
 */
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Where a line from a point inside a rectangle, heading toward a target,
 * leaves the rectangle: the spot on the map's edge a label for that target
 * is anchored to.
 *
 * The line leaves through whichever side it reaches first. Heading exactly
 * into a corner counts as the top or bottom side.
 *
 * @param {{x: number, y: number}} from - The start, inside the rectangle (the
 *   middle of the map)
 * @param {{x: number, y: number}} to - The target, outside the rectangle
 * @param {{left: number, top: number, right: number, bottom: number}} rect -
 *   The rectangle, in pixels
 * @returns {{side: 'top'|'bottom'|'left'|'right', x: number, y: number,
 *   angle: number}} The side it leaves by, the spot on that side, and the
 *   direction to the target in degrees clockwise from pointing right (the
 *   way screen y runs down), for turning the label's arrow
 */
export function edgeAnchor(from, to, rect) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  // How far along the line (as a share of the way to the target) it meets
  // the side it is heading for, across and up-down
  const acrossShare =
    dx > 0 ? (rect.right - from.x) / dx : dx < 0 ? (rect.left - from.x) / dx : Infinity
  const downShare =
    dy > 0 ? (rect.bottom - from.y) / dy : dy < 0 ? (rect.top - from.y) / dy : Infinity
  const share = Math.min(acrossShare, downShare)
  const side = acrossShare < downShare ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top'
  return {
    side,
    x: from.x + dx * share,
    y: from.y + dy * share,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI
  }
}

/**
 * Spreads boxes along a line so none overlaps the next, each staying as
 * near where it wants to be as it can, and all within a range.
 *
 * The boxes keep their order. They are pushed apart forward first, then
 * pulled back from the far end if that pushed the last past the range. If
 * they do not all fit, the first ones run off the near end of the range.
 *
 * @param {Array<{at: number, size: number}>} items - Each box's wanted
 *   center along the line, and its length along it
 * @param {number} min - Where the range starts
 * @param {number} max - Where the range ends
 * @param {number} gap - The space to leave between boxes
 * @returns {Array<number>} Each box's center, in the order given
 */
export function spreadAlong(items, min, max, gap) {
  const order = items.map((item, index) => ({ ...item, index })).sort((a, b) => a.at - b.at)
  const centers = order.map(({ at, size }) =>
    Math.min(Math.max(at, min + size / 2), max - size / 2)
  )

  for (let i = 1; i < order.length; i++) {
    const least = centers[i - 1] + (order[i - 1].size + order[i].size) / 2 + gap
    centers[i] = Math.max(centers[i], least)
  }
  const last = order.length - 1
  if (last >= 0) centers[last] = Math.min(centers[last], max - order[last].size / 2)
  for (let i = last - 1; i >= 0; i--) {
    const most = centers[i + 1] - (order[i].size + order[i + 1].size) / 2 - gap
    centers[i] = Math.min(centers[i], most)
  }

  const result = []
  order.forEach(({ index }, i) => (result[index] = centers[i]))
  return result
}

/**
 * Places the edge labels: each against its side of the map, as near its
 * anchor as it can be without overlapping another label on the same side.
 *
 * Left and right labels stack up and down their side; top and bottom labels
 * line up across theirs. Each side has its own stretch to use (`ranges`),
 * so the left and right columns can stop short of the top and bottom rows
 * (and of the map's buttons) instead of colliding with them in the corners.
 *
 * @param {Array<{key: string, side: string, x: number, y: number, width: number,
 *   height: number}>} labels - Each label's anchor on the edge (see
 *   `edgeAnchor`) and its size
 * @param {Object} frame - Where the labels go
 * @param {{left: number, top: number, right: number, bottom: number}} frame.rect -
 *   The rectangle the labels sit just inside
 * @param {Object<string, Array<number>>} frame.ranges - For each side, the
 *   [start, end] of the stretch of it its labels may use: across for top
 *   and bottom, down for left and right
 * @param {number} frame.gap - The space to leave between labels
 * @returns {Map<string, {x: number, y: number}>} Each label's center, by key
 */
export function layoutEdgeLabels(labels, { rect, ranges, gap }) {
  const centers = new Map()

  ;['top', 'bottom', 'left', 'right'].forEach((side) => {
    const onSide = labels.filter((label) => label.side === side)
    const isRow = side === 'top' || side === 'bottom'
    const [min, max] = ranges[side]
    const along = spreadAlong(
      onSide.map((label) =>
        isRow ? { at: label.x, size: label.width } : { at: label.y, size: label.height }
      ),
      min,
      max,
      gap
    )

    onSide.forEach((label, i) => {
      // Across the side, each label sits flush against it
      const across = {
        top: rect.top + label.height / 2,
        bottom: rect.bottom - label.height / 2,
        left: rect.left + label.width / 2,
        right: rect.right - label.width / 2
      }[side]
      centers.set(label.key, isRow ? { x: along[i], y: across } : { x: across, y: along[i] })
    })
  })

  return centers
}
