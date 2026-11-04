/**
 * Reveal on Change (useRevealOnChange.js)
 *
 * Brings an element into sight inside the panel it scrolls in, each time
 * something new appears in it.
 *
 * Made for the build controls in the player dock: as track is drawn, the
 * running cost, a warning about going over budget, and the list of sections
 * built this turn all appear in the controls. When the dock is shorter than
 * its contents, they could appear below the fold, where the player never
 * sees them.
 *
 * Only the nearest panel that scrolls on its own is moved, never the page.
 * In the narrow layout the dock is stacked under the map and the page itself
 * scrolls; scrolling the page there would pull the map out from under the
 * player in the middle of drawing on it. With no scrolling panel around the
 * element, nothing moves at all.
 *
 * @module composables/useRevealOnChange
 */

import { watch, unref } from 'vue'

/**
 * Space left between a revealed element and the edge of its panel, in px,
 * so the element does not sit flush against it.
 */
export const REVEAL_MARGIN_PX = 12

/**
 * Scrolls the element into sight in its panel whenever one of the sources
 * brings something new to show (see `isNewInformation`). Something going
 * away — a warning cleared, drawing stopped, a section torn up — moves
 * nothing: the player may have scrolled the panel to where they want it, and
 * there is nothing new to point them at.
 *
 * Runs after the DOM has updated, so the new content is already there to be
 * measured.
 *
 * @param {import('vue').Ref<HTMLElement|null>} target - The element to bring into sight
 * @param {Array} sources - What to watch, in any form `watch` takes as an array
 */
export function useRevealOnChange(target, sources) {
  watch(
    sources,
    (now, before) => {
      if (now.some((value, i) => isNewInformation(value, before[i]))) reveal(unref(target))
    },
    { flush: 'post' }
  )
}

/**
 * Whether a source's change brings something new to show.
 *
 * A count is new information when it goes up (a section built), not down.
 * Anything else is when it turns to something there to show — true, a
 * message — or to a different one (one error message replaced by another);
 * not when it is cleared.
 *
 * @param {*} now - The source's value now
 * @param {*} before - Its value before the change
 * @returns {boolean} True if there is something new to show
 */
export function isNewInformation(now, before) {
  if (typeof now === 'number') return now > (before ?? 0)
  return Boolean(now) && now !== before
}

/**
 * How far a panel has to scroll to bring an element into sight, the way
 * `scrollIntoView` does it with `block: 'nearest'`: not at all if it is in
 * sight already, up if it is hidden above, and down if it is hidden below.
 *
 * Going down, it stops short of pushing the element's top out of sight, so
 * an element taller than the panel shows from its top.
 *
 * @param {{top: number, bottom: number}} element - The element's box on screen
 * @param {{top: number, bottom: number}} panel - The panel's box on screen
 * @param {number} [margin] - Space to leave at the panel's edge, in px
 * @returns {number} Pixels to scroll: below zero up, above zero down
 */
export function revealDistance(element, panel, margin = REVEAL_MARGIN_PX) {
  const hiddenAbove = panel.top - element.top + margin
  if (hiddenAbove > 0) return -hiddenAbove
  const hiddenBelow = element.bottom - panel.bottom + margin
  if (hiddenBelow <= 0) return 0
  return Math.min(hiddenBelow, element.top - panel.top - margin)
}

/**
 * Scrolls the nearest scrolling panel around an element far enough to bring
 * it into sight (see `revealDistance`). An element not on screen at all — in
 * a collapsed section, or on the hidden side of a switch — is left alone.
 *
 * @param {HTMLElement|null} element - The element to show
 */
function reveal(element) {
  if (!element || element.getClientRects().length === 0) return
  const panel = scrollingPanel(element)
  if (!panel) return

  const distance = revealDistance(element.getBoundingClientRect(), panel.getBoundingClientRect())
  if (distance !== 0) panel.scrollBy({ top: distance, behavior: 'smooth' })
}

/**
 * The nearest element around this one that scrolls on its own: set to
 * scroll vertically, and with more content than room. The page (`<body>`
 * and `<html>`) is never counted, for the reason at the top of this file.
 *
 * @param {HTMLElement} element - Where to start looking, outward
 * @returns {HTMLElement|null} The panel, or null if there is none
 */
function scrollingPanel(element) {
  for (let el = element.parentElement; el && el !== document.body; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el)
    const scrolls = overflowY === 'auto' || overflowY === 'scroll'
    if (scrolls && el.scrollHeight > el.clientHeight) return el
  }
  return null
}
