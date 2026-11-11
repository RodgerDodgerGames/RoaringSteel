/**
 * Board Choices Tests
 *
 * The Area Select screen offers boards by grouping: regions, or single
 * states. Switching grouping must show that grouping's boards, and a
 * missing or broken outlines file must say so rather than break the screen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { useBoardChoices } from '@/composables/setup/useBoardChoices'
import { STATES_GROUPING } from '@/composables/setup/boards'

/** A state's outline: a square one degree across */
const square = (fips, name, lng) => ({
  type: 'Feature',
  properties: { STATE: fips, NAME: name },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [lng, 41],
        [lng + 1, 41],
        [lng + 1, 42],
        [lng, 42],
        [lng, 41]
      ]
    ]
  }
})

const STATES = [square('09', 'Connecticut', -73), square('44', 'Rhode Island', -72)]

/** Waits for the boards to be worked out, which waits a tick first */
async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

describe('useBoardChoices', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('should open on the first grouping once the outlines are in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ features: STATES }) }))
    )
    const choices = useBoardChoices()

    await choices.load()
    await settle()

    // Sub-regions come first; both these states are in BosWash
    expect(choices.grouping.value).toBe('sub-regions')
    expect(choices.boards.value.map((b) => b.properties.NAME)).toEqual(['BosWash'])
  })

  it("should show a grouping's boards when it is chosen", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ features: STATES }) }))
    )
    const choices = useBoardChoices()
    await choices.load()
    await settle()

    choices.grouping.value = STATES_GROUPING
    await settle()

    expect(choices.boards.value.map((b) => b.properties.NAME)).toEqual([
      'Connecticut',
      'Rhode Island'
    ])
  })

  it('should say so when the outlines cannot be had', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }))
    )
    const choices = useBoardChoices()

    await choices.load()

    expect(choices.error.value).toMatch(/Could not load the map/)
    expect(choices.boards.value).toEqual([])
  })

  it('should say so when the outlines file has no outlines', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ error: 'nope' }) }))
    )
    const choices = useBoardChoices()

    await choices.load()

    expect(choices.error.value).toMatch(/Could not load the map/)
  })
})
