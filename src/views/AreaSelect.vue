<script setup>
// import components
import AreaSelectMap from '@/components/setup/AreaSelectMap.vue'
import AreaSelectPanel from '@/components/setup/AreaSelectPanel.vue'
// import stores
import { useGameStore } from '@/stores/game'

// setup stores
const gameStore = useGameStore()

// list emits
const emit = defineEmits(['play-game'])

// Handle state selection from the map
const handleStateClick = (selectedState) => {
  gameStore.setState(selectedState)
}
</script>

<template>
  <div class="container">
    <div class="fixed-grid has-1-cols">
      <div class="grid">
        <div class="cell">
          <AreaSelectPanel :state="gameStore.state" @play-game="emit('play-game')" />
        </div>
        <div class="cell">
          <AreaSelectMap :onStateClick="handleStateClick" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
