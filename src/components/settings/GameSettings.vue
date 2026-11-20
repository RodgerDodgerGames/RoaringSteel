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
import { builderLimitRows } from '@/composables/townLimits'

/** The limits on building into towns, for the table under that setting */
const limitRows = builderLimitRows()

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

  <div class="field">
    <div class="control">
      <label class="checkbox">
        <input v-model="settings.limitTownBuilders" type="checkbox" :disabled="locked" />
        Limit how many players may build into a town
      </label>
    </div>
    <p class="help">
      On, once a town has as many players' track in it as the table allows, no one else may build
      into it. Major cities take everyone. Off, any player may build into any town.
    </p>
    <table class="table is-narrow is-size-7 mt-2">
      <thead>
        <tr>
          <th>Players</th>
          <th v-for="row in limitRows" :key="row.label">{{ row.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th>Small town</th>
          <td v-for="row in limitRows" :key="row.label">{{ row.small }}</td>
        </tr>
        <tr>
          <th>Medium town</th>
          <td v-for="row in limitRows" :key="row.label">{{ row.medium }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
