<!--
  LoadGameDialog.vue

  Modal dialog component for loading saved games from multiple sources.

  Features:
  - Displays list of available auto-saved games with metadata
  - Shows turn number, save date/time, and player names for each auto-save
  - Allows loading from the browser's auto-saves (last 3 saves)
  - Supports importing game state from uploaded JSON files
  - Provides error feedback for failed load operations
  - Interactive hover effects on save entries

  Users can restore their game progress either from the automatic saves
  created at the end of each round, or by uploading a previously exported
  save file.

  An auto-save does not hold the grid, only where it came from (see
  useGamePersistence.js). If this browser no longer has that grid, loading
  builds it again, behind the same progress modal as setting up a new game,
  with the same Try Again and Back if building it fails.

  @emits close - Emitted when user clicks the close button or modal background
  @emits game-loaded - Emitted when a game is successfully loaded from any source
-->

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useGamePersistence } from '@/composables/useGamePersistence'
import { useGridStore } from '@/stores/grid'
import GridProgressModal from '@/components/setup/GridProgressModal.vue'

// Component events
const emit = defineEmits(['close', 'game-loaded'])

// Get persistence functionality from game persistence composable
const { getAutoSaves, loadAutoSave, importFromFile } = useGamePersistence()
const gridStore = useGridStore()

// Reactive state
const autoSaves = ref([]) // List of available auto-save entries with metadata
const fileInput = ref(null) // Reference to file input element for resetting after upload
const isLoading = ref(false) // Loading state during load operations
const errorMessage = ref('') // Error feedback message
const loadingId = ref(null) // The auto-save being loaded, kept for Try Again

// The progress modal shows while an auto-save's grid is being built again,
// and stays up with its error if that fails
const showGridProgress = computed(
  () => loadingId.value !== null && (gridStore.currentPhase !== '' || !!gridStore.error)
)

// Load the auto-saves list when component mounts
onMounted(() => {
  loadAutoSavesList()
})

/**
 * Retrieves and populates the list of available auto-saved games.
 *
 * Reads the auto-saves from the browser's database and updates the reactive
 * autoSaves list with metadata including turn number, save date, and player
 * names.
 */
async function loadAutoSavesList() {
  autoSaves.value = await getAutoSaves()
}

/**
 * Handles loading a game from an auto-save entry.
 *
 * @param {number} id - The id of the auto-save to load
 *
 * Loads the game state from the specified auto-save and emits 'game-loaded'
 * on success. If the save's grid could not be built again, the progress
 * modal is left showing why, with Try Again and Back; any other failure is
 * shown as an error message in this dialog.
 */
async function handleLoadAutoSave(id) {
  isLoading.value = true
  errorMessage.value = ''
  loadingId.value = id

  const success = await loadAutoSave(id)
  isLoading.value = false

  if (success) {
    loadingId.value = null
    emit('game-loaded')
  } else if (!gridStore.error) {
    loadingId.value = null
    errorMessage.value = 'Failed to load save. The save file may be corrupted.'
  }
}

/** Player asked to try building the auto-save's grid again */
function handleGridRetry() {
  gridStore.clearError()
  handleLoadAutoSave(loadingId.value)
}

/** Player gave up loading the auto-save whose grid could not be built */
function handleGridCancel() {
  gridStore.clearError()
  loadingId.value = null
}

/**
 * Handles uploading and importing a game save file.
 *
 * @param {Event} event - The file input change event
 *
 * Reads the uploaded JSON file, attempts to import the game state,
 * and emits 'game-loaded' on success or displays an error on failure.
 * Resets the file input after processing to allow re-uploading the same file.
 */
async function handleFileUpload(event) {
  const file = event.target.files[0]
  if (!file) return

  isLoading.value = true
  errorMessage.value = ''

  const success = await importFromFile(file)
  isLoading.value = false

  if (success) {
    emit('game-loaded')
  } else {
    errorMessage.value = 'Failed to load file. Please check that it is a valid save file.'
  }

  // Reset file input to allow uploading the same file again if needed
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

/**
 * Formats an ISO date string to a localized date/time string.
 *
 * @param {string} isoString - ISO 8601 date string from the save metadata
 * @returns {string} Localized date and time string (e.g., "1/5/2026, 10:30:00 AM")
 */
function formatDate(isoString) {
  const date = new Date(isoString)
  return date.toLocaleString()
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
        <p class="modal-card-title">Load Game</p>
        <button class="delete" aria-label="close" @click="handleClose"></button>
      </header>

      <section class="modal-card-body">
        <!-- Error Message -->
        <div v-if="errorMessage" class="notification is-danger is-light mb-4">
          {{ errorMessage }}
        </div>

        <!-- Auto-Saves Section -->
        <div class="mb-5">
          <h4 class="title is-5 mb-3">Auto-Saved Games</h4>

          <div v-if="autoSaves.length === 0" class="notification is-warning is-light">
            No auto-saves found. Start a new game to create an auto-save.
          </div>

          <div v-else>
            <div v-for="save in autoSaves" :key="save.id" class="box mb-3">
              <div class="columns is-vcentered is-mobile">
                <div class="column">
                  <p class="has-text-weight-bold">Turn {{ save.metadata.turn }}</p>
                  <p class="is-size-7 has-text-grey">
                    {{ formatDate(save.metadata.savedAt) }}
                  </p>
                  <p class="is-size-7">Players: {{ save.metadata.playerNames.join(', ') }}</p>
                </div>
                <div class="column is-narrow">
                  <button
                    class="button is-primary"
                    :class="{ 'is-loading': isLoading }"
                    :disabled="isLoading"
                    @click="handleLoadAutoSave(save.id)"
                  >
                    Load
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- File Upload Section -->
        <div>
          <h4 class="title is-5 mb-2">Load from File</h4>
          <p class="subtitle is-6 mb-3">Choose a previously saved game file (.json)</p>
          <div class="file is-centered">
            <label class="file-label">
              <input
                ref="fileInput"
                class="file-input"
                type="file"
                accept=".json"
                :disabled="isLoading"
                @change="handleFileUpload"
              />
              <span class="file-cta">
                <span class="file-icon">
                  <i class="fas fa-upload"></i>
                </span>
                <span class="file-label">Choose a file...</span>
              </span>
            </label>
          </div>
        </div>
      </section>

      <footer class="modal-card-foot">
        <button class="button" @click="handleClose">Close</button>
      </footer>
    </div>
    <GridProgressModal
      :is-active="showGridProgress"
      @retry="handleGridRetry"
      @cancel="handleGridCancel"
    />
  </div>
</template>

<style scoped>
.modal-card {
  max-width: 600px;
  width: 90vw;
}

.box {
  transition: box-shadow 0.2s;
}

.box:hover {
  box-shadow:
    0 0.5em 1em -0.125em rgba(10, 10, 10, 0.2),
    0 0px 0 1px rgba(10, 10, 10, 0.02);
}
</style>
