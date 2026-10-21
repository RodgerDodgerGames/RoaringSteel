<!--
  DockSection.vue

  One titled section of the player dock, which the player can collapse to a
  single header line to make room for the others.

  Whether each section is collapsed is remembered in the browser, so a player
  who folds away a section they never read does not have to fold it again
  every visit. It is a per-browser convenience, not game state, so it is not
  part of a saved game.

  @prop title      - Heading shown in the section's header
  @prop storageKey - Unique key the collapsed state is remembered under
  @prop badge      - Optional short note beside the title (e.g. "Not built yet")

  @slot default - The section's content
-->

<script setup>
import { useStorage } from '@vueuse/core'

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  storageKey: {
    type: String,
    required: true
  },
  badge: {
    type: String,
    default: ''
  }
})

// Remembered per browser. useStorage falls back to plain in-memory state when
// storage is unavailable (private windows, blocked site data).
const isCollapsed = useStorage(`roaringsteel_dock_${props.storageKey}_collapsed`, false)
</script>

<template>
  <section class="dock-section">
    <!-- The whole header row is the toggle, so it is an easy target -->
    <button
      class="dock-section__toggle"
      :aria-expanded="!isCollapsed"
      @click="isCollapsed = !isCollapsed"
    >
      <span class="dock-section__title">{{ title }}</span>
      <span v-if="badge" class="tag is-rounded">{{ badge }}</span>
      <span class="icon dock-section__chevron" aria-hidden="true">
        <i class="fas" :class="isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'"></i>
      </span>
    </button>

    <div v-show="!isCollapsed" class="dock-section__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.dock-section {
  border-bottom: 1px solid var(--bulma-border-weak);
}

/* A plain header row that happens to be a button */
.dock-section__toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.6rem 1rem;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.dock-section__toggle:hover {
  background: var(--bulma-scheme-main-ter);
}

.dock-section__title {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--bulma-text-weak);
}

.dock-section__chevron {
  margin-left: auto;
  color: var(--bulma-text-weak);
}

.dock-section__body {
  padding: 0 1rem 0.9rem;
}
</style>
