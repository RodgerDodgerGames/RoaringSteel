<!--
  GameSidePanel.vue

  Main game action panel with tabbed navigation. Provides access to:
  - Home: Overview with quick actions
  - Build: Railroad track building tools
  - Upgrade: Train upgrade options (not yet implemented)

  Uses Bulma tabs component for navigation between sections.
-->

<script setup>
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import DrawButtons from '@/components/map/DrawButtons.vue'
import { useMapStore } from '@/stores/map'

// Import map store
const mapStore = useMapStore()
const { map, townsLayer } = storeToRefs(mapStore)

// Track the active tab
const activeTab = ref('Home')

// Function to change active tab
const setActiveTab = (tab) => {
  activeTab.value = tab
}
</script>

<template>
  <!-- Bulma Tabs Navigation -->
  <div class="tabs is-boxed">
    <ul>
      <li :class="{ 'is-active': activeTab === 'Home' }">
        <a @click="setActiveTab('Home')">Home</a>
      </li>
      <li :class="{ 'is-active': activeTab === 'Build' }">
        <a @click="setActiveTab('Build')">Build</a>
      </li>
      <li :class="{ 'is-active': activeTab === 'Upgrade' }">
        <a @click="setActiveTab('Upgrade')">Upgrade</a>
      </li>
    </ul>
  </div>

  <!-- Tab Content -->

  <!-- Home tab content -->
  <div v-if="activeTab === 'Home'">
    <div class="block is-flex is-align-items-center mt-2">
      Would you like to
      <button @click="setActiveTab('Build')" class="button mx-2">Build</button> track?
    </div>
    <p class="has-text-centered">- OR -</p>
    <div class="block is-flex is-align-items-center mt-2">
      <button @click="setActiveTab('Upgrade')" class="button mr-2">Upgrade</button> your train?
    </div>
  </div>

  <!-- Build tab content -->
  <div v-if="activeTab === 'Build'">
    <DrawButtons v-if="townsLayer && map" :map="map" :towns="townsLayer" />
  </div>

  <div v-if="activeTab === 'Upgrade'"></div>
</template>

<style scoped></style>
