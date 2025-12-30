<!-- 
  src/views/WelcomeView.vue 
  The first page of the application
 -->

<script setup>
import { ref } from 'vue'
import PlayerSelect from '@/components/setup/PlayerSelect.vue'

// which pane should be shown
const activePane = ref('gameButtons')

function newGame() {
  console.log('new game clicked')
  activePane.value = 'playerSelect'
}

function loadGame() {
  console.log('load game clicked')
}
</script>

<template>
  <section class="hero is-fullheight">
    <div class="hero-body">
      <div id="welcomeContainer" class="container has-text-centered">
        <h1 class="title roaring-title">Welcome to Roaring Steel</h1>
        <h2 class="subtitle is-3">Your adventure begins here</h2>

        <!-- conditionally show user interactioncontent here -->

        <!-- Game buttons -->
        <div
          v-if="activePane === 'gameButtons'"
          class="buttons are-large mt-6 is-flex is-justify-content-center"
        >
          <button class="button is-info is-outlined mr-6" @click="newGame">New Game</button>
          <button class="button is-link is-outlined" @click="loadGame">Load Game</button>
        </div>

        <!-- Add player form -->
        <PlayerSelect v-if="activePane === 'playerSelect'" />
      </div>
    </div>
  </section>
</template>

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
