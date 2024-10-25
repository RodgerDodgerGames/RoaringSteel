<template>
  <div class="level">
    <p>Where would you like to play?</p>
    <!-- make message class danger if no state is selected -->
    <p :class="{ 'has-text-info': props.state, 'has-text-danger': !props.state }">{{ msg }}</p>
    <button class="button is-primary" @click="emit('play-game')">Play Game</button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
// Props to receive the selected state
const props = defineProps({
  state: Object
})
// define emits
const emit = defineEmits(['play-game'])

const msg = computed(() => {
  if (props.state) {
    return `Selected state: ${props.state.properties.NAME}`
  }
  return 'No state selected yet'
})
</script>

<style scoped></style>
