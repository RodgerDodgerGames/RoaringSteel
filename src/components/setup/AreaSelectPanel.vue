<!--
  AreaSelectPanel.vue
  Control panel for the area selection screen, above the map:
  - buttons for the ways of choosing a board — a grouping of regions, or
    single states — which change what the map offers;
  - the board chosen, and how many states it covers;
  - "Back", to the players; an About button; and "Continue", to the Confirm
    Setup page, which is disabled until a board is chosen. There is no
    Settings button: the settings are on the Confirm Setup page, next.

  @prop region - The board chosen (GeoJSON feature), or null
  @prop groupings - The ways of choosing a board: [{id, label}]
  @model grouping - The id of the way being shown
  @emits back - The player wants to go back to the players
  @emits continue - The player has chosen their board
-->
<template>
  <div class="area-select-panel">
    <div class="level mb-3">
      <div class="level-left">
        <h2 class="title is-4 mb-0">Where would you like to play?</h2>
      </div>
      <div class="level-right">
        <div class="buttons">
          <button class="button is-warning is-light" @click="emit('back')">Back</button>
          <AboutButton />
          <button class="button is-primary" :disabled="!region" @click="emit('continue')">
            Continue
          </button>
        </div>
      </div>
    </div>

    <div class="area-select-panel__choices">
      <div class="buttons has-addons mb-0" role="radiogroup" aria-label="Choose a board by">
        <button
          v-for="option in groupings"
          :key="option.id"
          type="button"
          class="button is-small"
          :class="{ 'is-link is-selected': grouping === option.id }"
          role="radio"
          :aria-checked="grouping === option.id"
          @click="grouping = option.id"
        >
          {{ option.label }}
        </button>
      </div>
      <p :class="region ? 'has-text-weight-bold' : 'has-text-grey'">{{ chosen }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import AboutButton from '@/components/AboutButton.vue'
import { boardLabel } from '@/composables/setup/boards'

const props = defineProps({
  region: { type: Object, default: null },
  groupings: { type: Array, required: true }
})

/** The way of choosing being shown on the map */
const grouping = defineModel('grouping', { type: String, required: true })

const emit = defineEmits(['back', 'continue'])

/** What the panel says about the board chosen, or how to choose one */
const chosen = computed(() => boardLabel(props.region) ?? 'Click a state or region on the map')
</script>

<style scoped>
.area-select-panel__choices {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}
</style>
