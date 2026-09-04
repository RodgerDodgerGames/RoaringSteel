<!--
  NavHeader.vue

  Main navigation header with game title and menu controls.
  Uses Bulma navbar with responsive burger menu for mobile.
  Provides slots for left (branding) and right (navigation) content.

  Features:
  - Responsive burger menu toggle
  - End Turn button that passes play to the next player
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

        <a id="endTurnButton" class="navbar-item ml-6" @click="handleEndTurn">End Turn</a>
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
          <a class="navbar-item" @click="showSaveDialog = true">Save</a>
          <a class="navbar-item" @click="showLoadDialog = true">Load</a>
          <a class="navbar-item" href="#">About</a>
          <a class="navbar-item" href="#">Contact</a>
        </div>
      </slot>
    </div>
  </nav>

  <!-- Save Game Dialog -->
  <SaveGameDialog v-if="showSaveDialog" @close="showSaveDialog = false" />

  <!-- Load Game Dialog -->
  <LoadGameDialog v-if="showLoadDialog" @close="showLoadDialog = false" />
</template>

<script setup>
// State for controlling the burger menu
import { ref } from 'vue'
import SaveGameDialog from '@/components/dialogs/SaveGameDialog.vue'
import LoadGameDialog from '@/components/dialogs/LoadGameDialog.vue'
import { useTurn } from '@/composables/useTurn'

const isMenuActive = ref(false)
const showSaveDialog = ref(false)
const showLoadDialog = ref(false)

const { endTurn } = useTurn()

const toggleMenu = () => {
  isMenuActive.value = !isMenuActive.value
}

// Pass play to the next player, closing the mobile menu behind us.
const handleEndTurn = () => {
  endTurn()
  isMenuActive.value = false
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
