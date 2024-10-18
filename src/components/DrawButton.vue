<template>
  <button :class="{ save: controlsVisible, draw: !controlsVisible }" @click="toggleControls">
    {{ buttonText }}
  </button>
</template>

<script setup>
import { inject, ref, watch } from 'vue'

const toggleControls = inject('toggleControls')
const controlsVisible = inject('controlsVisible', ref(false))

if (!toggleControls) {
  console.error('toggleControls function is not provided')
}

if (!controlsVisible) {
  console.error('controlsVisible ref is not provided')
}

const buttonText = ref('DRAW')

watch(controlsVisible, (newVal) => {
  buttonText.value = newVal ? 'SAVE' : 'DRAW'
})
</script>

<style scoped>
button {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 1000;
  padding: 10px 20px;
  background-color: var(--button-bg-color);
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
}

button:hover {
  background-color: var(--button-hover-bg-color);
}

:root {
  --button-bg-color: #007bff;
  --button-hover-bg-color: #0056b3;
}

button.save {
  --button-bg-color: #28a745;
  --button-hover-bg-color: #218838;
}

button.draw {
  --button-bg-color: #007bff;
  --button-hover-bg-color: #0056b3;
}
</style>
