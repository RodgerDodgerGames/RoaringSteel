<!--
  MapCreditsLink.vue

  A small "Credits" link in a map's bottom-right corner, where map credits
  usually sit, that opens the About dialog. The maps carry no credit line of
  their own (Leaflet's is turned off); every credit is listed in About.

  The parent places this over its map: it must sit inside an element with
  `position: relative` that also holds the map.
-->

<script setup>
import { ref } from 'vue'
import AboutDialog from '@/components/dialogs/AboutDialog.vue'

const isDialogOpen = ref(false)
</script>

<template>
  <button type="button" class="map-credits" @click="isDialogOpen = true">Credits</button>

  <Teleport to="body">
    <AboutDialog v-if="isDialogOpen" @close="isDialogOpen = false" />
  </Teleport>
</template>

<style scoped>
/* Styled like Leaflet's own credit line, which it replaces */
.map-credits {
  position: absolute;
  right: 0;
  bottom: 0;
  /* Above Leaflet's panes and controls */
  z-index: 1000;
  padding: 0 5px;
  border: 0;
  background: rgba(255, 255, 255, 0.8);
  color: #0078a8;
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
}

.map-credits:hover {
  text-decoration: underline;
}
</style>
