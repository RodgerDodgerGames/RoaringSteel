<!--
  GridProgressModal.vue

  Modal overlay shown during grid generation.

  While the fetch is running it reports the current phase and a progress bar.
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
import { useTownsStore, SETUP_STEPS } from '@/stores/towns'
import { useIndustryStore } from '@/stores/industry'

defineProps({
  isActive: {
    type: Boolean,
    default: false
  }
})

defineEmits(['retry', 'cancel'])

const gridStore = useGridStore()
const { currentPhase, progressPercent, elevationProgress, landCoverProgress } =
  storeToRefs(gridStore)
const {
  error: townsError,
  setupStep: townsStep,
  setupMessage: townsMessage
} = storeToRefs(useTownsStore())
const { progress: industryProgress } = storeToRefs(useIndustryStore())

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
      return townsStepLabel.value
  }
})

/**
 * What the town setup is doing, before the grid starts: the towns store's
 * message, with a count of the industries while the jobs data comes in (the
 * industry store counts them; none are counted when they come from the
 * cache). Between steps, a general word.
 */
const townsStepLabel = computed(() => {
  const message = townsMessage.value
  if (!message) return 'Preparing game…'
  const { done, total } = industryProgress.value
  if (townsStep.value === SETUP_STEPS.industry && total > 0) {
    return `Fetching jobs by industry (${done} of ${total})…`
  }
  return message
})

// Town and demand card setup runs before the grid store reports any phase.
// There is no download count to show yet, so the bar runs indeterminate
// rather than sitting at a misleading 0%.
const isIndeterminate = computed(() => currentPhase.value === '')

// Terrain comes down as images: elevation as map tiles, land cover as larger
// pictures of the land cover map
const progressDetail = computed(() => {
  if (currentPhase.value === 'elevation') {
    return `${elevationProgress.value.completed} / ${elevationProgress.value.total} tiles`
  }
  if (currentPhase.value === 'landcover') {
    return `${landCoverProgress.value.completed} / ${landCoverProgress.value.total} images`
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

        <progress
          class="progress is-warning is-medium"
          :value="isIndeterminate ? undefined : progressPercent"
          max="100"
        >
          {{ progressPercent }}%
        </progress>

        <p v-if="!isIndeterminate" class="has-text-grey">{{ progressPercent }}% complete</p>
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
