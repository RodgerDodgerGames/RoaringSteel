<template>
  <!-- Dropdown menu for selecting a state -->
  <select @change="handleStateChange">
    <option v-for="state in states" :key="state.fips" :value="state.fips">
      {{ state.name }}
    </option>
  </select>
</template>

<script setup>
import { ref } from 'vue'

import usStates from '@/config/usStates.js'

// setup emits
const emit = defineEmits(['state-selected'])

// Array of states
const states = ref(usStates)

// Function to handle state change event
function handleStateChange(event) {
  // Find the selected state based on the fips value
  const selectedState = states.value.find((state) => state.fips === event.target.value)
  // Emit the 'state-selected' event with the selected state as the payload
  emit('state-selected', selectedState)
}
</script>
