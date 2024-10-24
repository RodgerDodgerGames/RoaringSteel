<template>
  <div class="block">
    <p>{{ msg }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
// Props to receive the selected state
const props = defineProps({
  state: String
})

const msg = computed(() => {
  if (props.state) {
    return `Selected: ${props.state}`
  }
  return 'No state selected yet'
})
</script>

<style scoped></style>
