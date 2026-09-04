<!--
  GridProgressModal.vue

  Modal overlay shown during grid generation.

  While the fetch is running it reports the current phase and a progress bar.
  If generation fails it swaps to the store's error message with a retry, so a
  failed setup explains itself instead of leaving a stalled bar on screen.

  @prop isActive - Controls modal visibility
  @emits retry   - Player asked to run grid generation again
  @emits cancel  - Player gave up and wants to go back
-->

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useGridStore } from '@/stores/grid'

defineProps({
  isActive: {
    type: Boolean,
    default: false
  }
})

defineEmits(['retry', 'cancel'])

const gridStore = useGridStore()
const { currentPhase, progressPercent, elevationProgress, landCoverProgress, error } =
  storeToRefs(gridStore)

const phaseLabel = computed(() => {
  switch (currentPhase.value) {
    case 'initializing':
      return 'Initializing grid...'
    case 'elevation':
      return 'Fetching elevation data...'
    case 'landcover':
      return 'Fetching land cover data...'
    case 'calculating':
      return 'Calculating terrain costs...'
    default:
      return 'Preparing game...'
  }
})

const progressDetail = computed(() => {
  if (currentPhase.value === 'elevation') {
    return `${elevationProgress.value.completed} / ${elevationProgress.value.total} cells`
  }
  if (currentPhase.value === 'landcover') {
    return `${landCoverProgress.value.completed} / ${landCoverProgress.value.total} cells`
  }
  return ''
})
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

        <progress class="progress is-primary is-medium" :value="progressPercent" max="100">
          {{ progressPercent }}%
        </progress>

        <p class="has-text-grey">{{ progressPercent }}% complete</p>
        <p v-if="progressDetail" class="has-text-grey-light is-size-7">{{ progressDetail }}</p>
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
