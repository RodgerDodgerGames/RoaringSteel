<template>
  <section class="hero is-fullheight">
    <div class="hero-body">
      <div id="welcomeContainer" class="container has-text-centered">
        <h1 class="title roaring-title">Welcome to Roaring Steel</h1>
        <h2 class="subtitle is-3">Your adventure begins here</h2>
        <div class="buttons are-large mt-6 is-flex is-justify-content-center">
          <button class="button is-info is-outlined mr-6" @click="newGame">New Game</button>
          <button class="button is-link is-outlined" @click="loadGame">Load Game</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
function newGame() {
  console.log('new game clicked')
}

function loadGame() {
  console.log('load game clicked')
}
</script>

<style scoped>
/* Additional styling for the welcome screen */
.hero {
  background-image: url('src/assets/images/Unknown.jpg');
  background-size: cover;
  background-position: center;
}
.roaring-title {
  font-family: 'Saddlebag';
  font-size: 4rem;
}
#welcomeContainer {
  margin-bottom: 30%;
}
</style>
