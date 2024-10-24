<template>
  <div class="map-page">
    <MapView @onStateClick="handleStateClick" />
    <SidePanel :state="selectedState" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import MapView from '@/components/MapView.vue'
import SidePanel from '@/components/SidePanel.vue'

const selectedState = ref('')

// Handle state selection from the map
const handleStateClick = (stateName) => {
  selectedState.value = stateName
}
</script>

<style scoped>
.map-page {
  display: flex;
}
</style>
