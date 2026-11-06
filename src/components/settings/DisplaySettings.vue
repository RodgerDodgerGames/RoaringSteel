<!--
  DisplaySettings.vue

  The display settings, as form fields: how the game looks and what it shows,
  none of which changes how it is played. Used by the Settings dialog.

  It edits the draft it is bound to with v-model (see useSettingsDraft.js),
  never the saved settings: the dialog decides when the draft is saved. The
  fields change the draft object's own properties, in place, rather than
  handing back a new object, so the dialog's draft is always the one
  edited.

  @model - The settings being edited, changed in place
-->

<script setup>
import { SETTING_RANGES } from '@/stores/settings'

/** The draft settings, edited in place */
const draft = defineModel({ type: Object, required: true })

/** Every pin limit the player can choose, smallest first */
const { min, max } = SETTING_RANGES.pinLimit
const pinLimits = Array.from({ length: max - min + 1 }, (_, i) => min + i)

/** The theme choices, in the order the buttons show them */
const themes = [
  { value: 'system', label: 'System', icon: 'fa-desktop' },
  { value: 'light', label: 'Light', icon: 'fa-sun' },
  { value: 'dark', label: 'Dark', icon: 'fa-moon' }
]
</script>

<template>
  <div class="field">
    <label class="label is-small" id="theme-label">Theme</label>
    <div class="buttons has-addons" role="radiogroup" aria-labelledby="theme-label">
      <button
        v-for="theme in themes"
        :key="theme.value"
        type="button"
        class="button is-small"
        :class="{ 'is-link is-selected': draft.theme === theme.value }"
        role="radio"
        :aria-checked="draft.theme === theme.value"
        @click="draft.theme = theme.value"
      >
        <span class="icon"><i class="fas" :class="theme.icon" aria-hidden="true"></i></span>
        <span>{{ theme.label }}</span>
      </button>
    </div>
    <p class="help">System follows your computer's light or dark setting.</p>
  </div>

  <div class="field">
    <div class="control">
      <label class="checkbox">
        <input v-model="draft.showDeckCount" type="checkbox" />
        Show how many demand cards are left in the deck
      </label>
    </div>
    <p class="help">The count appears in the header of the demand card strip.</p>
  </div>

  <div class="field">
    <label class="label is-small" for="pin-limit">Pinned demand lines</label>
    <div class="control">
      <div class="select is-small">
        <select id="pin-limit" v-model.number="draft.pinLimit">
          <option v-for="count in pinLimits" :key="count" :value="count">{{ count }}</option>
        </select>
      </div>
    </div>
    <p class="help">
      How many demand lines you can pin to the map at once, each in its own color. Pinning one more
      drops the oldest.
    </p>
  </div>
</template>
