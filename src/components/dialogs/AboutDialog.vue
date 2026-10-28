<!--
  AboutDialog.vue

  What the game is, which version this is, where its code lives, and the
  credits for everything it is built on (see config/credits.js). Opens from
  the About button on the New Game steps (AboutButton), from the Game menu
  during play, and from the Credits link on each map.

  The maps carry no credit line of their own: their credits are here.

  @emits close - Emitted when the player clicks Close, the X, or the background
-->

<script setup>
import { version } from '../../../package.json'
import { BOARD_GAME_URL, CENSUS_NOTICE, CREDIT_GROUPS, REPOSITORY_URL } from '@/config/credits'

const emit = defineEmits(['close'])
</script>

<template>
  <div class="modal is-active">
    <div class="modal-background" @click="emit('close')"></div>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="about-title">
      <header class="modal-card-head">
        <p id="about-title" class="modal-card-title">About Roaring Steel</p>
        <button class="delete" aria-label="close" @click="emit('close')"></button>
      </header>

      <section class="modal-card-body">
        <p>
          A browser version of the railroad board game
          <a :href="BOARD_GAME_URL" target="_blank" rel="noopener">Empire Builder</a>, played on
          real American terrain.
        </p>
        <p class="is-size-7 has-text-grey mt-2">
          Version {{ version }} ·
          <a :href="REPOSITORY_URL" target="_blank" rel="noopener">Source code on GitHub</a>
        </p>

        <div v-for="group in CREDIT_GROUPS" :key="group.title" class="mt-5">
          <h3 class="title is-6 mb-2">{{ group.title }}</h3>
          <ul>
            <li v-for="credit in group.credits" :key="credit.name" class="mb-1">
              <a :href="credit.url" target="_blank" rel="noopener">{{ credit.name }}</a>
              <span class="has-text-grey"> — {{ credit.note }}</span>
            </li>
          </ul>
        </div>

        <p class="is-size-7 has-text-grey mt-5">{{ CENSUS_NOTICE }}</p>
      </section>

      <footer class="modal-card-foot">
        <button class="button" @click="emit('close')">Close</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.modal-card {
  max-width: 600px;
  width: 90vw;
}
</style>
