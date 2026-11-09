/**
 * Help Screens (useHelpScreens.js)
 *
 * Whether each help screen is shown. Today the help screens are the banners
 * over the map that explain a mode while it is on — building track, removing
 * it, choosing a town for the train (see MapModeHint.vue) — and more will
 * follow.
 *
 * A help screen shows unless:
 * - the player has turned help off, with "Show help screens" in Settings,
 *   which holds for every game in this browser; or
 * - the player dismissed that one screen with its "Don't show again" button,
 *   which holds for the rest of this game only (the game store's
 *   `dismissedHelp`, saved with the game). Each screen is dismissed on its
 *   own: dismissing one leaves the others showing.
 *
 * @module composables/useHelpScreens
 */

import { useGameStore } from '@/stores/game'
import { useSettingsStore } from '@/stores/settings'

/**
 * The names of the help screens, each the key it is dismissed under. Saved
 * games record dismissed screens by these names, so a name is never changed.
 */
export const HELP_SCREENS = Object.freeze({
  building: 'building',
  removing: 'removing',
  choosingTown: 'choosingTown'
})

/**
 * Asks and answers whether help screens are shown.
 * @returns {{isShown: Function, dismiss: Function}} `isShown(name)` and
 *   `dismiss(name)`, for a name from HELP_SCREENS
 */
export function useHelpScreens() {
  const gameStore = useGameStore()
  const settingsStore = useSettingsStore()

  /**
   * Whether a help screen is shown.
   * @param {string} name - The screen's name
   * @returns {boolean} True unless help is off or this screen was dismissed
   */
  function isShown(name) {
    return settingsStore.settings.showHelp && !gameStore.dismissedHelp.includes(name)
  }

  /**
   * Hides a help screen for the rest of this game.
   * @param {string} name - The screen's name
   */
  function dismiss(name) {
    gameStore.dismissHelp(name)
  }

  return { isShown, dismiss }
}
