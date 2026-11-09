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
import { PIN_COLORS } from '@/config/demands'

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

  describe('the pin limit', () => {
    it('should let a player pin three demand lines until they change it', () => {
      expect(useSettingsStore().settings.pinLimit).toBe(3)
    })

    it('should remember a pin limit inside the allowed range', () => {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ pinLimit: PIN_COLORS.length }))

      expect(settingsAfterReload().pinLimit).toBe(PIN_COLORS.length)
    })

    it('should use the default for a pin limit outside the allowed range', () => {
      // No pins at all would make pinning do nothing; more pins than colors
      // would leave a pinned line with no color to draw it in
      const outOfRange = [0, PIN_COLORS.length + 1, 2.5]
      outOfRange.forEach((pinLimit) => {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ pinLimit }))
        expect(settingsAfterReload().pinLimit).toBe(3)
      })
    })

    it('should ignore an out-of-range pin limit in a loaded save', () => {
      const store = useSettingsStore()

      store.applySettings({ pinLimit: 99 })

      expect(store.settings.pinLimit).toBe(3)
    })
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

      expect(store.settings).toEqual({ ...DEFAULT_SETTINGS, showDeckCount: true })
    })

    it('should ignore a saved value of the wrong kind', () => {
      const store = useSettingsStore()

      store.applySettings({ showDeckCount: 'yes' })

      expect(store.settings.showDeckCount).toBe(false)
    })

    it("should keep this browser's theme, whatever theme the save was made in", () => {
      const store = useSettingsStore()

      store.applySettings({ theme: 'dark', pinLimit: 2 })

      expect(store.settings.theme).toBe('system')
      expect(store.settings.pinLimit).toBe(2)
    })

    it('should keep the current value of a setting the save does not mention', () => {
      const store = useSettingsStore()
      store.settings.showDeckCount = true

      store.applySettings({})

      expect(store.settings.showDeckCount).toBe(true)
    })
  })

  describe('the theme', () => {
    it("should follow the computer's own light or dark setting until the player changes it", () => {
      expect(useSettingsStore().settings.theme).toBe('system')
    })

    it('should use the default for a stored theme that is not one of the choices', () => {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ theme: 'sepia' }))

      expect(settingsAfterReload().theme).toBe('system')
    })

    it('should show a theme being tried without saving it', () => {
      const store = useSettingsStore()

      store.previewTheme('dark')

      expect(store.shownTheme).toBe('dark')
      expect(store.settings.theme).toBe('system')
    })

    it('should go back to the saved theme when the preview ends', () => {
      const store = useSettingsStore()
      store.previewTheme('dark')

      store.previewTheme(null)

      expect(store.shownTheme).toBe('system')
    })

    it('should not preview something that is not a theme', () => {
      const store = useSettingsStore()

      store.previewTheme('sepia')

      expect(store.shownTheme).toBe('system')
    })
  })

  describe('saveSettings', () => {
    it("should keep the dialog's settings and remember them", async () => {
      useSettingsStore().saveSettings({ ...DEFAULT_SETTINGS, pinLimit: 2, theme: 'light' })
      await nextTick()

      const settings = settingsAfterReload()
      expect(settings.pinLimit).toBe(2)
      expect(settings.theme).toBe('light')
    })

    it('should end the theme preview, leaving the saved theme shown', () => {
      const store = useSettingsStore()
      store.previewTheme('dark')

      store.saveSettings({ ...DEFAULT_SETTINGS, theme: 'light' })

      expect(store.themePreview).toBeNull()
      expect(store.shownTheme).toBe('light')
    })

    it('should ignore an unusable value', () => {
      const store = useSettingsStore()

      store.saveSettings({ pinLimit: 99, theme: 'sepia' })

      expect(store.settings).toEqual(DEFAULT_SETTINGS)
    })
  })
})
