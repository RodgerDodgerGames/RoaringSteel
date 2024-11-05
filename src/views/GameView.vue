<!-- main game view -->

<script setup>
// import components
import DrawButtons from '@/components/map/DrawButtons.vue'
import MainMap from '@/components/map/MainMap.vue'
// import game store
import { useGameStore } from '@/stores/game'

const gameStore = useGameStore()
</script>

<template>
  <div class="columns">
    <!-- Main Map -->
    <div class="column is-three-quarters">
      <MainMap />
    </div>

    <!-- Side Panel -->
    <div class="column is-one-quarter">
      <div class="panel">
        <div class="panel-heading">
          <p class="panel-title">Side Panel</p>
        </div>
        <div class="panel-tabs">
          <a class="panel-tab is-active">Tab 1</a>
          <a class="panel-tab">Tab 2</a>
        </div>

        <!-- show draw buttons when map is available -->
        <DrawButtons
          v-if="gameStore.townsLayer"
          :map="gameStore.mainMap"
          :towns="gameStore.townsLayer"
        />
      </div>
    </div>
  </div>
</template>

<style scoped></style>
