<!--
  SettingsDialog.vue

  Modal dialog for the player's display preferences. It opens from the
  Settings button on the New Game steps (SettingsButton) and from the Game
  menu during play.

  Each setting takes effect the moment it is changed and is remembered in this
  browser (and written into the next save), so there is no Save button — only
  Close.

  @emits close - Emitted when the player clicks Close, the X, or the background
-->

<script setup>
import { storeToRefs } from 'pinia'
import { useSettingsStore, SETTING_RANGES } from '@/stores/settings'

const emit = defineEmits(['close'])

const { settings } = storeToRefs(useSettingsStore())

/** Every pin limit the player can choose, smallest first */
const { min, max } = SETTING_RANGES.pinLimit
const pinLimits = Array.from({ length: max - min + 1 }, (_, i) => min + i)
</script>

<template>
  <div class="modal is-active">
    <div class="modal-background" @click="emit('close')"></div>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header class="modal-card-head">
        <p id="settings-title" class="modal-card-title">Settings</p>
        <button class="delete" aria-label="close" @click="emit('close')"></button>
      </header>

      <section class="modal-card-body">
        <div class="field">
          <div class="control">
            <label class="checkbox">
              <input v-model="settings.showDeckCount" type="checkbox" />
              Show how many demand cards are left in the deck
            </label>
          </div>
          <p class="help">The count appears in the header of the demand card strip.</p>
        </div>

        <div class="field">
          <label class="label is-small" for="pin-limit">Pinned demand lines</label>
          <div class="control">
            <div class="select is-small">
              <select id="pin-limit" v-model.number="settings.pinLimit">
                <option v-for="count in pinLimits" :key="count" :value="count">{{ count }}</option>
              </select>
            </div>
          </div>
          <p class="help">
            How many demand lines you can pin to the map at once, each in its own color. Pinning one
            more drops the oldest.
          </p>
        </div>

        <p class="is-size-7 has-text-grey mt-5">
          Settings are remembered in this browser and saved with your game.
        </p>
      </section>

      <footer class="modal-card-foot">
        <button class="button" @click="emit('close')">Close</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.modal-card {
  max-width: 500px;
  width: 90vw;
}
</style>
