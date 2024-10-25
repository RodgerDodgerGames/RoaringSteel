<script setup>
import { storeToRefs } from 'pinia'
// import components
import AreaSelectMap from '@/components/setup/AreaSelectMap.vue'
import AreaSelectPanel from '@/components/setup/AreaSelectPanel.vue'
// import stores
import { useGameStore } from '@/stores/game'
import { useTownsStore } from '@/stores/towns'

// setup stores
const townsStore = useTownsStore()
const gameStore = useGameStore()

// setup refs
const { state } = storeToRefs(gameStore)

// Handle state selection from the map
const handleStateClick = (selectedState) => {
  gameStore.setState(selectedState)
}

// Handle play game button click
async function handlePlayGameClick() {
  console.log('handlePlayGameClick', state.value)
  if (state.value) {
    // run setup towns after the state is selected
    await townsStore.setupTowns(state.value.properties.STATE)
    // run cost grid setup
  }
}
</script>

<template>
  <div class="container">
    <div class="fixed-grid has-1-cols">
      <div class="grid">
        <div class="cell">
          <AreaSelectPanel :state="gameStore.state" @play-game="handlePlayGameClick" />
        </div>
        <div class="cell">
          <AreaSelectMap :onStateClick="handleStateClick" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
