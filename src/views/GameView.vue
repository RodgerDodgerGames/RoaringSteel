<!-- main game view -->

<script setup>
// import components
import DrawButtons from '@/components/map/DrawButtons.vue'
import MainMap from '@/components/map/MainMap.vue'
</script>

<template>
  <div class="container is-fluid">
    <div class="columns">
      <!-- Main Map -->
      <div class="column is-four-fifths">
        <MainMap />
      </div>

      <!-- Side Panel -->
      <div class="column">
        <div class="panel">
          <div class="panel-heading">
            <p class="panel-title">Side Panel</p>
          </div>
          <div class="panel-tabs">
            <a class="panel-tab is-active">Tab 1</a>
            <a class="panel-tab">Tab 2</a>
          </div>
          <div class="panel-block">
            <DrawButtons />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
