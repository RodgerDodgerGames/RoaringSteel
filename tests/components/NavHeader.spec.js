/**
 * NavHeader Component Tests
 *
 * Tests that the End Turn control is wired to the turn composable.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import NavHeader from '@/components/NavHeader.vue'

// The turn logic itself is covered in tests/composables/useTurn.spec.js
const { endTurn } = vi.hoisted(() => ({ endTurn: vi.fn(() => true) }))

vi.mock('@/composables/useTurn', () => ({
  useTurn: () => ({ endTurn })
}))

describe('NavHeader', () => {
  beforeEach(() => {
    endTurn.mockClear()
  })

  it('should end the turn when End Turn is clicked', async () => {
    const wrapper = shallowMount(NavHeader)

    await wrapper.find('#endTurnButton').trigger('click')

    expect(endTurn).toHaveBeenCalledTimes(1)
  })

  it('should close the mobile menu after ending a turn', async () => {
    const wrapper = shallowMount(NavHeader)

    await wrapper.find('.navbar-burger').trigger('click')
    expect(wrapper.find('.navbar-menu').classes()).toContain('is-active')

    await wrapper.find('#endTurnButton').trigger('click')

    expect(wrapper.find('.navbar-menu').classes()).not.toContain('is-active')
  })
})
