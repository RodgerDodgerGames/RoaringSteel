<!--
  MapModeHint.vue

  A banner floating at the top of the map that says which mode the map is in
  while it is not simply being looked at — drawing track, removing it, or
  choosing a town for the train — and how to get out of that mode.

  The controls that start these modes are in the dock at the side, but the
  player's eyes are on the map while they use them, so the instructions are
  put where they are looking. Renders nothing in the ordinary mode.

  Each banner is a help screen (see useHelpScreens.js): its "Don't show
  again" button hides it for the rest of the game, and it is not shown at
  all while help is turned off in Settings. Esc still ends the mode either
  way.

  @prop isDrawing  - True while a line of track is being drawn
  @prop isRemoving - True while removal mode is on
  @prop pickPrompt - While a town is being chosen on the map, what clicking
                     one does; empty otherwise
-->

<script setup>
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { useHelpScreens, HELP_SCREENS } from '@/composables/useHelpScreens'
import { startPlace } from '@/composables/startRule'

const props = defineProps({
  isDrawing: {
    type: Boolean,
    default: false
  },
  isRemoving: {
    type: Boolean,
    default: false
  },
  pickPrompt: {
    type: String,
    default: ''
  }
})

const gameStore = useGameStore()
const { isShown, dismiss } = useHelpScreens()

/**
 * The banner for the current mode — its help screen's name and wording — or
 * null when there is no mode to explain. Only one mode is ever on — each
 * switches the others off as it starts.
 */
const modeHint = computed(() => {
  if (props.isDrawing) {
    const where = startPlace(gameStore.gameSettings.requireMajorCityStart)
    return {
      name: HELP_SCREENS.building,
      title: 'Building track',
      body: `Start in ${where} or on your own track. Click a town or double-click to finish.`
    }
  }
  if (props.pickPrompt) {
    return { name: HELP_SCREENS.choosingTown, title: 'Choosing a stop', body: props.pickPrompt }
  }
  if (props.isRemoving) {
    return {
      name: HELP_SCREENS.removing,
      title: 'Removing track',
      body: 'Click a section you built this turn to tear it up and get your money back.'
    }
  }
  return null
})

/** The banner to show: the mode's, unless its help screen is hidden */
const hint = computed(() =>
  modeHint.value && isShown(modeHint.value.name) ? modeHint.value : null
)
</script>

<template>
  <!-- role="status" so screen readers announce the change of mode -->
  <div v-if="hint" class="map-mode-hint" role="status">
    <strong class="map-mode-hint__title">{{ hint.title }}</strong>
    <span>{{ hint.body }}</span>
    <kbd class="map-mode-hint__key">Esc</kbd>
    <span class="map-mode-hint__key-label">to stop</span>
    <button type="button" class="map-mode-hint__dismiss" @click="dismiss(hint.name)">
      Don't show again
    </button>
  </div>
</template>

<style scoped>
.map-mode-hint {
  /* Centred over the top of the map, above Leaflet's panes and controls */
  position: absolute;
  top: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: 0.25rem 0.5rem;
  max-width: calc(100% - 7rem);
  padding: 0.5rem 1rem;
  border-radius: var(--bulma-radius-large);
  background: var(--bulma-primary);
  color: var(--bulma-primary-invert);
  box-shadow: var(--bulma-shadow);
  font-size: 0.9rem;
  /* Information only: clicks pass straight through to the map beneath, so the
     banner never blocks a town or track end the player is aiming for. Only
     its "Don't show again" button takes clicks. (The banner sits beside the
     map, not inside it, so a click on the button never reaches the map.) */
  pointer-events: none;
}

.map-mode-hint__title {
  color: inherit;
}

.map-mode-hint__key {
  padding: 0 0.35rem;
  border: 1px solid currentColor;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 0.75rem;
}

.map-mode-hint__key-label {
  opacity: 0.85;
}

/* The one part of the banner that takes clicks: a small text button set
   apart from the instructions */
.map-mode-hint__dismiss {
  pointer-events: auto;
  margin-left: 0.5rem;
  padding: 0 0.4rem;
  border: 1px solid currentColor;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-family: var(--font-label);
  font-size: 0.75rem;
  cursor: pointer;
  opacity: 0.85;
}

.map-mode-hint__dismiss:hover {
  opacity: 1;
}
</style>
