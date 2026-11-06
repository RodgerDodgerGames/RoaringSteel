/**
 * Settings Draft (useSettingsDraft.js)
 *
 * The Settings dialog's working copy of the settings. The player changes
 * the draft; nothing reaches the real settings until they press Save, and
 * Cancel (or Esc, or a click outside the dialog) throws the draft away.
 *
 * The theme is the one setting shown while it is being changed: picking a
 * theme in the draft previews it on the page at once (see the settings
 * store's `previewTheme`), so the player can see it before saving. When the
 * dialog goes away the preview ends, and the page shows the saved theme:
 * the one just saved, or, after a Cancel, the one it had before. Cancel
 * itself needs nothing more than closing the dialog.
 *
 * @module composables/useSettingsDraft
 */

import { ref, watch, onScopeDispose } from 'vue'
import { useSettingsStore } from '@/stores/settings'

/**
 * A draft of the settings for one opening of the Settings dialog.
 * @returns {{draft: Object, save: Function}} The draft (a ref holding a
 *   copy of the settings), and the way to keep it
 */
export function useSettingsDraft() {
  const settingsStore = useSettingsStore()

  /** A copy of the settings as they were when the dialog opened */
  const draft = ref({ ...settingsStore.settings })

  // The theme picked in the draft is shown on the page as it is picked
  watch(
    () => draft.value.theme,
    (theme) => settingsStore.previewTheme(theme)
  )

  /** Keeps the draft: it becomes the settings, and the preview ends */
  function save() {
    settingsStore.saveSettings(draft.value)
  }

  // However the dialog goes away, no preview is left behind it
  onScopeDispose(() => settingsStore.previewTheme(null))

  return { draft, save }
}
