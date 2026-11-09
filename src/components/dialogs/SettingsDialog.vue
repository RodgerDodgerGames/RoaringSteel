<!--
  SettingsDialog.vue

  Modal dialog for the player's settings. It opens from the Settings button
  on the New Game steps (SettingsButton) and from the Game menu during play.

  The settings are in two groups, each on a tab of its own:
  - Game: the game settings, which change how a game is played. Before a
    game starts (the dialog opened from the New Game steps) they are the
    choices for the next game. During play (opened from the Game menu) they
    are the settings this game is played by, shown but locked.
  - Display: how the game looks and what it shows, changeable at any time.

  Changes are made on a draft (see useSettingsDraft.js): Save keeps them,
  and Cancel — or Esc, or a click outside the dialog — throws them away. A
  theme being picked shows on the page straight away, as a preview, and goes
  back if the player cancels.

  @prop inGame - True when opened during play, which locks the game settings
  @emits close - Emitted once the dialog is done with, saved or not
-->

<script setup>
import { ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { useGameStore } from '@/stores/game'
import { useSettingsDraft } from '@/composables/useSettingsDraft'
import GameSettings from '@/components/settings/GameSettings.vue'
import DisplaySettings from '@/components/settings/DisplaySettings.vue'

const props = defineProps({
  inGame: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close'])

const gameStore = useGameStore()
const { draft, save } = useSettingsDraft()

/** The tabs, in order: one per group of settings */
const tabs = [
  { id: 'game', label: 'Game' },
  { id: 'display', label: 'Display' }
]

/**
 * The tab shown first: the game settings while they can still be chosen,
 * and the display settings during play, when the game settings are locked
 */
const activeTab = ref(props.inGame ? 'display' : 'game')

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
        <div class="tabs is-small">
          <ul role="tablist">
            <li v-for="tab in tabs" :key="tab.id" :class="{ 'is-active': activeTab === tab.id }">
              <a
                role="tab"
                :aria-selected="activeTab === tab.id"
                href="#"
                @click.prevent="activeTab = tab.id"
                >{{ tab.label }}</a
              >
            </li>
          </ul>
        </div>

        <div v-show="activeTab === 'game'" role="tabpanel">
          <!-- During play, a copy of the game's own settings, locked, so
               nothing here can change the rules mid-game; before it, the
               draft's choices for the next game -->
          <GameSettings v-if="inGame" :model-value="{ ...gameStore.gameSettings }" locked />
          <GameSettings v-else v-model="draft" />
        </div>
        <div v-show="activeTab === 'display'" role="tabpanel">
          <DisplaySettings v-model="draft" />
        </div>

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
