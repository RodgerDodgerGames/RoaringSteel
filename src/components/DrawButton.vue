<template>
  <button @click="toggleControls">DRAW</button>
</template>

<script setup>
import { inject } from 'vue'

const toggleControls = inject('toggleControls')

if (!toggleControls) {
  console.error('toggleControls function is not provided')
}
</script>

<style scoped>
button {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 1000;
  padding: 10px 20px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
}

button:hover {
  background-color: #0056b3;
}
</style>
