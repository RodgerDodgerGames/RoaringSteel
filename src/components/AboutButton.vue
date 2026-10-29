<!--
  AboutButton.vue

  An "About" button that opens the About dialog (what the game is, and its
  credits), for the New Game steps. It sits beside the Settings button.

  During play there is no button: About opens from the Game menu in the top
  bar, and from the Credits link on the map.
-->

<script setup>
import { ref } from 'vue'
import AboutDialog from '@/components/dialogs/AboutDialog.vue'

const isDialogOpen = ref(false)
</script>

<template>
  <button class="button" @click="isDialogOpen = true">
    <span class="icon"><i class="fas fa-circle-info" aria-hidden="true"></i></span>
    <span>About</span>
  </button>

  <!-- Rendered at the end of the page, not inside the button's host, so the
       host's styles (centered text, flex rows) don't leak into the dialog -->
  <Teleport to="body">
    <AboutDialog v-if="isDialogOpen" @close="isDialogOpen = false" />
  </Teleport>
</template>
