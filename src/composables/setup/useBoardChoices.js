/**
 * Board Choices (useBoardChoices.js)
 *
 * What the Area Select screen offers: the ways of choosing a board (a
 * grouping of regions — see config/regions.js — or single states), the one
 * being shown, and the boards it offers (see boards.js).
 *
 * The state outlines are fetched once, when the screen opens. A grouping's
 * boards are worked out the first time it is shown, and kept for the rest of
 * the visit. Joining states into regions takes about a second for the
 * biggest; the work waits until the button just clicked has been drawn
 * pressed, and the map shows the last grouping's boards until it is done.
 *
 * @module composables/setup/useBoardChoices
 */

import { ref, shallowRef, watch } from 'vue'
import { boardGroupings, boardsFor } from '@/composables/setup/boards'

/** Where the state outlines are */
const STATES_FILE = '/data/us-states.geojson'

/**
 * The boards to choose from, by grouping.
 * @returns {Object} `groupings` (every way of choosing), `grouping` (the
 *   id of the one shown), `boards` (its boards), `stateFeatures` (every
 *   state's outline, for drawing the state lines), `error` (why the outlines
 *   could not be had, or null) and `load` (fetches the outlines)
 */
export function useBoardChoices() {
  /** Every state's outline, once fetched */
  const stateFeatures = shallowRef([])

  /** Every way of choosing a board, in the order the screen offers them */
  const groupings = boardGroupings()

  /** The grouping shown on the map: the first offered, when the screen opens */
  const grouping = ref(groupings[0].id)

  /** Why the outlines could not be fetched, for the screen; null if they were */
  const error = ref(null)

  /** Each grouping's boards, once worked out */
  const boardsByGrouping = new Map()

  /** The boards the grouping shown offers */
  const boards = shallowRef([])

  /**
   * Shows the boards of the grouping chosen, working them out first if this
   * is the first time it is shown. A grouping chosen while another was being
   * worked out wins: only the latest choice is shown.
   */
  async function showGrouping() {
    if (stateFeatures.value.length === 0) return
    const wanted = grouping.value
    if (!boardsByGrouping.has(wanted)) {
      // Let the page draw the button pressed before the work holds it up
      await new Promise((resolve) => setTimeout(resolve, 0))
      boardsByGrouping.set(wanted, boardsFor(wanted, stateFeatures.value))
    }
    if (grouping.value === wanted) boards.value = boardsByGrouping.get(wanted)
  }

  watch([grouping, stateFeatures], showGrouping)

  /** Fetches the state outlines */
  async function load() {
    try {
      const response = await fetch(STATES_FILE)
      if (!response.ok) throw new Error(`State outlines request failed: ${response.status}`)
      const { features } = await response.json()
      if (!Array.isArray(features)) throw new Error('The state outlines file has no features')
      stateFeatures.value = features
      error.value = null
    } catch (e) {
      console.error('Could not load the state outlines:', e)
      error.value = 'Could not load the map of the states. Reload the page to try again.'
    }
  }

  return { groupings, grouping, boards, stateFeatures, error, load }
}
