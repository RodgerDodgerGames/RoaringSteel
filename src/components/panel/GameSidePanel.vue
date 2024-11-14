<script setup>
import { ref } from 'vue'
import DrawButtons from '@/components/map/DrawButtons.vue'
import { useGameStore } from '@/stores/game'

// Import game store
const gameStore = useGameStore()

// Track the active tab
const activeTab = ref(null)

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
    <div class="block is-flex is-align-items-center mt-2">
      Or <button @click="setActiveTab('Upgrade')" class="button mx-2">Upgrade</button> your train?
    </div>
  </div>

  <!-- Build tab content -->
  <div v-if="activeTab === 'Build'">
    <DrawButtons
      v-if="gameStore.townsLayer"
      :map="gameStore.mainMap"
      :towns="gameStore.townsLayer"
    />
  </div>

  <div v-if="activeTab === 'Upgrade'"></div>
</template>

<style scoped></style>
