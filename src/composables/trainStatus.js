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

// SENTENCES IN PIECES
//
// The dock's Train section sets each town's name the way the board labels
// towns, so the sentences below are built as a list of pieces, each plain
// words or a town's name. `joinParts` turns the pieces back into the plain
// sentence that everything else shows.

/**
 * A piece of plain words.
 * @param {string} text - The words
 * @returns {{text: string, isTown: boolean}} The piece
 */
const words = (text) => ({ text, isTown: false })

/**
 * A piece that is a town's name.
 * @param {string} name - The town's name
 * @returns {{text: string, isTown: boolean}} The piece
 */
const townName = (name) => ({ text: name, isTown: true })

/**
 * Puts the pieces of a sentence back together as plain text.
 * @param {Array<{text: string}>} parts - The pieces
 * @returns {string} The sentence
 */
const joinParts = (parts) => parts.map(({ text }) => text).join('')

/**
 * A point on the track, named by the town nearest it, in pieces (see
 * `trackPointName` for the wording).
 * @param {{near: Object|null, isEnd: boolean}} point - From the trains
 *   store's `trackPoint`
 * @returns {Array<{text: string, isTown: boolean}>} The pieces
 */
function trackPointParts({ near, isEnd }) {
  if (isEnd)
    return near
      ? [words('the end of the line near '), townName(near.name)]
      : [words('the end of the line')]
  return near ? [words('the track near '), townName(near.name)] : [words('a point on the track')]
}

/**
 * A point on the track, named for the player by the town nearest it.
 * @param {{near: Object|null, isEnd: boolean}} point - From the trains
 *   store's `trackPoint`
 * @returns {string} e.g. "the end of the line near Willmar", "the track near
 *   Pueblo", or, with no town reached by track, "the end of the line" or "a
 *   point on the track"
 */
export function trackPointName(point) {
  return joinParts(trackPointParts(point))
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
 * Where a train is and where it is heading, in a sentence. The plain-text
 * form of `whereaboutsParts`, which has the details.
 * @param {Object} status - As for `whereaboutsParts`
 * @returns {string} The sentence
 */
export function whereabouts(status) {
  return joinParts(whereaboutsParts(status))
}

/**
 * Where a train is and where it is heading, as a sentence in pieces, each
 * plain words or a town's name, so the Train section can set the names in
 * the board's town-name style. Every town named is marked: the one the train
 * is in, the one it is heading for, the nearest one to a train stopped on
 * the line, and the one a point on the track is named by.
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
 * @returns {Array<{text: string, isTown: boolean}>} The pieces, which read
 *   e.g. "In Omaha", "Heading toward Denver, expected to arrive in 2 turns",
 *   "In Omaha, heading toward Denver (this turn)", "Heading toward the end
 *   of the line near Willmar, expected to arrive in 2 turns", or "Stopped on
 *   the track 2.4 spaces away from Pueblo"
 */
export function whereaboutsParts({ placed, town, heading, nearest = null, speedUnitKm }) {
  if (!placed) return [words('Not on the board yet')]
  if (!heading) {
    if (town) return [words('In '), townName(town.name)]
    if (!nearest) return [words('Stopped on the track')]
    return [
      words(`Stopped on the track ${spacesText(nearest.km, speedUnitKm)} away from `),
      townName(nearest.town.name)
    ]
  }

  // The start of the sentence: the town the train is in, if it is in one,
  // then where it is heading — a town, or a point on the track named by its
  // nearest town
  const start = town
    ? [words('In '), townName(town.name), words(', heading toward ')]
    : [words('Heading toward ')]
  const goal = heading.town ? [townName(heading.town.name)] : trackPointParts(heading.point)

  if (!heading.route) return [...start, ...goal, words(', but no track leads there now')]
  const when = turnsText(heading.route)
  if (town) return [...start, ...goal, words(` (${when})`)]
  return [
    ...start,
    ...goal,
    words(`, expected to arrive ${when === 'this turn' ? when : `in ${when}`}`)
  ]
}
