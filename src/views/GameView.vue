<!-- main game view -->

<script setup>
// import components

import MainMap from '@/components/map/MainMap.vue'
import GameSidePanel from '@/components/panel/GameSidePanel.vue'
import BottomPanel from '@/components/demands/BottomPanel.vue'
</script>

<template>
  <div class="section">
    <div class="columns">
      <!-- Main Map -->
      <div class="column is-two-thirds">
        <MainMap />
      </div>

      <!-- Side Panel -->
      <div class="column is-one-third">
        <GameSidePanel />
      </div>
    </div>

    <BottomPanel />
  </div>
</template>

<style scoped></style>
