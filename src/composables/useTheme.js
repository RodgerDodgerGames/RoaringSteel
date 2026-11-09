/**
 * Theme (useTheme.js)
 *
 * Shows the player's Theme setting on the page: light colors, dark colors,
 * or whichever the computer is set to.
 *
 * The stylesheet does the coloring (section 4 of roaring-steel.scss). It
 * follows the computer's light/dark setting on its own, unless the page's
 * root element carries `data-theme="light"` or `data-theme="dark"`, which
 * keeps it to that one. So the "system" theme takes the attribute away and
 * the other two set it. Bulma's own themes answer to the same attribute.
 *
 * The theme shown is the settings store's `shownTheme`: the saved setting,
 * or one being tried in the Settings dialog.
 *
 * @module composables/useTheme
 */

import { watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'

/**
 * What the page's `data-theme` attribute should be for a theme.
 * @param {string} theme - "system", "light" or "dark"
 * @returns {string|null} "light" or "dark", or null for no attribute: the
 *   page then follows the computer
 */
export function themeAttribute(theme) {
  return theme === 'light' || theme === 'dark' ? theme : null
}

/**
 * Keeps the page in the theme the settings store says to show, from now
 * on. Called once, by the app.
 * @param {HTMLElement} [root] - The element to mark; the page's root element
 *   if left out
 */
export function useTheme(root = document.documentElement) {
  const settingsStore = useSettingsStore()
  watch(
    () => settingsStore.shownTheme,
    (theme) => {
      const attribute = themeAttribute(theme)
      if (attribute) root.dataset.theme = attribute
      else delete root.dataset.theme
    },
    { immediate: true }
  )
}
