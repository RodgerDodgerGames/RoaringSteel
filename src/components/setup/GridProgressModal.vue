<!--
  GridProgressModal.vue

  Modal overlay shown during grid generation.

  While the fetch is running it reports the current phase and a progress bar.
  The bar fills as a percentage of the step running: the industries fetched
  or the towns placed (see the towns store's setupPercent), then the terrain
  downloads (the grid store's progressPercent). Each counted step starts the
  bar again from 0. A step with nothing to count shows the bar sliding, with
  no percentage.
  If setup fails — the towns or the grid — it swaps to that store's error
  message with a retry, so a failed setup explains itself instead of leaving a
  stalled bar on screen.

  @prop isActive - Controls modal visibility
  @emits retry   - Player asked to run grid generation again
  @emits cancel  - Player gave up and wants to go back
-->

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useGridStore } from '@/stores/grid'
import { useTownsStore } from '@/stores/towns'

defineProps({
  isActive: {
    type: Boolean,
    default: false
  }
})

defineEmits(['retry', 'cancel'])

const gridStore = useGridStore()
const { currentPhase, progressPercent } = storeToRefs(gridStore)
const {
  error: townsError,
  setupMessage: townsMessage,
  setupPercent: townsPercent
} = storeToRefs(useTownsStore())

// Towns are set up first, so at most one of the two has failed
const error = computed(() => townsError.value || gridStore.error)

const phaseLabel = computed(() => {
  switch (currentPhase.value) {
    case 'initializing':
      return 'Initializing grid…'
    case 'elevation':
      return 'Fetching elevation data…'
    case 'landcover':
      return 'Fetching land cover data…'
    case 'calculating':
      return 'Calculating terrain costs…'
    default:
      // What the town setup is doing; between steps, a general word
      return townsMessage.value || 'Preparing game…'
  }
})

/**
 * How full the bar is: the grid's percentage once it has a phase, the town
 * setup's before that. Null while the step has nothing to count — the
 * grid's 'initializing' among them, which works out the downloads before
 * there is anything to count them against.
 */
const percent = computed(() => {
  if (currentPhase.value === 'initializing') return null
  return currentPhase.value ? progressPercent.value : townsPercent.value
})

// A step with nothing to count (looking up the data window, a cached fetch,
// assigning industries, setting up the grid) runs the bar indeterminate
// rather than sitting at a misleading 0%
const isIndeterminate = computed(() => percent.value === null)
</script>

<template>
  <div class="modal" :class="{ 'is-active': isActive }">
    <div class="modal-background"></div>
    <div class="modal-content">
      <div v-if="error" class="box has-text-centered">
        <h2 class="title is-4">Setup Failed</h2>
        <p class="subtitle is-6 mb-4">{{ error }}</p>

        <div class="buttons is-centered">
          <button class="button is-primary" @click="$emit('retry')">Try Again</button>
          <button class="button is-light" @click="$emit('cancel')">Back</button>
        </div>
      </div>

      <div v-else class="box has-text-centered">
        <h2 class="title is-4">Setting Up Game</h2>
        <p class="subtitle is-6 mb-4">{{ phaseLabel }}</p>

        <progress
          class="progress is-warning is-medium"
          :value="isIndeterminate ? undefined : percent"
          max="100"
        >
          <template v-if="!isIndeterminate">{{ percent }}%</template>
        </progress>

        <p v-if="!isIndeterminate" class="has-text-grey">{{ percent }}% complete</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-content {
  max-width: 400px;
}

.box {
  padding: 2rem;
}

.progress {
  margin-bottom: 1rem;
}
</style>
