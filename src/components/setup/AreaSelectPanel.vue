<!--
  AreaSelectPanel.vue

  Control panel for the area selection screen. Displays the currently
  selected region and provides a "Play Game" button to proceed.
  Button is disabled until a region is selected.

  @prop region - GeoJSON feature of the selected state
  @emits play-game - Triggered when user clicks Play Game button
-->

<template>
  <div class="level">
    <p>Where would you like to play?</p>
    <!-- make message class danger if no region is selected -->
    <p :class="{ 'has-text-info': props.region, 'has-text-danger': !props.region }">{{ msg }}</p>
    <button class="button is-primary" @click="emit('play-game')" :disabled="!props.region">
      Play Game
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
// Props to receive the selected region
const props = defineProps({
  region: Object
})
// define emits
const emit = defineEmits(['play-game'])

const msg = computed(() => {
  if (props.region) {
    return `Selected region: ${props.region.properties.NAME}`
  }
  return 'No region selected yet'
})
</script>

<style scoped></style>
