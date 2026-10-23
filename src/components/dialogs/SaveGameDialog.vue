<!--
  SaveGameDialog.vue

  Modal dialog component for saving and exporting the current game state.

  Features:
  - Displays information about automatic save functionality
  - Allows users to export game state as a downloadable JSON file
  - Provides filename customization for exported saves
  - Shows success/error feedback for export operations

  The game is automatically saved to browser localStorage after each turn,
  with the last 3 auto-saves being retained. This dialog provides an
  additional manual export option for creating portable backup files.

  @emits close - Emitted when user clicks the close button or modal background
-->

<script setup>
import { ref } from 'vue'
import { useSaveToFile } from '@/composables/useSaveToFile'

// Component events
const emit = defineEmits(['close'])

// The file name, its checks and the download, shared with the New Game dialog
const { filename, fileLabel, errorMessage, save } = useSaveToFile()

const successMessage = ref('') // Success feedback message

/**
 * Downloads the game as a save file under the typed name, then closes the
 * dialog after a moment, so the player sees it worked. A failure keeps the
 * dialog open with the reason showing.
 */
function handleExport() {
  successMessage.value = ''
  if (save()) {
    successMessage.value = 'Game exported successfully!'
    setTimeout(() => {
      handleClose()
    }, 1000)
  }
}

/**
 * Closes the dialog by emitting the close event to the parent component.
 */
function handleClose() {
  emit('close')
}
</script>

<template>
  <div class="modal is-active">
    <div class="modal-background" @click="handleClose"></div>
    <div class="modal-card">
      <header class="modal-card-head">
        <p class="modal-card-title">Save Game</p>
        <button class="delete" aria-label="close" @click="handleClose"></button>
      </header>

      <section class="modal-card-body">
        <!-- Auto-save Info -->
        <div class="notification is-info is-light">
          <p class="has-text-weight-bold mb-2">Your game is auto-saved after each turn</p>
          <p class="is-size-7">
            The last 3 auto-saves are stored in your browser. Use the Load Game option to restore
            them.
          </p>
        </div>

        <!-- Success Message -->
        <div v-if="successMessage" class="notification is-success is-light mb-4">
          {{ successMessage }}
        </div>

        <!-- Error Message -->
        <div v-if="errorMessage" class="notification is-danger is-light mb-4">
          {{ errorMessage }}
        </div>

        <!-- File Export Section -->
        <div>
          <h4 class="title is-5 mb-3">Save Game to File</h4>
          <p class="mb-3 is-size-7 has-text-grey">
            Download your game as a JSON file to back it up or share with others.
          </p>

          <div class="field">
            <label class="label">Filename</label>
            <div class="control">
              <input
                v-model="filename"
                class="input"
                type="text"
                placeholder="Enter filename (without .json)"
              />
            </div>
            <p class="help">File will be saved as {{ fileLabel }}</p>
          </div>

          <div class="field">
            <div class="control">
              <button class="button is-primary is-fullwidth" @click="handleExport">
                <span class="icon">
                  <i class="fas fa-download"></i>
                </span>
                <span>Download Save File</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer class="modal-card-foot">
        <button class="button" @click="handleClose">Close</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.modal-card {
  max-width: 600px;
  width: 90vw;
}
</style>
