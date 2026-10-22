<!--
  SettingsButton.vue

  A "Settings" button that opens the Settings dialog, for the New Game steps
  ("Who is playing?" and choosing the area). It sits alongside each step's own
  buttons, so a player can set things up before the game starts.

  During play there is no button: settings open from the Game menu in the
  top bar.
-->

<script setup>
import { ref } from 'vue'
import SettingsDialog from '@/components/dialogs/SettingsDialog.vue'

const isDialogOpen = ref(false)
</script>

<template>
  <button class="button" @click="isDialogOpen = true">
    <span class="icon"><i class="fas fa-gear" aria-hidden="true"></i></span>
    <span>Settings</span>
  </button>

  <!-- Rendered at the end of the page, not inside the button's host, so the
       host's styles (centred text, flex rows) don't leak into the dialog -->
  <Teleport to="body">
    <SettingsDialog v-if="isDialogOpen" @close="isDialogOpen = false" />
  </Teleport>
</template>
