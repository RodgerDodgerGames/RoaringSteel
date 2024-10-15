<template>
  <div>
    <StateMenu @state-selected="handleStateSelected" />
    <button @click="handlePlayClick">Play</button>
    <MainMap v-if="townsStore.towns.length > 0" :towns="townsStore.towns" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import StateMenu from './StateMenu.vue'
import { useTownsStore } from '@/stores/towns'
import MainMap from './MainMap.vue'

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
