<!--
  GameSettings.vue

  The game settings, as form fields: choices that change how a game is
  played (see GAME_SETTINGS in the settings store). Used on the Confirm Setup
  screen and on the Settings dialog's Game tab.

  Before a game starts they are the choices for the next game, and can be
  changed. Once it has started they are the settings it is played by, fixed
  until it ends: they are shown, but every field is disabled.

  It edits the object it is bound to with v-model, in place (see
  DisplaySettings.vue for why).

  @model - The settings being shown or edited
  @prop locked - True to show the settings without letting them change
-->

<script setup>
/** The settings, edited in place */
const settings = defineModel({ type: Object, required: true })

defineProps({
  locked: {
    type: Boolean,
    default: false
  }
})
</script>

<template>
  <p v-if="locked" class="notification is-light p-3 is-size-7">
    These were chosen when the game started, and stay the same until it ends.
  </p>

  <div class="field">
    <div class="control">
      <label class="checkbox">
        <input v-model="settings.requireMajorCityStart" type="checkbox" :disabled="locked" />
        Require track network to start in Major City
      </label>
    </div>
    <p class="help">
      Off, a player's track may start in any town. On, every network grows out of a major city, as
      in Empire Builder.
    </p>
  </div>
</template>
