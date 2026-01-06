<!--
  SaveGameDialog.vue

  Dialog for saving/exporting game to file.
  Displays auto-save info and provides file export functionality.

  @emits close - User closed the dialog
-->

<script setup>
import { ref } from 'vue'
import { useGamePersistence } from '@/composables/useGamePersistence'

const emit = defineEmits(['close'])

const { exportToFile } = useGamePersistence()

const filename = ref('roaring-steel-save')
const isExporting = ref(false)
const successMessage = ref('')
const errorMessage = ref('')

async function handleExport() {
  if (!filename.value.trim()) {
    errorMessage.value = 'Please enter a filename'
    return
  }

  isExporting.value = true
  errorMessage.value = ''
  successMessage.value = ''

  const success = exportToFile(filename.value.trim())

  isExporting.value = false

  if (success) {
    successMessage.value = 'Game exported successfully!'
  } else {
    errorMessage.value = 'Failed to export game. Please try again.'
  }
}

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
        <div class="notification is-info is-light mb-5">
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
