<!--
  GameView.vue

  The main game screen, laid out like a game table filling the browser window:

  ┌──────────────────────────────────────────────┐
  │ top bar: title · round · every player · menu │
  ├───────────────────────────────┬──────────────┤
  │                               │ player dock: │
  │ map (the board) — takes all   │ who & cash,  │
  │ space the other panels leave  │ train, this  │
  │                               │ turn's steps,│
  ├───────────────────────────────┤ End Turn     │
  │ demand cards (collapsible)    │              │
  └───────────────────────────────┴──────────────┘

  On a desktop-sized window the page itself never scrolls; anything that can
  grow (the dock's contents) scrolls inside its own panel. Narrower windows
  fall back to a single stacked column that scrolls as a page.

  This view also owns track building. The build composable draws and removes
  the track layers on the map, so it has to live exactly as long as the map
  does, and this view is the map's parent. It is created here and handed to
  the dock's build controls through provide/inject.
-->

<script setup>
import { provide, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'

import GameTopBar from '@/components/GameTopBar.vue'
import MainMap from '@/components/map/MainMap.vue'
import MapModeHint from '@/components/map/MapModeHint.vue'
import PlayerDock from '@/components/panel/PlayerDock.vue'
import DemandStrip from '@/components/demands/DemandStrip.vue'

import { useGridStore } from '@/stores/grid'
import useBuildTrack, { buildTrackKey } from '@/composables/map/useBuildTrack'
import { formatCurrency } from '@/composables/utils'

// The cost grid prices every section of track as it is drawn
const { grid } = storeToRefs(useGridStore())

// One build-track instance for the whole game. Its onMounted runs after
// MainMap's (a parent mounts after its children), so the map and towns are in
// the store by the time it reads them.
const buildTrack = useBuildTrack(grid, formatCurrency)
provide(buildTrackKey, buildTrack)

// Destructured so the template unwraps them; refs nested inside a plain
// object are not unwrapped automatically
const { isDrawingActive, isRemoving } = buildTrack

// Bulma always reserves a vertical scrollbar on <html>. The game screen is
// sized to the window, so that bar would only ever be an empty gutter; this
// class lets the stylesheet below switch it off for as long as the game is up.
const PAGE_CLASS = 'is-game-view'
onMounted(() => document.documentElement.classList.add(PAGE_CLASS))
onBeforeUnmount(() => document.documentElement.classList.remove(PAGE_CLASS))
</script>

<template>
  <div class="game-view">
    <!-- Wrapped because the top bar renders its dialogs alongside the bar, and
         a class passed to a component with several root elements is dropped -->
    <div class="game-view__top">
      <GameTopBar />
    </div>

    <main class="game-view__board">
      <div class="game-view__map">
        <MainMap />
        <!-- Says which mode the map is in while drawing or removing track -->
        <MapModeHint :is-drawing="isDrawingActive" :is-removing="isRemoving" />
      </div>
      <DemandStrip />
    </main>

    <PlayerDock class="game-view__dock" />
  </div>
</template>

<style>
/*
  Unscoped on purpose: <html> is outside this component. Only applied at the
  desktop sizes where the game fits the window; the stacked narrow layout
  needs the page to scroll.
*/
@media (min-width: 1024px) {
  html.is-game-view {
    overflow: hidden;
  }
}
</style>

<style scoped>
/*
  Desktop: a two-row, two-column grid filling the window exactly. `dvh`
  rather than `vh` so mobile browser toolbars do not push the bottom off
  screen; `vh` is the fallback for browsers without it.
*/
.game-view {
  --dock-width: 340px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--dock-width);
  grid-template-rows: auto minmax(0, 1fr);
  grid-template-areas:
    'top top'
    'board dock';
  height: 100vh;
  height: 100dvh;
  background: var(--bulma-scheme-main);
}

.game-view__top {
  grid-area: top;
}

/* The map above the demand strip; the map gets whatever the strip leaves */
.game-view__board {
  grid-area: board;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* Positioning context for the mode hint floating over the map */
.game-view__map {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}

.game-view__dock {
  grid-area: dock;
  min-height: 0;
}

/*
  Narrow windows: one column — map, cards, then the dock — scrolling as a
  normal page. The map keeps a fixed share of the screen so it never
  collapses to nothing.
*/
@media (max-width: 1023px) {
  .game-view {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto auto;
    grid-template-areas:
      'top'
      'board'
      'dock';
    height: auto;
  }

  .game-view__map {
    height: 60vh;
    flex: none;
  }
}
</style>
