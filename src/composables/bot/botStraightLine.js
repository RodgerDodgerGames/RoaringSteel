/**
 * Bot Straight Line (botStraightLine.js)
 *
 * How the Fast Bot lays out track (see config/botKinds.js). The Standard bot
 * searches the grid for the cheapest way to a town (see botPathfinder.js),
 * which winds up valleys and round hills: cheap to build, but long to run a
 * train over, and slow to work out on a big board. The Fast Bot builds
 * straight instead: from the point of its own track nearest the town it
 * wants — or the town it starts in, before it has any track — straight to
 * the town, paying whatever the ground on the way costs. Working that out
 * takes no search at all, and the track it builds is the shortest there is,
 * so its train covers more ground per turn.
 *
 * Demands are weighed by what the straight lines to their towns would cost
 * (see `straightRouter`). The line actually built is still held to every
 * build rule (`lineBlock`, the same check a person's line gets). One that
 * breaks a rule — a lake too wide to bridge in the way, a bend in the state
 * line, running alongside track, a full town — is planned with the Standard
 * bot's search instead, for that line only, so the Fast Bot is never stuck
 * where the Standard bot is not.
 *
 * The line is laid with a point about every cell's width, rather than as one
 * long leg, for two reasons:
 * - a line too dear to finish in one turn is built as far as the money goes
 *   (see `affordableSection`), which cuts at a point, so the points have to
 *   be close enough together to cut near where the money runs out;
 * - where the line passes through a town's cell, however little of it, it
 *   goes through the town itself, so the town joins the network on the way
 *   (the network only joins a town that track has a point on — see
 *   network.js). That bends the line by less than a cell.
 *
 * Pure functions over plain data, so they can be tested without a map.
 *
 * @module composables/bot/botStraightLine
 */

import { lineBlock } from '@/composables/map/buildRules'
import { kmBetween, cellPath } from '@/composables/map/trackCost'
import { cellKm, findCell } from '@/composables/map/cellGrid'
import { pointKey } from '@/composables/network'
import { planLine } from './botPathfinder'

/**
 * How far along the straight line from one point to another a point lies,
 * from 0 at the start to 1 at the end: where the point would land if moved
 * square onto the line. Measured in degrees, as the line's own points are
 * spaced (see `straightLine`), so the two put points in the same order.
 * @param {{lat: number, lng: number}} point - The point
 * @param {{lat: number, lng: number}} from - Where the line starts
 * @param {{lat: number, lng: number}} to - Where it ends
 * @returns {number} The share of the way along
 */
function shareAlong(point, from, to) {
  const dLat = to.lat - from.lat
  const dLng = to.lng - from.lng
  return ((point.lat - from.lat) * dLat + (point.lng - from.lng) * dLng) / (dLat ** 2 + dLng ** 2)
}

/**
 * A straight line of track from one point to another (see the module notes):
 * points evenly spaced along it, a cell's height or less apart, and the town
 * of every town cell it passes through, however little of the cell, in its
 * place along the way. No point is left in a town's cell but the town, so
 * the line goes through each such town once. The towns at the line's two
 * ends are left alone: the line starts and ends where it is told to.
 * @param {{lat: number, lng: number}} from - Where the line starts
 * @param {{lat: number, lng: number}} to - Where it ends
 * @param {Object} grid - The grid
 * @param {Map<number, {lat: number, lng: number}>} [townIn] - The town in
 *   each town cell (see `townsByCell`); without it, no town is gone through
 * @returns {Array<{lat: number, lng: number}>|null} The line's points, from
 *   `from` to `to`, or null if the two are the same point
 */
export function straightLine(from, to, grid, townIn = new Map()) {
  const km = kmBetween(from, to)
  if (km === 0) return null

  // The town cells the line passes through on the way, found exactly (see
  // `cellPath`), leaving out those it starts and ends in
  const ends = new Set([findCell(from, grid), findCell(to, grid)])
  const townCellsCrossed = new Set(
    cellPath([from, to], grid).filter((cell) => townIn.has(cell) && !ends.has(cell))
  )

  // Each point with its share of the way along, so the towns can be put in
  // among the evenly spaced points in order
  const steps = Math.max(1, Math.ceil(km / cellKm(grid)))
  const between = []
  for (let step = 1; step < steps; step++) {
    const along = step / steps
    const point = {
      lat: from.lat + (to.lat - from.lat) * along,
      lng: from.lng + (to.lng - from.lng) * along
    }
    if (!townCellsCrossed.has(findCell(point, grid))) between.push({ point, along })
  }
  townCellsCrossed.forEach((cell) => {
    const town = townIn.get(cell)
    const along = shareAlong(town, from, to)
    // A town a cell's corner is clipped off of can lie square to the line
    // beyond one of its ends; it is gone through only if it is between them
    if (along > 0 && along < 1) between.push({ point: { lat: town.lat, lng: town.lng }, along })
  })
  between.sort((a, b) => a.along - b.along)

  return [
    { lat: from.lat, lng: from.lng },
    ...between.map(({ point }) => point),
    { lat: to.lat, lng: to.lng }
  ]
}

/**
 * The point nearest a target, out of some.
 * @param {Array<{lat: number, lng: number}>} points - The points
 * @param {{lat: number, lng: number}} target - The target
 * @returns {{lat: number, lng: number}|null} The nearest, or null if there
 *   are none
 */
export function nearestPoint(points, target) {
  let nearest = null
  let nearestKm = Infinity
  points.forEach((point) => {
    const km = kmBetween(point, target)
    if (km < nearestKm) {
      nearest = point
      nearestKm = km
    }
  })
  return nearest
}

/**
 * How the Fast Bot plans track from a set of starting places: what reaching
 * a point would cost, and the line it would build there (see the module
 * notes). Both start from the same straight line: from the starting place
 * nearest the point, straight to it (see `straightLine`).
 *
 * What reaching a point costs is the price of that straight line, as it
 * stands, whether or not it keeps to the rules. That is all the Fast Bot
 * weighs demands by, and it takes only pricing the line: checking every
 * line the bot weighs against the rules, and searching wherever one broke
 * them, took longer than the Standard bot's search does. Most straight lines
 * keep to the rules, so the price is usually that of the very line built;
 * where one does not, it is a guide, as the line actually built costs more.
 *
 * The line to a point is checked against the rules (`lineBlock`) only when
 * the bot comes to build it, and searched for (see `planLine`) only if it
 * breaks one. The search's board is asked for only then, so a caller can
 * put off working it out until it is needed, and share it between several
 * routers made for one look at the board — from each town a player could
 * start in, say.
 *
 * Each point's straight line, cost and line to build are worked out once,
 * and kept.
 *
 * @param {Object} options
 * @param {Object} options.rules - What lines are judged against, as the
 *   track builder holds them (`buildRules` in trackBuilder.js)
 * @param {Array<{lat: number, lng: number}>} options.sources - Where the
 *   player may start building
 * @param {Map<number, Object>} options.townIn - The town in each town cell
 *   (see `townsByCell`)
 * @param {Function} options.price - What a line would cost to build:
 *   (points) => dollars (see `priceSection` in trackBuilder.js)
 * @param {Function} options.board - () => the search's board (see
 *   `searchBoard`), asked for only when a search is needed
 * @returns {{costTo: Function, lineTo: Function}} `costTo(point)` is the
 *   price of the straight line to a point (nothing for a point the player
 *   builds from, Infinity with nowhere to start from); `lineTo(point)` is
 *   the line to build there, as `{line, route, blocked}`: the points (or
 *   null), how it was found ('straight', 'search', or null for no line), and
 *   the rule the straight line broke if it did (a `lineBlock` reason)
 */
export function straightRouter({ rules, sources, townIn, price, board }) {
  const straights = new Map()
  const costs = new Map()
  const plans = new Map()

  /**
   * The straight line to a point from the nearest starting place, worked out
   * once: `from`, that place (null with none), and `line`, the line (null
   * with nowhere to start from, or when the point is that place)
   */
  function straightTo(point) {
    const key = pointKey(point)
    if (!straights.has(key)) {
      const from = nearestPoint(sources, point)
      straights.set(key, { from, line: from && straightLine(from, point, rules.grid, townIn) })
    }
    return straights.get(key)
  }

  function costTo(point) {
    const key = pointKey(point)
    if (!costs.has(key)) {
      const { from, line } = straightTo(point)
      costs.set(key, line ? price(line) : from ? 0 : Infinity)
    }
    return costs.get(key)
  }

  function lineTo(point) {
    const key = pointKey(point)
    if (plans.has(key)) return plans.get(key)

    const { line } = straightTo(point)
    const blocked = line && lineBlock(line, rules, { isFinished: true })?.reason
    let made
    if (!line) {
      made = { line: null, route: null, blocked: null }
    } else if (!blocked) {
      made = { line, route: 'straight', blocked: null }
    } else {
      const searched = planLine(board(), sources, point)
      made = { line: searched, route: searched ? 'search' : null, blocked }
    }
    plans.set(key, made)
    return made
  }

  return { costTo, lineTo }
}
