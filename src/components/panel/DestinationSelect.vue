<!--
  DestinationSelect.vue

  The "Run to…" list of the move step: a dropdown of towns, each marked with
  a colored dot for every other player whose track the way there runs on.

  A browser's own <select> cannot color its options reliably (macOS mostly
  ignores it), so this is a button that opens a list of its own. The list
  opens in the dock's flow, pushing what is below it down, rather than
  floating over it: the dock scrolls, and a floating menu would be clipped.

  Keyboard: the button opens the list on Enter, Space or the down arrow; the
  arrows move between towns, Enter or Space picks one, and Escape or Tab
  closes it.
-->

<script setup>
import { ref, computed, nextTick, onBeforeUpdate } from 'vue'
import { onClickOutside } from '@vueuse/core'

const props = defineProps({
  /**
   * The towns to choose from, in order: each { id, label, owners }, where
   * `owners` is [{ id, name, color }] for the other players whose track the
   * way there uses
   */
  options: { type: Array, required: true },
  /** The id of the town chosen, or '' for none */
  modelValue: { type: String, default: '' },
  /** What the button says while no town is chosen */
  placeholder: { type: String, default: 'Choose…' },
  /** Names the list for screen readers */
  ariaLabel: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue'])

const isOpen = ref(false)
const rootRef = ref(null)
const triggerRef = ref(null)
const optionRefs = ref([])

// Filled afresh on each render, so a shorter list leaves no stale entries
onBeforeUpdate(() => {
  optionRefs.value = []
})

/** The option shown on the button: the one chosen, if any */
const chosen = computed(() => props.options.find((option) => option.id === props.modelValue))

// A click anywhere else closes the list, as a <select> does
onClickOutside(rootRef, () => {
  isOpen.value = false
})

/**
 * Opens the list with the chosen town (or the first) focused, so the arrow
 * keys carry on from there.
 */
async function open() {
  if (!props.options.length) return
  isOpen.value = true
  await nextTick()
  const index = Math.max(
    0,
    props.options.findIndex((option) => option.id === props.modelValue)
  )
  optionRefs.value[index]?.focus()
}

/**
 * Closes the list.
 * @param {boolean} [refocus] - Whether to put focus back on the button, as
 *   after a pick or Escape (not after Tab, which is moving on)
 */
function close(refocus = false) {
  isOpen.value = false
  if (refocus) triggerRef.value?.focus()
}

/** @param {string} id - The town picked */
function pick(id) {
  emit('update:modelValue', id)
  close(true)
}

/**
 * Moves focus up or down the list, stopping at either end.
 * @param {number} index - The option that has focus
 * @param {number} step - -1 for up, 1 for down
 */
function moveFocus(index, step) {
  const next = Math.min(props.options.length - 1, Math.max(0, index + step))
  optionRefs.value[next]?.focus()
}
</script>

<template>
  <div ref="rootRef" class="destination-select">
    <button
      ref="triggerRef"
      type="button"
      class="button is-small is-fullwidth destination-select__trigger"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      :disabled="!options.length"
      @click="isOpen ? close() : open()"
      @keydown.down.prevent="open"
    >
      <span class="destination-select__text">
        <!-- Read out before the town chosen, which is the button's own text -->
        <span v-if="ariaLabel" class="is-sr-only">{{ ariaLabel }}: </span>
        <template v-if="chosen">
          <span>{{ chosen.label }}</span>
          <span
            v-for="owner in chosen.owners"
            :key="owner.id"
            class="destination-select__dot"
            :style="{ color: owner.color }"
            :title="`Runs on ${owner.name}'s track`"
            aria-hidden="true"
            >●</span
          >
        </template>
        <span v-else class="destination-select__placeholder">{{ placeholder }}</span>
      </span>
      <span class="icon is-small"><i class="fas fa-angle-down" aria-hidden="true"></i></span>
    </button>

    <div
      v-if="isOpen"
      class="destination-select__list"
      role="listbox"
      :aria-label="ariaLabel || undefined"
      @keydown.esc.stop="close(true)"
    >
      <button
        v-for="(option, index) in options"
        :key="option.id"
        :ref="(el) => (optionRefs[index] = el)"
        type="button"
        role="option"
        class="destination-select__option"
        :class="{ 'is-active': option.id === modelValue }"
        :aria-selected="option.id === modelValue"
        @click="pick(option.id)"
        @keydown.down.prevent="moveFocus(index, 1)"
        @keydown.up.prevent="moveFocus(index, -1)"
        @keydown.tab="close()"
      >
        <span>{{ option.label }}</span>
        <span
          v-for="owner in option.owners"
          :key="owner.id"
          class="destination-select__dot"
          :style="{ color: owner.color }"
          :title="`Runs on ${owner.name}'s track`"
          aria-hidden="true"
          >●</span
        >
        <span v-if="option.owners.length" class="is-sr-only">
          Runs on {{ option.owners.map((owner) => owner.name).join(' and ') }}'s track
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.destination-select__trigger {
  justify-content: space-between;
  /* Long town names wrap rather than widening the dock */
  height: auto;
  white-space: normal;
  text-align: left;
}

/* The dots run on after the text like a word (see the dot below) */
.destination-select__text {
  display: inline;
}

.destination-select__placeholder {
  color: var(--bulma-text-weak);
}

.destination-select__list {
  max-height: 16rem;
  margin-top: 0.25rem;
  overflow-y: auto;
  border: 1px solid var(--bulma-border);
  border-radius: var(--bulma-radius);
  background: var(--bulma-scheme-main);
}

.destination-select__option {
  display: block;
  width: 100%;
  padding: 0.3rem 0.6rem;
  border: 0;
  background: none;
  color: var(--bulma-text);
  font: inherit;
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
}

.destination-select__option:hover,
.destination-select__option:focus-visible {
  background: var(--bulma-scheme-main-ter);
  outline: none;
}

.destination-select__option.is-active {
  font-weight: 700;
}

/* One per other player whose track the way uses, in their color. A text
   glyph, not a drawn circle: an inline box may wrap onto a line of its own,
   where a character stays with the word before it. */
.destination-select__dot {
  margin-left: 0.25rem;
}
</style>
