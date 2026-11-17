/**
 * Train Status (trainStatus.js)
 *
 * The words for where a player's train is and where it is going, shared by
 * the dock's Train section and its "Move your train" step so the two always
 * say the same thing.
 *
 * Pure functions over what the trains store reports (see `destinations` and
 * `headingOf` there), so the wording can be tested without a game.
 *
 * @module composables/trainStatus
 */

import { formatDistance } from '@/composables/boardScale'

/**
 * How long a run takes, in words.
 * @param {{turns: number, runsNow: boolean}} timing - From the trains store's
 *   `turnsToRun`, as carried on a destination entry
 * @returns {string} "this turn" for a run that ends this turn, otherwise
 *   "1 turn", "3 turns"...
 */
export function turnsText({ turns, runsNow }) {
  if (runsNow && turns === 1) return 'this turn'
  return `${turns} ${turns === 1 ? 'turn' : 'turns'}`
}

/**
 * A distance in spaces, in words, as the player is shown every distance
 * (see formatDistance): rounded up, as a distance still to cover.
 * @param {number} km - The distance
 * @param {number} speedUnitKm - The board's speed unit
 * @returns {string} e.g. "1 space", "2.4 spaces"
 */
export function spacesText(km, speedUnitKm) {
  const spaces = formatDistance(km, speedUnitKm, 'up')
  return `${spaces} ${spaces === '1' ? 'space' : 'spaces'}`
}

/**
 * A point on the track, named for the player by the town nearest it.
 * @param {{near: Object|null, isEnd: boolean}} point - From the trains
 *   store's `trackPoint`
 * @returns {string} e.g. "the end of the line near Willmar", "the track near
 *   Pueblo", or, with no town reached by track, "the end of the line" or "a
 *   point on the track"
 */
export function trackPointName({ near, isEnd }) {
  if (isEnd) return near ? `the end of the line near ${near.name}` : 'the end of the line'
  return near ? `the track near ${near.name}` : 'a point on the track'
}

/**
 * A point on the track as a list names it, standing on its own rather than
 * inside a sentence: `trackPointName` without its "the" or "a", capitalized.
 * @param {{near: Object|null, isEnd: boolean}} point - As for `trackPointName`
 * @returns {string} e.g. "End of the line near Willmar", "Track near Pueblo"
 */
export function trackPointTitle(point) {
  const name = trackPointName(point).replace(/^(the|a) /, '')
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/**
 * Where a train is and where it is heading, in a sentence.
 *
 * @param {Object} status
 * @param {boolean} status.placed - Whether the train is on the board yet
 * @param {Object|null} status.town - The town it stands in, or null
 * @param {{town: Object|null, point: Object|null, route: Object|null}|null}
 *   status.heading - From the trains store's `headingOf`: a town, or a
 *   point on the track (see `trackPointName`)
 * @param {{town: Object, km: number}|null} [status.nearest] - The town
 *   nearest the train by track, and how far (the trains store's
 *   `nearestTownOf`), for a train stopped out on the line; null if no track
 *   leads to a town
 * @param {number} [status.speedUnitKm] - The board's speed unit, to give
 *   that distance in spaces as every distance is shown (see formatDistance)
 * @returns {string} e.g. "In Omaha", "Heading toward Denver, expected to
 *   arrive in 2 turns", "In Omaha, heading toward Denver (this turn)",
 *   "Heading toward the end of the line near Willmar, expected to arrive in
 *   2 turns", or "Stopped on the track 2.4 spaces away from Pueblo"
 */
export function whereabouts({ placed, town, heading, nearest = null, speedUnitKm }) {
  if (!placed) return 'Not on the board yet'
  if (!heading) {
    if (town) return `In ${town.name}`
    if (!nearest) return 'Stopped on the track'
    return `Stopped on the track ${spacesText(nearest.km, speedUnitKm)} away from ${nearest.town.name}`
  }

  const name = heading.town ? heading.town.name : trackPointName(heading.point)
  if (!heading.route) {
    const toward = `heading toward ${name}, but no track leads there now`
    return town ? `In ${town.name}, ${toward}` : capitalize(toward)
  }
  const when = turnsText(heading.route)
  if (town) return `In ${town.name}, heading toward ${name} (${when})`
  return `Heading toward ${name}, expected to arrive ${when === 'this turn' ? when : `in ${when}`}`
}

/**
 * @param {string} text - A sentence starting lowercase
 * @returns {string} The same, starting with a capital
 */
function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
