<script setup>
import { ref } from 'vue'

const props = defineProps({
  map: {
    type: Object,
    required: true
  },
  towns: {
    type: Object,
    required: true
  }
})

const existingLineLayer = ref([])

// Function to start drawing a line with snapping enabled
const startDrawingLine = () => {
  props.map.value.pm.enableDraw('Line', {
    snappable: true,
    snapDistance: 20
  })

  props.map.value.on('pm:create', (e) => {
    if (e.layer && e.layer.pm._shape === 'Line') {
      const isValidStart = validateStartPoint(e.layer)
      if (!isValidStart) {
        e.layer.remove()
        alert('You must start your line at an existing marker or endpoint.')
      } else {
        existingLineLayer.value.push(e.layer)
      }
    }
  })
}

// Function to validate if a line starts at a marker or another line's endpoint
const validateStartPoint = (lineLayer) => {
  const startLatLng = lineLayer.getLatLngs()[0]

  // Check if the start point matches an existing marker or line endpoint
  const isStartingAtMarker = props.towns.value
    .getLayers()
    .some((marker) => marker.getLatLng().equals(startLatLng))

  const isStartingAtLineEnd = existingLineLayer.value.some((line) => {
    const linePoints = line.getLatLngs()
    return (
      linePoints[0].equals(startLatLng) || linePoints[linePoints.length - 1].equals(startLatLng)
    )
  })

  return isStartingAtMarker || isStartingAtLineEnd
}

// Cancel the current drawing mode
const cancelDrawing = () => {
  props.map.value.pm.disableDraw('Line')
}

// Enable selective removal mode, allowing the user to click on a feature to remove it
const enableRemoveMode = () => {
  props.map.value.pm.toggleGlobalRemovalMode()
}

// Enable editing mode for all drawn features
const enableEditing = () => {
  props.map.value.eachLayer((layer) => {
    if (layer.pm && layer.pm.toggleEdit) {
      layer.pm.toggleEdit()
    }
  })
}
</script>

<template>
  <div class="buttons">
    <button class="button is-primary" @click="startDrawingLine">Draw</button>
    <button class="button is-warning" @click="cancelDrawing">Cancel</button>
    <button class="button is-danger" @click="enableRemoveMode">Remove</button>
    <button class="button is-info" @click="enableEditing">Edit</button>
  </div>
</template>

<style scoped>
.buttons {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}
</style>
