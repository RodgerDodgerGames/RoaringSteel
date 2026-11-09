/**
 * Settings Store (settings.js)
 *
 * The player's settings, in two groups:
 * - display settings: how the game is shown, changeable at any time;
 * - game settings (GAME_SETTINGS): choices that change how a game is played,
 *   such as where track may start. Here they are the choices for the next
 *   new game. When a game starts it takes its own copy (the game store's
 *   `gameSettings`), which is saved with it and stays fixed until it ends.
 *
 * The settings are set from the Settings dialog, which opens from the
 * Settings button on the New Game steps and from the Game menu during play,
 * and on the Confirm Setup screen, which edits them directly.
 *
 * Changes are made in the Settings dialog on a draft (see
 * useSettingsDraft.js) and only reach the settings when the player presses
 * Save; Cancel throws the draft away. The one exception is the theme, which
 * is shown on the page while it is being chosen, as a preview (see
 * `themePreview`), and goes back if the player cancels.
 *
 * Settings are remembered in this browser (localStorage), so they carry from
 * game to game on the same computer. They are also written into every saved
 * game, and loading a save applies its display settings, so a game picks up
 * looking the way it did when it was saved — all but the browser-only ones
 * (BROWSER_ONLY_SETTINGS). A save made before settings existed leaves the
 * browser's settings as they are.
 *
 * @module stores/settings
 */

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import { PIN_COLORS } from '@/config/demands'

/** The localStorage key all settings are kept under, as one JSON object */
export const SETTINGS_STORAGE_KEY = 'roaringsteel_settings'

/**
 * Every setting, with the value it has until the player changes it.
 * A new setting is added here and nowhere else in this store.
 */
export const DEFAULT_SETTINGS = Object.freeze({
  /** Show how many demand cards are left in the deck, on the demand strip */
  showDeckCount: false,
  /**
   * How many demand lines a player may pin to the map at once. Pinning one
   * more drops the oldest pin.
   */
  pinLimit: 3,
  /**
   * Light or dark colors: "system" follows the computer's own light/dark
   * setting, "light" and "dark" keep to one whatever it is (see useTheme.js)
   */
  theme: 'system',
  /**
   * Show the help banners over the map (building, removing track, choosing
   * a town), each until the player dismisses it for the rest of the game
   * (see useHelpScreens.js)
   */
  showHelp: true,
  /**
   * Game setting: a player's track network must start in a major city, as
   * in Empire Builder. Off, any town will do (see startRule.js).
   */
  requireMajorCityStart: false
})

/**
 * The game settings: the settings a game is played by, copied into each new
 * game as it starts (see the game store's `gameSettings`).
 */
export const GAME_SETTINGS = Object.freeze(['requireMajorCityStart'])

/**
 * Settings that belong to this browser alone: kept here, but never taken
 * from a loaded save. Light or dark colors, and whether help is shown, suit
 * the person at the screen, not whoever saved the game; and the game
 * settings here are this browser's choices for its next new game, while a
 * save carries the settings its own game is played by separately.
 */
export const BROWSER_ONLY_SETTINGS = Object.freeze(['theme', 'showHelp', ...GAME_SETTINGS])

/**
 * The values a choice setting may take, in the order the Settings dialog
 * offers them. A setting with a fixed list of values must be listed here.
 */
export const SETTING_CHOICES = Object.freeze({
  theme: Object.freeze(['system', 'light', 'dark'])
})

/**
 * The whole numbers a number setting may take, smallest and largest. A
 * number setting must be listed here.
 */
export const SETTING_RANGES = Object.freeze({
  /** At least one, or pinning would do nothing; no more than there are colors to draw pins in */
  pinLimit: Object.freeze({ min: 1, max: PIN_COLORS.length })
})

/**
 * Whether a value read back can be used for a setting: the same kind as the
 * default; for a choice setting, one of its choices; and, for a number
 * setting, a whole number within its range.
 * @param {string} name - The setting's name
 * @param {*} value - The value read back
 * @returns {boolean} True if the setting may take the value
 */
function isUsable(name, value) {
  if (typeof value !== typeof DEFAULT_SETTINGS[name]) return false
  const choices = SETTING_CHOICES[name]
  if (choices && !choices.includes(value)) return false
  const range = SETTING_RANGES[name]
  return !range || (Number.isInteger(value) && value >= range.min && value <= range.max)
}

/**
 * Picks out the settings that can be trusted from settings read back from
 * somewhere — the browser's storage or a save file.
 *
 * Only settings this version of the game knows are kept, and only when the
 * value is the same kind as the default (a true/false setting must be true or
 * false, not the text "false") and, for a number, within its range. Anything
 * else is left out, so a save from a newer or hand-edited copy of the game
 * cannot put a setting into a state the game does not expect.
 *
 * @param {Object} source - Settings as read back; may be anything at all
 * @returns {Object} Just the usable settings, possibly none
 */
function usableSettings(source) {
  return Object.fromEntries(
    Object.keys(DEFAULT_SETTINGS)
      .filter((name) => isUsable(name, source?.[name]))
      .map((name) => [name, source[name]])
  )
}

/**
 * A full set of game settings from settings read back from somewhere — the
 * settings store, or a save — each usable one taken as it is and any other
 * left at its default. So a save made before a game setting existed is
 * played by that setting's default.
 * @param {Object} source - Settings as read back; may be anything at all
 * @returns {Object} One value for each of GAME_SETTINGS
 */
export function gameSettingsFrom(source) {
  const usable = usableSettings(source)
  return Object.fromEntries(
    GAME_SETTINGS.map((name) => [name, name in usable ? usable[name] : DEFAULT_SETTINGS[name]])
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
   * usableSettings), as are the browser-only ones (BROWSER_ONLY_SETTINGS),
   * and settings the save does not mention keep their current value.
   *
   * @param {Object} saved - The `settings` object from a save
   */
  function applySettings(saved) {
    const usable = usableSettings(saved)
    BROWSER_ONLY_SETTINGS.forEach((name) => delete usable[name])
    Object.assign(settings.value, usable)
  }

  /**
   * The theme being tried in the Settings dialog, shown on the page until
   * the player saves or cancels; null while no theme is being tried.
   */
  const themePreview = ref(null)

  /** The theme the page shows: the one being tried, or else the setting */
  const shownTheme = computed(() => themePreview.value ?? settings.value.theme)

  /**
   * Shows a theme on the page without saving it, while the player tries it
   * in the Settings dialog. A value that is not a theme is ignored.
   * @param {string|null} theme - The theme to show, or null to stop previewing
   */
  function previewTheme(theme) {
    themePreview.value = theme === null || isUsable('theme', theme) ? theme : null
  }

  /**
   * Saves the settings from the Settings dialog's draft, and ends any theme
   * preview: the theme saved is now the one shown. Unusable values in the
   * draft are ignored, as they are from a save (see usableSettings).
   *
   * @param {Object} draft - The settings as the player left them in the dialog
   */
  function saveSettings(draft) {
    Object.assign(settings.value, usableSettings(draft))
    previewTheme(null)
  }

  return { settings, applySettings, themePreview, shownTheme, previewTheme, saveSettings }
})
