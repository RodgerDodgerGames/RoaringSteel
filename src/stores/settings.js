/**
 * Settings Store (settings.js)
 *
 * The player's preferences for how the game is shown — not the rules of the
 * game itself. They are set from the Settings dialog, which opens from the
 * Settings button on the New Game steps and from the Game menu during play.
 *
 * Settings are remembered in this browser (localStorage), so they carry from
 * game to game on the same computer. They are also written into every saved
 * game, and loading a save applies its settings, so a game picks up looking
 * the way it did when it was saved. A save made before settings existed
 * leaves the browser's settings as they are.
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

/**
 * Picks out the settings that can be trusted from settings read back from
 * somewhere — the browser's storage or a save file.
 *
 * Only settings this version of the game knows are kept, and only when the
 * value is the same kind as the default (a true/false setting must be true or
 * false, not the text "false"). Anything else is left out, so a save from a
 * newer or hand-edited copy of the game cannot put a setting into a state the
 * game does not expect.
 *
 * @param {Object} source - Settings as read back; may be anything at all
 * @returns {Object} Just the usable settings, possibly none
 */
function usableSettings(source) {
  return Object.fromEntries(
    Object.keys(DEFAULT_SETTINGS)
      .filter((name) => typeof source?.[name] === typeof DEFAULT_SETTINGS[name])
      .map((name) => [name, source[name]])
  )
}

export const useSettingsStore = defineStore('settings', () => {
  /**
   * The current settings, kept in step with localStorage: a change is
   * written straight back, so it survives a page reload.
   *
   * When the page loads, what the browser stored is laid over the defaults,
   * keeping only usable settings. So a browser that stored its settings
   * before a newer setting was added gets that setting's default rather than
   * `undefined`, and a damaged value is replaced by its default. A stored
   * value that cannot be read at all is reported to the console, and the
   * defaults are used.
   *
   * The defaults are copied: DEFAULT_SETTINGS is frozen, so the settings the
   * player changes must be an object of their own.
   */
  const settings = useStorage(SETTINGS_STORAGE_KEY, { ...DEFAULT_SETTINGS }, undefined, {
    mergeDefaults: (stored, defaults) => ({ ...defaults, ...usableSettings(stored) })
  })

  /**
   * Takes on the settings carried by a loaded save, which then become this
   * browser's settings too. Unusable settings in the save are ignored (see
   * usableSettings), and settings the save does not mention keep their
   * current value.
   *
   * @param {Object} saved - The `settings` object from a save
   */
  function applySettings(saved) {
    Object.assign(settings.value, usableSettings(saved))
  }

  return { settings, applySettings }
})
