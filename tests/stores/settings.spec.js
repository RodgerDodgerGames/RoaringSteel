/**
 * Settings Store Tests
 *
 * Settings are the player's display preferences, remembered in the browser.
 * These tests cover the defaults a first-time player sees, that a change
 * survives a page reload, and that missing or damaged stored settings fall
 * back to the defaults rather than breaking the game.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore, SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS } from '@/stores/settings'

/**
 * The settings as a freshly loaded page would see them: a new Pinia, so the
 * store reads localStorage again instead of reusing what is in memory.
 * @returns {Object} The settings
 */
function settingsAfterReload() {
  setActivePinia(createPinia())
  return useSettingsStore().settings
}

describe('settings store', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('should hide the deck count for a player who has never changed it', () => {
    expect(useSettingsStore().settings.showDeckCount).toBe(false)
  })

  it('should remember a changed setting after the page reloads', async () => {
    useSettingsStore().settings.showDeckCount = true
    // The change is written to localStorage on the next tick
    await nextTick()

    expect(settingsAfterReload().showDeckCount).toBe(true)
  })

  it('should give a setting this browser has never stored its default', () => {
    // A browser that saved its settings before any of today's existed
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({}))

    expect(settingsAfterReload()).toEqual(DEFAULT_SETTINGS)
  })

  it('should use the default for a stored setting of the wrong kind', () => {
    // Text "false" is truthy: kept as-is, it would show the count while the
    // checkbox showed unticked
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ showDeckCount: 'false' }))

    expect(settingsAfterReload()).toEqual(DEFAULT_SETTINGS)
  })

  it('should fall back to the defaults when the stored settings are damaged', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem(SETTINGS_STORAGE_KEY, '{not json')

    expect(settingsAfterReload()).toEqual(DEFAULT_SETTINGS)
    expect(error).toHaveBeenCalled()
  })

  describe('applySettings', () => {
    it("should take on a loaded save's settings and remember them", async () => {
      useSettingsStore().applySettings({ showDeckCount: true })
      await nextTick()

      expect(settingsAfterReload().showDeckCount).toBe(true)
    })

    it('should ignore settings this version of the game does not know', () => {
      const store = useSettingsStore()

      store.applySettings({ showDeckCount: true, showSecretHands: true })

      expect(store.settings).toEqual({ showDeckCount: true })
    })

    it('should ignore a saved value of the wrong kind', () => {
      const store = useSettingsStore()

      store.applySettings({ showDeckCount: 'yes' })

      expect(store.settings.showDeckCount).toBe(false)
    })

    it('should keep the current value of a setting the save does not mention', () => {
      const store = useSettingsStore()
      store.settings.showDeckCount = true

      store.applySettings({})

      expect(store.settings.showDeckCount).toBe(true)
    })
  })
})
