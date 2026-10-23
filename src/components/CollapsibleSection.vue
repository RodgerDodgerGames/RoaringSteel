<!--
  CollapsibleSection.vue

  A titled section of the game screen that the player can fold down to its
  header line, to make room for everything else. Used for the sections of the
  player dock and for the demand-card strip under the map.

  Whether each section is folded is remembered in the browser, so a player who
  folds away something they never read does not have to fold it again every
  visit. It is a per-browser convenience, not game state, so it is not part of
  a saved game.

  The section draws no border of its own; whatever places it decides where the
  dividing lines go.

  @prop title      - Heading shown in the section's header
  @prop storageKey - Unique key the folded state is remembered under
  @prop badge      - Optional short note beside the title (e.g. "Not built yet")

  @slot default - The section's content
  @slot actions - Optional controls shown at the right of the header, e.g.
                  buttons that pick what the section shows. Kept outside the
                  fold toggle, because a button may not sit inside another.
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
const isCollapsed = useStorage(`roaringsteel_${props.storageKey}_collapsed`, false)
</script>

<template>
  <section class="collapsible-section">
    <div class="collapsible-section__header">
      <!-- The rest of the header row is the toggle, so it is an easy target -->
      <button
        class="collapsible-section__toggle"
        :aria-expanded="!isCollapsed"
        @click="isCollapsed = !isCollapsed"
      >
        <span class="caps-label is-size-7">{{ title }}</span>
        <span v-if="badge" class="tag is-rounded">{{ badge }}</span>
        <span class="icon collapsible-section__chevron" aria-hidden="true">
          <i class="fas" :class="isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'"></i>
        </span>
      </button>

      <div v-if="$slots.actions" class="collapsible-section__actions">
        <slot name="actions" />
      </div>
    </div>

    <div v-show="!isCollapsed" class="collapsible-section__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
/* The fold toggle, with any actions beside it on the right */
.collapsible-section__header {
  display: flex;
  align-items: center;
}

/* A plain header row that happens to be a button */
.collapsible-section__toggle {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  padding: 0.5rem 1rem;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.collapsible-section__toggle:hover {
  background: var(--bulma-scheme-main-ter);
}

.collapsible-section__chevron {
  margin-left: auto;
  color: var(--bulma-text-weak);
}

.collapsible-section__actions {
  flex: none;
  padding-right: 1rem;
}

.collapsible-section__body {
  padding: 0 1rem 0.85rem;
}
</style>
