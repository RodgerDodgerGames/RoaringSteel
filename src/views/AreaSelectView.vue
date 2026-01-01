<!--
  AreaSelectView.vue

  Region selection screen where players choose the geographic area
  for their game. Displays a clickable map of US states and a panel
  showing the selected region.

  @emits play-game - When the player confirms their region selection
-->

<script setup>
import AreaSelectMap from '@/components/setup/AreaSelectMap.vue'
import AreaSelectPanel from '@/components/setup/AreaSelectPanel.vue'
import { useGameStore } from '@/stores/game'

const gameStore = useGameStore()
const emit = defineEmits(['play-game'])

/**
 * Handles state selection from the map component.
 * Stores the selected region in the game store.
 * @param {Object} selectedState - GeoJSON feature of the selected state
 */
const handleStateClick = (selectedState) => {
  gameStore.setRegion(selectedState)
}
</script>

<template>
  <div class="section">
    <div class="fixed-grid has-1-cols">
      <div class="grid">
        <div class="cell">
          <AreaSelectPanel :region="gameStore.region" @play-game="emit('play-game')" />
        </div>
        <div class="cell">
          <AreaSelectMap @state-click="handleStateClick" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
