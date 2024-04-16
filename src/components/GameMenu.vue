<!-- FILEPATH: /Users/reggie/Documents/working/roaring-steel/src/components/GameMenu.vue -->
<template>
  <div>
    <!-- StateMenu component emits 'state-selected' event -->
    <StateMenu @state-selected="handleStateSelected" />
    <button @click="handlePlayClick">Play</button>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import StateMenu from './StateMenu.vue'
import { useTownsStore } from '@/stores/towns'

const townsStore = useTownsStore()
const selectedState = ref(null)

// Function to handle the 'state-selected' event
function handleStateSelected(state) {
  selectedState.value = state
}

// Function to handle the 'Play' button click
async function handlePlayClick() {
  if (selectedState.value) {
    // Call the 'useIndustryData' method from the store with the selected state's fips code
    await townsStore.setupTowns(selectedState.value.fips)
  }
}
</script>
