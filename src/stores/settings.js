/**
 * Settings Store (settings.js)
 *
 * The player's preferences for how the game is shown — not the rules of the
 * game itself. They are set from the Settings dialog, which opens from the cog
 * on the setup screens and from the Game menu during play.
 *
 * Settings are remembered in this browser (localStorage), so they carry from
 * game to game on the same computer. They are deliberately not part of a saved
 * game: loading someone else's save does not change how your screen looks.
 *
 * @module stores/settings
 */

import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'

/** The localStorage key all settings are kept under, as one JSON object */
export const SETTINGS_STORAGE_KEY = 'roaringsteel_settings'

/**
 * Every setting, with the value it has until the player changes it.
 * A new setting is added here and nowhere else in this store.
 */
export const DEFAULT_SETTINGS = Object.freeze({
  /** Show how many demand cards are left in the deck, on the demand strip */
  showDeckCount: false
})

export const useSettingsStore = defineStore('settings', () => {
  /**
   * The current settings, kept in step with localStorage: a change is
   * written straight back, so it survives a page reload.
   *
   * `mergeDefaults` matters once a second setting exists: when the page
   * loads, a browser that stored its settings before the new one was added
   * has no value for it, and gets the default rather than `undefined`. A
   * stored value that cannot be read at all is reported to the console, and
   * the defaults are used.
   *
   * The defaults are copied: DEFAULT_SETTINGS is frozen, so the settings the
   * player changes must be an object of their own.
   */
  const settings = useStorage(SETTINGS_STORAGE_KEY, { ...DEFAULT_SETTINGS }, undefined, {
    mergeDefaults: true
  })

  return { settings }
})
