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
