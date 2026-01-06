<!--
  LoadGameDialog.vue

  Dialog for loading saved games from auto-saves or file upload.
  Shows list of available auto-saves with metadata (turn, date, players).

  @emits close - User closed the dialog
  @emits game-loaded - Game was successfully loaded
-->

<script setup>
import { ref, onMounted } from 'vue'
import { useGamePersistence } from '@/composables/useGamePersistence'

const emit = defineEmits(['close', 'game-loaded'])

const {
  getAutoSaves,
  loadAutoSave,
  hasAutoSaves,
  importFromFile
} = useGamePersistence()

const autoSaves = ref([])
const fileInput = ref(null)
const isLoading = ref(false)
const errorMessage = ref('')

onMounted(() => {
  loadAutoSavesList()
})

function loadAutoSavesList() {
  autoSaves.value = getAutoSaves()
}

async function handleLoadAutoSave(index) {
  isLoading.value = true
  errorMessage.value = ''

  const success = loadAutoSave(index)
  isLoading.value = false

  if (success) {
    emit('game-loaded')
  } else {
    errorMessage.value = 'Failed to load save. The save file may be corrupted.'
  }
}

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

  // Reset file input
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

function formatDate(isoString) {
  const date = new Date(isoString)
  return date.toLocaleString()
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

          <div v-if="autoSaves.length === 0" class="notification is-info is-light">
            No auto-saves found. Start a new game to create an auto-save.
          </div>

          <div v-else>
            <div
              v-for="save in autoSaves"
              :key="save.index"
              class="box mb-3"
            >
              <div class="columns is-vcentered is-mobile">
                <div class="column">
                  <p class="has-text-weight-bold">Turn {{ save.metadata.turn }}</p>
                  <p class="is-size-7 has-text-grey">
                    {{ formatDate(save.metadata.savedAt) }}
                  </p>
                  <p class="is-size-7">
                    Players: {{ save.metadata.playerNames.join(', ') }}
                  </p>
                </div>
                <div class="column is-narrow">
                  <button
                    class="button is-primary"
                    :class="{ 'is-loading': isLoading }"
                    :disabled="isLoading"
                    @click="handleLoadAutoSave(save.index)"
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
          <h4 class="title is-5 mb-3">Load from File</h4>
          <div class="file is-boxed is-centered">
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
                <span class="file-label"> Choose a save file (.json) </span>
              </span>
            </label>
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

.box {
  transition: box-shadow 0.2s;
}

.box:hover {
  box-shadow: 0 0.5em 1em -0.125em rgba(10, 10, 10, 0.2),
    0 0px 0 1px rgba(10, 10, 10, 0.02);
}
</style>
