/**
 * Settings Draft Tests
 *
 * The Settings dialog works on a draft: nothing the player changes reaches
 * the saved settings until they press Save, and Cancel leaves them as they
 * were. The theme is the exception while the dialog is open: it is shown on
 * the page as it is picked, and must go back to the saved theme on Cancel or
 * whenever the dialog goes away, or the page would be left in a theme the
 * player never saved.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useSettingsDraft } from '@/composables/useSettingsDraft'

/**
 * Opens a draft the way the dialog does, in a scope that can be closed the
 * way the dialog closing would.
 * Cancel is the dialog closing without a Save: the scope stopping.
 * @returns {{scope: Object, draft: Object, save: Function}}
 */
function openDraft() {
  const scope = effectScope()
  const result = scope.run(() => useSettingsDraft())
  return { scope, ...result }
}

describe('useSettingsDraft', () => {
  let store

  beforeEach(() => {
    localStorage.clear()
    store = useSettingsStore()
  })

  it('should leave the settings alone until the draft is saved', () => {
    const { draft } = openDraft()

    draft.value.pinLimit = 1

    expect(store.settings.pinLimit).toBe(3)
  })

  it("should keep the draft's changes on Save", () => {
    const { draft, save } = openDraft()
    draft.value.pinLimit = 1
    draft.value.showDeckCount = true

    save()

    expect(store.settings.pinLimit).toBe(1)
    expect(store.settings.showDeckCount).toBe(true)
  })

  it('should throw the changes away on Cancel', () => {
    const { scope, draft } = openDraft()
    draft.value.pinLimit = 1

    scope.stop()

    expect(store.settings.pinLimit).toBe(3)
  })

  it('should show a theme on the page as it is picked', async () => {
    const { draft } = openDraft()

    draft.value.theme = 'dark'
    await nextTick()

    expect(store.shownTheme).toBe('dark')
    expect(store.settings.theme).toBe('system')
  })

  it('should put the saved theme back on Cancel', async () => {
    const { scope, draft } = openDraft()
    draft.value.theme = 'dark'
    await nextTick()

    scope.stop()

    expect(store.shownTheme).toBe('system')
  })

  it('should keep a saved theme after the dialog goes away', async () => {
    const { scope, draft, save } = openDraft()
    draft.value.theme = 'light'
    await nextTick()

    save()
    scope.stop()

    expect(store.shownTheme).toBe('light')
  })
})
