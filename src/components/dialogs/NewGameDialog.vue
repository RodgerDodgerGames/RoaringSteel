<!--
  NewGameDialog.vue

  Asks before giving up the game being played for a new one, and offers to
  save it first.

  Saving here downloads a save file, as the Save Game dialog does. The
  game's auto-saves stay in the browser too, but the new game's own
  auto-saves replace them after a few rounds, so a file is the safe way to
  keep a game to come back to.

  Saving does not start the new game by itself. The browser may ask where
  to put the file, and the player may cancel, which this dialog cannot see;
  so once the download has started it asks one more time, and the game is
  only given up when the player says so.

  This dialog only asks. Clearing the game away and moving to the new game's
  setup are left to whoever listens for `start`.

  @emits close - The player decided to keep playing
  @emits start - The player chose to start a new game (after the save, when
                 they asked for one)
-->

<script setup>
import { ref } from 'vue'
import { useSaveToFile } from '@/composables/useSaveToFile'

const emit = defineEmits(['close', 'start'])

const { filename, fileLabel, errorMessage, save } = useSaveToFile()

/** True once the save file has been downloaded */
const isSaved = ref(false)

/** Downloads the save file, then asks once more before ending the game */
function handleSave() {
  isSaved.value = save()
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
        <template v-if="isSaved">
          <div class="notification is-success is-light">
            Your game is downloading as {{ fileLabel }}. Open it again any time with Load Game.
          </div>
          <p>Once the file is safely saved, start the new game.</p>
        </template>

        <template v-else>
          <p class="mb-4">
            This game ends here. Save it first if you might want to come back to it: it is
            downloaded as a file you can open again with Load Game.
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
            <p class="help">Saved as {{ fileLabel }}</p>
          </div>
        </template>
      </section>

      <footer class="modal-card-foot buttons">
        <template v-if="isSaved">
          <button class="button is-primary" @click="emit('start')">Start new game</button>
        </template>
        <template v-else>
          <button class="button is-primary" @click="handleSave">
            <span class="icon"><i class="fas fa-download" aria-hidden="true"></i></span>
            <span>Save game</span>
          </button>
          <button class="button is-danger is-outlined" @click="emit('start')">
            Start new game without saving
          </button>
        </template>
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
