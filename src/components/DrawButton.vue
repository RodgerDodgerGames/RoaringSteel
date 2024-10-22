<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  controlsVisible: Boolean // Receive visibility of the controls as a prop
})

const buttonText = ref('DRAW')

// Watch for changes in the `controlsVisible` prop and update the button text accordingly
watch(
  () => props.controlsVisible,
  (newVal) => {
    buttonText.value = newVal ? 'SAVE' : 'DRAW'
  }
)

// Emit the toggle event to the parent when the button is clicked
const emit = defineEmits(['toggle-drawing'])
const toggleControls = () => {
  emit('toggle-drawing')
}
</script>

<template>
  <button :class="{ save: controlsVisible, draw: !controlsVisible }" @click="toggleControls">
    {{ buttonText }}
  </button>
</template>

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
