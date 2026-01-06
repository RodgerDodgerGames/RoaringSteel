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
import { useGamePersistence } from '@/composables/useGamePersistence'

// Component events
const emit = defineEmits(['close'])

// Get export functionality from game persistence composable
const { exportToFile } = useGamePersistence()

// Reactive state
const filename = ref('roaring-steel-save') // Default filename for exported save
const isExporting = ref(false) // Loading state during export operation
const successMessage = ref('') // Success feedback message
const errorMessage = ref('') // Error feedback message

/**
 * Handles the export of the current game state to a JSON file.
 *
 * Validates the filename, clears previous messages, and triggers the file download.
 * Shows success or error feedback based on the export result.
 */
async function handleExport() {
  // Validate filename input
  if (!filename.value.trim()) {
    errorMessage.value = 'Please enter a filename'
    return
  }

  // Reset UI state
  isExporting.value = true
  errorMessage.value = ''
  successMessage.value = ''

  // Attempt to export game to file
  const success = exportToFile(filename.value.trim())

  isExporting.value = false

  // Display appropriate feedback message
  if (success) {
    successMessage.value = 'Game exported successfully!'
  } else {
    errorMessage.value = 'Failed to export game. Please try again.'
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
          <h4 class="title is-5 mb-3">Export to File</h4>
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
                :disabled="isExporting"
              />
            </div>
            <p class="help">File will be saved as {{ filename || 'filename' }}.json</p>
          </div>

          <div class="field">
            <div class="control">
              <button
                class="button is-primary is-fullwidth"
                :class="{ 'is-loading': isExporting }"
                :disabled="isExporting"
                @click="handleExport"
              >
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
