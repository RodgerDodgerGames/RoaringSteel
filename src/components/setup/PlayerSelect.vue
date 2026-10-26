<!--
  PlayerSelect.vue

  Player setup form allowing users to add players with unique names and
  colors, and to ask for computer players. Blank rows are dropped when the
  user is done; the names that remain must be unique before progression is
  allowed. A game needs at least one player, person or computer — a game of
  computer players only can be watched.

  The roster is held in the player store as draft players, so it survives
  leaving and returning to this screen. Only the open color picker is local.

  Features:
  - Add/remove players dynamically
  - Color picker over the shared player palette. Colors another player already
    has are dimmed and can't be picked, so no two players share a color.
  - Name uniqueness validation
  - How many computer players, after the people in turn order. They are
    named and colored automatically (see `draftRoster` in the player store).
  - Notification system for validation errors
  - A Settings button, so settings can be chosen before the game starts

  @emits done - The roster, people then computer players, when validation passes
-->

<script setup>
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '@/stores/players'
import SettingsButton from '@/components/SettingsButton.vue'

const playerStore = usePlayerStore()

const notificationMessage = ref('')
const showNotification = ref(false)

/** Id of the draft whose color picker is open, or null. UI-only state. */
const openColorPickerId = ref(null)

/** The setup roster lives in the store, so it survives leaving this screen. */
const { draftPlayers: players, draftBotCount, maxDraftBots } = storeToRefs(playerStore)

/**
 * Keep at least one row on screen, so the form is never a dead end. The store
 * gives the row the first free palette color.
 */
function ensureOneRow() {
  if (players.value.length === 0) {
    playerStore.addDraftPlayer()
  }
}

// Seed the first row on a fresh setup
ensureOneRow()

// Add a new player
function addPlayer() {
  const hasEmptyName = players.value.some((player) => player.name.trim() === '')

  if (hasEmptyName) {
    notificationMessage.value = 'Please fill in all player names before adding a new player!'
    showNotification.value = true
    return
  }

  // The store gives the new row the first color nobody has. With every color
  // taken there is nothing to give it, and colors are never shared.
  if (!playerStore.addDraftPlayer()) {
    notificationMessage.value =
      'Every color is taken. Remove a player or a computer player to add another.'
    showNotification.value = true
  }
}

// Dismiss notification
const dismissNotification = () => {
  showNotification.value = false
}

// Remove a player
const removePlayer = (id) => {
  playerStore.removeDraftPlayer(id)
  if (openColorPickerId.value === id) {
    openColorPickerId.value = null
  }
}

// Toggle color picker visibility
const toggleColorPicker = (id) => {
  openColorPickerId.value = openColorPickerId.value === id ? null : id
}

/**
 * What a taken swatch says when hovered or read aloud, naming who has it.
 * @param {{holder: Object|null}} option A swatch from the store's picker options.
 * @returns {string|null} "Taken by …", or null for a color that is free.
 */
const takenLabel = (option) =>
  option.holder ? `Taken by ${option.holder.name.trim() || 'another player'}` : null

// Select a color and close the picker. The store refuses a color another row
// has, so clicking a taken (dimmed) swatch changes nothing and leaves the
// picker open.
const selectColor = (player, color) => {
  if (playerStore.updateDraftPlayer(player.id, { color })) {
    openColorPickerId.value = null
  }
}

/**
 * True while an IME composition is in flight. Writing the half-composed buffer
 * back to the store would echo it into the input and garble the name, so the
 * store is only updated once composition ends — the same thing `v-model` does.
 */
const isComposing = ref(false)

// Update a player's name
const setName = (player, name) => {
  playerStore.updateDraftPlayer(player.id, { name })
}

const onNameInput = (player, event) => {
  if (isComposing.value) return
  setName(player, event.target.value)
}

const onCompositionEnd = (player, event) => {
  isComposing.value = false
  setName(player, event.target.value)
}

/** Names are compared the way the store compares them when drafts are committed */
const normalizeName = (name) => name.trim().toLowerCase()

// Validate if all player names are unique. A blank row is not a duplicate of
// another blank row - it is a row that will be dropped when the user is done.
const isNameUnique = (id, name) => {
  const target = normalizeName(name)
  if (target === '') return true

  return players.value.every((player) => player.id === id || normalizeName(player.name) !== target)
}

/**
 * Takes a count typed into the computer players box. The store keeps it in
 * range, and the box is set back to what was kept, so typing 99 shows the
 * most there can be rather than 99.
 */
const onBotCountInput = (event) => {
  event.target.value = playerStore.setDraftBotCount(Number(event.target.value))
}

// Emit events
const emit = defineEmits(['done'])

// Handle done button - validate before proceeding
const handleDone = () => {
  // The screen is kept alive between visits, so an old warning would otherwise
  // still be sitting there
  showNotification.value = false

  // Rows left blank are rows the user decided against, so they are not what is
  // being validated. Nothing is removed until the roster is known good - a
  // failed Done must leave the form exactly as the user left it.
  const named = players.value.filter((player) => player.name.trim() !== '')

  if (named.length === 0 && draftBotCount.value === 0) {
    notificationMessage.value =
      'Enter at least one player name, or add a computer player, before proceeding!'
    showNotification.value = true
    return
  }

  // Check if all names are unique
  const hasDuplicateNames = named.some((player) => !isNameUnique(player.id, player.name))
  if (hasDuplicateNames) {
    notificationMessage.value = 'All player names must be unique!'
    showNotification.value = true
    return
  }

  // All validations passed - drop the blank rows and hand over the roster
  playerStore.pruneEmptyDraftPlayers()
  emit('done', playerStore.draftRoster)
}
</script>

<template>
  <div class="welcome-modal-container container has-background-info-dark p-5 mt-4">
    <h3 class="is-size-3 mb-2">Who is playing?</h3>

    <!-- Notification -->
    <div v-if="showNotification" class="notification is-warning">
      <button class="delete" @click="dismissNotification"></button>
      {{ notificationMessage }}
    </div>

    <!-- Player Form -->
    <div v-for="(player, index) in players" :key="player.id" class="block">
      <form @submit.prevent>
        <!-- Player Name and Color Picker Row -->
        <div class="field">
          <div class="field is-grouped is-flex is-align-items-center">
            <label class="label">Player {{ index + 1 }}</label>
            <!-- Player Name Input -->
            <div class="control is-expanded">
              <input
                :value="player.name"
                @input="onNameInput(player, $event)"
                @compositionstart="isComposing = true"
                @compositionend="onCompositionEnd(player, $event)"
                :class="['input', { 'is-danger': !isNameUnique(player.id, player.name) }]"
                type="text"
                placeholder="Enter player name"
              />
            </div>

            <!-- Pick a Color Button -->
            <div class="control">
              <button
                class="button"
                :style="{ backgroundColor: player.color, color: '#000' }"
                @click="toggleColorPicker(player.id)"
              >
                Pick a Color
              </button>
            </div>

            <!-- Remove Player Button -->
            <div v-if="players.length > 1" class="control">
              <button
                class="button is-family-sans-serif is-danger is-outlined is-rounded is-small"
                @click.prevent="removePlayer(player.id)"
              >
                X
              </button>
            </div>
          </div>
          <p v-if="!isNameUnique(player.id, player.name)" class="help is-danger">
            Player name must be unique.
          </p>
        </div>

        <!-- Color Picker Grid -->
        <div v-if="openColorPickerId === player.id" class="color-picker-grid">
          <div
            v-for="option in playerStore.draftColorOptions(player.id)"
            :key="option.color"
            :class="['color-box', { 'is-selected': option.isSelected, 'is-taken': option.holder }]"
            :style="{ backgroundColor: option.color }"
            @click="selectColor(player, option.color)"
            role="button"
            :aria-label="takenLabel(option) ?? 'Select this color'"
            :aria-disabled="Boolean(option.holder)"
            :title="takenLabel(option) ?? ''"
            tabindex="0"
          ></div>
        </div>
      </form>
    </div>

    <!-- Computer players -->
    <div class="field is-grouped is-align-items-center is-justify-content-center bot-count">
      <label class="label mb-0 mr-3" for="bot-count">
        <span class="icon"><i class="fas fa-robot" aria-hidden="true"></i></span>
        Computer players
      </label>
      <div class="field has-addons mb-0">
        <p class="control">
          <button
            class="button"
            aria-label="One fewer computer player"
            :disabled="draftBotCount === 0"
            @click="playerStore.setDraftBotCount(draftBotCount - 1)"
          >
            −
          </button>
        </p>
        <p class="control">
          <input
            id="bot-count"
            class="input has-text-centered bot-count__input"
            type="number"
            min="0"
            :max="maxDraftBots"
            :value="draftBotCount"
            @change="onBotCountInput"
          />
        </p>
        <p class="control">
          <button
            class="button"
            aria-label="One more computer player"
            :disabled="draftBotCount >= maxDraftBots"
            @click="playerStore.setDraftBotCount(draftBotCount + 1)"
          >
            +
          </button>
        </p>
      </div>
    </div>

    <!-- bottom buttons -->
    <div class="buttons is-centered">
      <!-- Add Player Button -->
      <p class="control">
        <button @click="addPlayer" class="button is-primary">Add Player</button>
      </p>

      <!-- Settings button -->
      <p class="control">
        <SettingsButton />
      </p>

      <!-- Done button -->
      <p class="control">
        <button @click="handleDone" class="button is-info">Done</button>
      </p>
    </div>
  </div>
</template>

<style scoped>
.bot-count__input {
  width: 4rem;
}

.selected-color {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: 2px solid #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.color-picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(40px, 1fr));
  gap: 10px;
  margin-top: 10px;
}

.color-box {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
}

.color-box.is-selected {
  border-color: #000;
}

/* Another player's color: faded and struck through so it reads as
   unavailable, while still showing which color it is */
.color-box.is-taken {
  opacity: 0.4;
  cursor: not-allowed;
  background-image: linear-gradient(
    to top right,
    transparent calc(50% - 2px),
    #fff calc(50% - 2px),
    #fff calc(50% + 2px),
    transparent calc(50% + 2px)
  );
}
</style>
