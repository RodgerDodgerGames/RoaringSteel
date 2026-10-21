<!--
  GameSidePanel.vue

  Main game action panel with tabbed navigation. Topped by a card naming the
  player whose turn it is. Provides access to:
  - Info: Overview with quick actions
  - Build: Railroad track building tools
  - Upgrade: Train upgrade options (not yet implemented)

  Uses Bulma tabs component for navigation between sections.
-->

<script setup>
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import DrawButtons from '@/components/map/DrawButtons.vue'
import PlayerCard from '@/components/panel/PlayerCard.vue'
import { useMapStore } from '@/stores/map'

// Import map store
const mapStore = useMapStore()
const { map, townsLayer } = storeToRefs(mapStore)

// Track the active tab
const activeTab = ref('Info')

// Function to change active tab
const setActiveTab = (tab) => {
  activeTab.value = tab
}
</script>

<template>
  <!-- Whose turn it is, and what they have to spend -->
  <PlayerCard />

  <!-- Bulma Tabs Navigation -->
  <div class="tabs is-boxed">
    <ul>
      <li :class="{ 'is-active': activeTab === 'Info' }">
        <a @click="setActiveTab('Info')">Info</a>
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

  <!-- Info tab content -->
  <div v-if="activeTab === 'Info'">
    <div class="block is-flex is-align-items-center mt-2">
      Would you like to
      <button @click="setActiveTab('Build')" class="button mx-2">Build</button> track?
    </div>
    <p class="has-text-centered">- OR -</p>
    <div class="block is-flex is-align-items-center mt-2">
      <button @click="setActiveTab('Upgrade')" class="button mr-2">Upgrade</button> your train?
    </div>
  </div>

  <!--
    Build tab content. Hidden with v-show rather than v-if: the build controls
    own the track layers on the map, so they have to stay mounted for the whole
    game. Unmounting them on a tab switch would take every section off the map,
    and a saved game would show no track until Build was opened.
  -->
  <div v-show="activeTab === 'Build'">
    <DrawButtons v-if="townsLayer && map" :map="map" :towns="townsLayer" />
  </div>

  <div v-if="activeTab === 'Upgrade'"></div>
</template>

<style scoped></style>
