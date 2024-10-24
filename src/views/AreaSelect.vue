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
  <div class="container">
    <div class="fixed-grid has-1-cols">
      <div class="grid">
        <div class="cell">
          <AreaSelectPanel :state="selectedState" />
        </div>
        <div class="cell">
          <AreaSelectMap :onStateClick="handleStateClick" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
