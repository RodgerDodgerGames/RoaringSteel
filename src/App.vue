<script setup>
import AreaSelect from '@/views/AreaSelect.vue'
</script>

<template>
  <div id="app">
    <!-- Navbar Section -->
    <nav class="navbar is-primary" role="navigation" aria-label="main navigation">
      <div class="navbar-brand">
        <a class="navbar-item" href="#">
          <!-- <img src="@/assets/logo.png" alt="Logo" /> -->
        </a>
      </div>

      <div class="navbar-menu">
        <div class="navbar-start">
          <a class="navbar-item">Home</a>
          <a class="navbar-item">About</a>
        </div>
        <div class="navbar-end">
          <a class="navbar-item">Login</a>
        </div>
      </div>
    </nav>

    <!-- Main Content Section -->
    <section class="section">
      <div class="container">
        <AreaSelect />
      </div>
    </section>

    <!-- Footer Section -->
    <footer class="footer">
      <div class="content has-text-centered">
        <p><strong>My Vue App</strong> by <a href="#">You</a>. All rights reserved.</p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* Additional styles for your app can go here */
</style>
