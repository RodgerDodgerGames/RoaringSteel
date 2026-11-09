/**
 * Theme Tests
 *
 * The page shows the Theme setting by a mark on its root element: none for
 * "system", which leaves the stylesheet to follow the computer, and
 * data-theme="light" or "dark" to keep to one. A wrong mark would show the
 * wrong colors, or leave a preview on screen after the dialog closed.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useTheme, themeAttribute } from '@/composables/useTheme'

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('should mark the page only for a theme that overrides the computer', () => {
    expect(themeAttribute('system')).toBeNull()
    expect(themeAttribute('light')).toBe('light')
    expect(themeAttribute('dark')).toBe('dark')
  })

  it('should keep the page marked with the theme shown', async () => {
    const root = document.createElement('div')
    const store = useSettingsStore()
    const scope = effectScope()
    scope.run(() => useTheme(root))
    expect(root.dataset.theme).toBeUndefined()

    store.previewTheme('dark')
    await nextTick()
    expect(root.dataset.theme).toBe('dark')

    store.previewTheme(null)
    await nextTick()
    expect(root.dataset.theme).toBeUndefined()
    scope.stop()
  })
})
