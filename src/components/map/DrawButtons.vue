<template>
  <div class="buttons">
    <button class="button is-primary" @click="startDrawingLine">Draw Line</button>
    <button class="button is-warning" @click="cancelDrawing">Cancel Drawing</button>
    <button class="button is-danger" @click="removeDrawings">Remove All Drawings</button>
    <button class="button is-info" @click="enableEditing">Enable Editing</button>
  </div>
</template>

<script setup>
import { defineProps } from 'vue'

const props = defineProps({
  map: {
    type: Object,
    required: true
  }
})

const startDrawingLine = () => {
  props.map.pm.enableDraw('Line', { snappable: true, snapDistance: 20 })
}

const cancelDrawing = () => {
  props.map.pm.disableDraw('Line')
}

const removeDrawings = () => {
  props.map.eachLayer((layer) => {
    if (layer.pm && layer.pm.remove) {
      layer.remove()
    }
  })
}

const enableEditing = () => {
  props.map.eachLayer((layer) => {
    if (layer.pm && layer.pm.toggleEdit) {
      layer.pm.toggleEdit()
    }
  })
}
</script>

<style scoped>
.buttons {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}
</style>
