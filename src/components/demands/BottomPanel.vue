<template>
  <div>
    <!-- Sliding Panel -->
    <div class="sliding-panel" :class="{ 'is-active': isActive }">
      <!-- Open/Close Button -->
      <button class="toggle-button" @click="togglePanel">
        {{ isActive ? 'Hide ↓ Cards' : 'Show ↑ Cards' }}
      </button>

      <!-- Panel Content -->
      <div class="block has-text-centered p-2">
        <h3 class="title is-3 has-text-black">Demand Cards</h3>
        <!-- testing out demand cards -->
        <DemandCard :cards="cards" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useDemandCardsStore } from '@/stores/demandCards'
import DemandCard from '@/components/demands/DemandCard.vue'

const demandCardsStore = useDemandCardsStore()
// just grab first three cards
const cards = demandCardsStore.demandCards.slice(0, 3)

// Reactive state to control panel visibility
const isActive = ref(false)

// Toggle the panel's visibility
const togglePanel = () => {
  isActive.value = !isActive.value
}
</script>

<style scoped>
/* Ensure HTML and Body take full height */
html,
body {
  height: 100%;
  margin: 0;
  overflow: hidden; /* Prevent scrolling behind the panel */
}

/* Base styles for the sliding panel */
.sliding-panel {
  position: fixed;
  bottom: -100%; /* Initially hidden below the viewport */
  left: 0;
  width: 100%;
  height: 50%; /* Adjust panel height */
  background: #fff;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
  transition: bottom 0.3s ease; /* Smooth slide-up animation */
  z-index: 9999991100; /* Ensure it appears above other content */
  overflow: hidden;
}

/* Make the panel slide up when active */
.sliding-panel.is-active {
  bottom: 0;
}

/* Panel Content Styling */
.panel-content {
  /* padding: 1.5rem; */
  text-align: center;
}

/* Open/Close Button Styling */
.toggle-button {
  position: fixed; /* Position relative to viewport */
  left: 50%; /* Center horizontally */
  transform: translateX(-50%);
  bottom: 0; /* Always at the bottom of the viewport */
  z-index: 9999991200; /* Ensure it is above the panel */
  background: #3273dc;
  color: white;
  border: none;
  border-radius: 5px;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-size: 1.25rem;
  transition: bottom 0.3s ease; /* Smooth transition for movement */
}

/* Move button to the top of the panel when active */
.sliding-panel.is-active .toggle-button {
  bottom: calc(50% + 1rem); /* Place it above the panel */
}
</style>
