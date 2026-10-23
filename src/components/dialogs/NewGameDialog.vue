<!--
  NewGameDialog.vue

  Asks before giving up the game being played for a new one, and offers to
  save it first.

  Saving here downloads a save file, as the Save Game dialog does. The
  game's auto-saves stay in the browser too, but the new game's own
  auto-saves replace them after a few turns, so a file is the safe way to
  keep a game to come back to.

  This dialog only asks. Clearing the game away and moving to the new game's
  setup are left to whoever listens for `start`.

  @emits close - The player decided to keep playing
  @emits start - The player chose to start a new game (after the save, when
                 they asked for one)
-->

<script setup>
import { ref } from 'vue'
import { useGamePersistence } from '@/composables/useGamePersistence'

const emit = defineEmits(['close', 'start'])

const { exportToFile } = useGamePersistence()

/** Name for the save file, without the .json */
const filename = ref('roaring-steel-save')

/** Why the save failed, if it did; the new game is not started then */
const errorMessage = ref('')

/**
 * Downloads the game as a save file, then starts the new game. If the save
 * fails, the game is kept and the player is told, so a game they meant to
 * keep is never thrown away.
 */
function saveAndStart() {
  errorMessage.value = ''
  if (!filename.value.trim()) {
    errorMessage.value = 'Please enter a filename'
    return
  }
  if (!exportToFile(filename.value.trim())) {
    errorMessage.value = 'The game could not be saved, so it has been kept. Please try again.'
    return
  }
  emit('start')
}
</script>

<template>
  <div class="modal is-active">
    <div class="modal-background" @click="emit('close')"></div>
    <div class="modal-card">
      <header class="modal-card-head">
        <p class="modal-card-title">Start a new game?</p>
        <button class="delete" aria-label="close" @click="emit('close')"></button>
      </header>

      <section class="modal-card-body">
        <p class="mb-4">
          This game ends here. Save it first if you might want to come back to it: it is downloaded
          as a file you can open again with Load Game.
        </p>

        <div v-if="errorMessage" class="notification is-danger is-light">
          {{ errorMessage }}
        </div>

        <div class="field">
          <label class="label" for="new-game-filename">Save file name</label>
          <div class="control">
            <input
              id="new-game-filename"
              v-model="filename"
              class="input"
              type="text"
              placeholder="Enter filename (without .json)"
            />
          </div>
          <p class="help">Saved as {{ filename || 'filename' }}.json</p>
        </div>
      </section>

      <footer class="modal-card-foot buttons">
        <button class="button is-primary" @click="saveAndStart">
          <span class="icon"><i class="fas fa-download" aria-hidden="true"></i></span>
          <span>Save, then start new game</span>
        </button>
        <button class="button is-danger is-outlined" @click="emit('start')">
          Start new game without saving
        </button>
        <button class="button" @click="emit('close')">Keep playing</button>
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
