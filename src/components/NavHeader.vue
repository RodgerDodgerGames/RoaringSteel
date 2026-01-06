<!--
  NavHeader.vue

  Main navigation header with game title and menu controls.
  Uses Bulma navbar with responsive burger menu for mobile.
  Provides slots for left (branding) and right (navigation) content.

  Features:
  - Responsive burger menu toggle
  - End Turn button
  - Named slots for customization
-->

<template>
  <nav class="navbar is-primary" role="navigation" aria-label="main navigation">
    <div class="navbar-brand">
      <!-- Left Slot for Branding -->
      <slot name="left">
        <a class="navbar-item is-family-secondary mr-6" href="#">
          <h1 class="title">Roaring Steel</h1>
        </a>

        <a id="endTurnButton" class="navbar-item ml-6">End Turn</a>
      </slot>
      <!-- Burger Menu for Mobile -->
      <a
        role="button"
        class="navbar-burger"
        :class="{ 'is-active': isMenuActive }"
        aria-label="menu"
        aria-expanded="false"
        @click="toggleMenu"
      >
        <span aria-hidden="true"></span>
        <span aria-hidden="true"></span>
        <span aria-hidden="true"></span>
      </a>
    </div>

    <div class="navbar-menu" :class="{ 'is-active': isMenuActive }">
      <!-- Right Slot for Navigation Items -->
      <slot name="right">
        <div class="navbar-end">
          <a class="navbar-item" @click="openSaveDialog">Save Game</a>
          <a class="navbar-item" href="#">About</a>
          <a class="navbar-item" href="#">Contact</a>
        </div>
      </slot>
    </div>
  </nav>

  <!-- Save Game Dialog -->
  <SaveGameDialog v-if="showSaveDialog" @close="closeSaveDialog" />
</template>

<script setup>
// State for controlling the burger menu
import { ref } from 'vue'
import SaveGameDialog from '@/components/dialogs/SaveGameDialog.vue'

const isMenuActive = ref(false)
const showSaveDialog = ref(false)

const toggleMenu = () => {
  isMenuActive.value = !isMenuActive.value
}

const openSaveDialog = () => {
  showSaveDialog.value = true
}

const closeSaveDialog = () => {
  showSaveDialog.value = false
}
</script>

<style scoped>
.navbar-brand .title {
  font-family: 'Eutemia';
}
#endTurnButton {
  border: solid 1px #fff;
  border-radius: 6px;
  height: 32px;
  margin-top: 10px;
  padding: 1rem;
}
</style>
