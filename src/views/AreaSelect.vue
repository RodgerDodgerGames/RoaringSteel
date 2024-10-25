<script setup>
import AreaSelectMap from '@/components/setup/AreaSelectMap.vue'
import AreaSelectPanel from '@/components/setup/AreaSelectPanel.vue'
import { useGameStore } from '@/stores/game'

const gameStore = useGameStore()

// Handle state selection from the map
const handleStateClick = (stateName) => {
  gameStore.setState(stateName)
}

// Handle play game button click
const handlePlayGameClick = () => {}
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
