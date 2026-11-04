/**
 * useRevealOnChange Tests
 *
 * The build controls scroll whatever new appears in them into sight in the
 * player dock. These cover the two decisions behind that: which changes
 * count as something new to show, and how far the dock has to scroll to
 * show it. The scrolling itself is layout, and is not tested.
 */

import { describe, it, expect } from 'vitest'
import { isNewInformation, revealDistance } from '@/composables/useRevealOnChange'

describe('isNewInformation', () => {
  it('should count something turning on, such as a warning appearing', () => {
    expect(isNewInformation(true, false)).toBe(true)
  })

  it('should not count something turning off, such as a warning clearing', () => {
    expect(isNewInformation(false, true)).toBe(false)
  })

  it('should count a message appearing, or being replaced by another', () => {
    expect(isNewInformation('Over budget', '')).toBe(true)
    expect(isNewInformation('Leaves the state', 'Over budget')).toBe(true)
  })

  it('should not count a message being cleared', () => {
    expect(isNewInformation('', 'Over budget')).toBe(false)
  })

  it('should count a count going up, such as a section built', () => {
    expect(isNewInformation(3, 2)).toBe(true)
  })

  it('should not count a count going down, such as a section torn up', () => {
    expect(isNewInformation(1, 2)).toBe(false)
  })
})

describe('revealDistance', () => {
  /** A panel showing screen rows 100 to 400 */
  const panel = { top: 100, bottom: 400 }
  const margin = 10

  it('should not scroll for an element already in sight', () => {
    expect(revealDistance({ top: 200, bottom: 250 }, panel, margin)).toBe(0)
  })

  it('should scroll down far enough to show an element hidden below, and a margin', () => {
    expect(revealDistance({ top: 420, bottom: 450 }, panel, margin)).toBe(60)
  })

  it('should scroll up far enough to show an element hidden above, and a margin', () => {
    expect(revealDistance({ top: 50, bottom: 80 }, panel, margin)).toBe(-60)
  })

  it('should not push the top of an element taller than the panel out of sight', () => {
    // 500 tall in a 300 panel: scrolled until its top meets the margin
    expect(revealDistance({ top: 300, bottom: 800 }, panel, margin)).toBe(190)
  })
})
