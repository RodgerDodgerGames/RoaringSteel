<!--
  SettingsButton.vue

  The cog in the top-right corner of the setup screens (welcome, player setup,
  area select), which opens the Settings dialog. It is fixed to the window so
  it stays in the same place as the screens change underneath it.

  During play there is no cog: settings open from the Game menu in the top bar.
-->

<script setup>
import { ref } from 'vue'
import SettingsDialog from '@/components/dialogs/SettingsDialog.vue'

const isDialogOpen = ref(false)
</script>

<template>
  <button
    class="button is-rounded settings-button"
    aria-label="Settings"
    title="Settings"
    @click="isDialogOpen = true"
  >
    <span class="icon"><i class="fas fa-gear" aria-hidden="true"></i></span>
  </button>

  <SettingsDialog v-if="isDialogOpen" @close="isDialogOpen = false" />
</template>

<style scoped>
/* Above the area-select map and its controls (Leaflet reaches 1000) */
.settings-button {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 1100;
}
</style>
