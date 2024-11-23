<template>
  <nav class="navbar is-primary" role="navigation" aria-label="main navigation">
    <div class="navbar-brand">
      <!-- Left Slot for Branding -->
      <slot name="left">
        <a class="navbar-item is-family-secondary mr-6" href="#">
          <h1 class="title">Roaring Steel</h1>
        </a>

        <a class="navbar-item ml-6">End Turn</a>
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
          <a class="navbar-item" href="#">Home</a>
          <a class="navbar-item" href="#">About</a>
          <a class="navbar-item" href="#">Contact</a>
        </div>
      </slot>
    </div>
  </nav>
</template>

<script setup>
// State for controlling the burger menu
import { ref } from 'vue'

const isMenuActive = ref(false)

const toggleMenu = () => {
  isMenuActive.value = !isMenuActive.value
}
</script>

<style scoped>
.navbar-brand .title {
  font-family: 'Eutemia';
}
</style>
