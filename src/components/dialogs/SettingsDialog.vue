<!--
  SettingsDialog.vue

  Modal dialog for the player's settings. It opens from the Settings button
  on the New Game steps (SettingsButton) and from the Game menu during play.

  Changes are made on a draft (see useSettingsDraft.js): Save keeps them,
  and Cancel — or Esc, or a click outside the dialog — throws them away. A
  theme being picked shows on the page straight away, as a preview, and goes
  back if the player cancels.

  @emits close - Emitted once the dialog is done with, saved or not
-->

<script setup>
import { useEventListener } from '@vueuse/core'
import { useSettingsDraft } from '@/composables/useSettingsDraft'
import DisplaySettings from '@/components/settings/DisplaySettings.vue'

const emit = defineEmits(['close'])

const { draft, save } = useSettingsDraft()

/** Keeps the changes and closes */
function onSave() {
  save()
  emit('close')
}

/**
 * Throws the changes away and closes: the draft goes with the dialog, and
 * so does any theme preview (see useSettingsDraft.js)
 */
function onCancel() {
  emit('close')
}

// Esc is the keyboard's Cancel. Caught on its way down to the page, before
// anything else hears it, and stopped there: the map's own Esc (stop
// building, stop choosing a town) must not also go off behind the dialog.
useEventListener(
  window,
  'keydown',
  (event) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    onCancel()
  },
  { capture: true }
)
</script>

<template>
  <div class="modal is-active">
    <div class="modal-background" @click="onCancel"></div>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header class="modal-card-head">
        <p id="settings-title" class="modal-card-title">Settings</p>
      </header>

      <section class="modal-card-body">
        <DisplaySettings v-model="draft" />

        <p class="is-size-7 has-text-grey mt-5">
          Settings are remembered in this browser and saved with your game.
        </p>
      </section>

      <footer class="modal-card-foot is-justify-content-flex-end">
        <div class="buttons">
          <button class="button" @click="onCancel">Cancel</button>
          <button class="button is-primary" @click="onSave">Save</button>
        </div>
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
