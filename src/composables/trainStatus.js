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
 * Where a train is and where it is heading, in a sentence.
 *
 * @param {Object} status
 * @param {boolean} status.placed - Whether the train is on the board yet
 * @param {Object|null} status.town - The town it stands in, or null
 * @param {{town: Object, route: Object|null}|null} status.heading - From
 *   the trains store's `headingOf`
 * @param {{town: Object, km: number}|null} [status.nearest] - The town
 *   nearest the train by track, and how far (the trains store's
 *   `nearestTownOf`), for a train stopped out on the line; null if no track
 *   leads to a town
 * @param {number} [status.speedUnitKm] - The board's speed unit, to give
 *   that distance in spaces as every distance is shown (see formatDistance)
 * @returns {string} e.g. "In Omaha", "Heading toward Denver, expected to
 *   arrive in 2 turns", "In Omaha, heading toward Denver (this turn)", or
 *   "Stopped on the track 2.4 spaces away from Pueblo"
 */
export function whereabouts({ placed, town, heading, nearest = null, speedUnitKm }) {
  if (!placed) return 'Not on the board yet'
  if (!heading) {
    if (town) return `In ${town.name}`
    if (!nearest) return 'Stopped on the track'
    return `Stopped on the track ${spacesText(nearest.km, speedUnitKm)} away from ${nearest.town.name}`
  }

  const name = heading.town.name
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
