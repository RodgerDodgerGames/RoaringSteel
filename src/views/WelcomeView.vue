<template>
  <section class="hero is-primary is-fullheight">
    <div class="hero-body">
      <div class="container has-text-centered">
        <h1 class="title">Welcome to Roaring Steel</h1>
        <h2 class="subtitle">Your adventure begins here</h2>
        <button class="button is-large is-info mt-5" @click="startGame">Start Game</button>
      </div>
    </div>
  </section>
</template>

<script setup>
const startGame = () => {
  // Logic to transition to the next screen
  console.log('Game started')
}
</script>

<style scoped>
/* Additional styling for the welcome screen */
.hero {
  background-image: url('/path/to/your/background-image.jpg');
  background-size: cover;
  background-position: center;
}
</style>
