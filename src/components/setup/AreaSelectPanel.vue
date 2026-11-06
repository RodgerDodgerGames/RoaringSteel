<!--
  AreaSelectPanel.vue
  Control panel for the area selection screen, above the map:
  - buttons for the ways of choosing a board — single states, or a grouping
    of regions — which change what the map offers;
  - the board chosen, and how many states it covers;
  - a Settings button, an About button, and "Play Game", which is disabled
    until a board is chosen.

  @prop region - The board chosen (GeoJSON feature), or null
  @prop groupings - The ways of choosing a board: [{id, label}]
  @model grouping - The id of the way being shown
  @emits play-game - Triggered when user clicks Play Game button
-->
<template>
  <div class="area-select-panel">
    <div class="level mb-3">
      <div class="level-left">
        <h2 class="title is-4 mb-0">Where would you like to play?</h2>
      </div>
      <div class="level-right">
        <div class="buttons">
          <SettingsButton />
          <AboutButton />
          <button class="button is-primary" :disabled="!region" @click="emit('play-game')">
            Play Game
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
import SettingsButton from '@/components/SettingsButton.vue'
import AboutButton from '@/components/AboutButton.vue'
import { boardStates } from '@/composables/setup/boards'

const props = defineProps({
  region: { type: Object, default: null },
  groupings: { type: Array, required: true }
})

/** The way of choosing being shown on the map */
const grouping = defineModel('grouping', { type: String, required: true })

const emit = defineEmits(['play-game'])

/** What the panel says about the board chosen */
const chosen = computed(() => {
  if (!props.region) return 'Click a state or region on the map'
  const count = boardStates(props.region).length
  const states = count > 1 ? ` (${count} states)` : ''
  return `Board: ${props.region.properties.NAME}${states}`
})
</script>

<style scoped>
.area-select-panel__choices {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}
</style>
