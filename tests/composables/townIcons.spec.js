/**
 * Town Icons Tests
 *
 * Each size of town is drawn with its own icon. A town whose size is
 * missing or unknown (a damaged save) must still be drawn, as a small town,
 * rather than with no icon at all.
 */

import { describe, it, expect } from 'vitest'
import { TOWN_ICONS, townIcon } from '@/composables/map/townIcons'

describe('townIcon', () => {
  it('should draw a town of unknown size as a small town', () => {
    expect(townIcon('enormous')).toBe(TOWN_ICONS.small)
    expect(townIcon(undefined)).toBe(TOWN_ICONS.small)
  })
})
