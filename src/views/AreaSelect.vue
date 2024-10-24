<script setup>
import { ref } from 'vue'
import AreaSelectMap from '@/components/setup/AreaSelectMap.vue'
import AreaSelectPanel from '@/components/setup/AreaSelectPanel.vue'

const selectedState = ref('')

// Handle state selection from the map
const handleStateClick = (stateName) => {
  selectedState.value = stateName
}
</script>

<template>
  <div class="map-page">
    <AreaSelectMap @onStateClick="handleStateClick" />
    <AreaSelectPanel :state="selectedState" />
  </div>
</template>

<style scoped>
.map-page {
  display: flex;
  flex-direction: column; /* Stack map and panel vertically */
  height: 100vh; /* Full viewport height */
}

.map-container {
  flex: 1; /* Map takes up most of the space */
}

.bottom-panel {
  height: 150px;
  background-color: #f8f8f8;
  border-top: 1px solid #ddd;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
