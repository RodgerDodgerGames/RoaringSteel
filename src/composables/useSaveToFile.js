/**
 * Save to File (useSaveToFile.js)
 *
 * The "save the game as a file" piece shared by the Save Game and New Game
 * dialogs: the file name the player types, checking it, and downloading the
 * game under it. One copy, so the two dialogs cannot drift apart on what
 * name a file gets or what a failed save says.
 *
 * A save that is downloaded is not necessarily kept: the browser may ask
 * where to put it, and the player may cancel. Nothing here can tell, so a
 * dialog should not take a successful `save` to mean the file is safe.
 *
 * @module composables/useSaveToFile
 */

import { ref, computed } from 'vue'
import { useGamePersistence } from '@/composables/useGamePersistence'

/** The name a save file is offered under, before the player changes it */
export const DEFAULT_SAVE_FILENAME = 'roaring-steel-save'

/**
 * @returns {{filename: Ref<string>, fileLabel: ComputedRef<string>,
 *   errorMessage: Ref<string>, save: Function}} The file name being typed;
 *   the name the file will be saved as, for showing under the field; why the
 *   last save failed, or ''; and the function that saves
 */
export function useSaveToFile() {
  const { exportToFile } = useGamePersistence()

  /** The file name as typed, without the .json */
  const filename = ref(DEFAULT_SAVE_FILENAME)

  /** Why the last save failed, or '' */
  const errorMessage = ref('')

  /**
   * The name the file will actually be saved as. Spaces round the typed name
   * are dropped, as they are when saving, so what is shown is what is saved.
   */
  const fileLabel = computed(() => `${filename.value.trim() || 'filename'}.json`)

  /**
   * Downloads the game as a save file under the typed name. A blank name is
   * refused rather than saved as ".json".
   * @returns {boolean} True if the download was started
   */
  function save() {
    errorMessage.value = ''
    const name = filename.value.trim()
    if (!name) {
      errorMessage.value = 'Please enter a filename'
      return false
    }
    if (!exportToFile(name)) {
      errorMessage.value = 'Failed to export game. Please try again.'
      return false
    }
    return true
  }

  return { filename, fileLabel, errorMessage, save }
}
