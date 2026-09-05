<!--
  PlayerSelect.vue

  Player setup form allowing users to add 1-6 players with unique names
  and colors. Blank rows are dropped when the user is done; the names that
  remain must be unique before progression is allowed.

  The roster is held in the player store as draft players, so it survives
  leaving and returning to this screen. Only the open color picker is local.

  Features:
  - Add/remove players dynamically
  - Color picker with 12 preset pastel colors
  - Name uniqueness validation
  - Notification system for validation errors

  @emits done - Array of player objects when validation passes
-->

<script setup>
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '@/stores/players'

const playerStore = usePlayerStore()

const notificationMessage = ref('')
const showNotification = ref(false)

/** Id of the draft whose color picker is open, or null. UI-only state. */
const openColorPickerId = ref(null)

/** Available pastel colors for player selection */
const availableColors = [
  '#FFC080',
  '#80FF80',
  '#8080FF',
  '#FF80C9',
  '#C980FF',
  '#80FFFF',
  '#FFFF80',
  '#FFB380',
  '#80FFD6',
  '#B380FF',
  '#FFD580',
  '#8080C0'
]

/** Colour the first row starts with, before any of the palette is taken */
const DEFAULT_FIRST_COLOR = '#FF5733'

/** The setup roster lives in the store, so it survives leaving this screen. */
const { draftPlayers: players } = storeToRefs(playerStore)

/** Keep at least one row on screen, so the form is never a dead end. */
function ensureOneRow() {
  if (players.value.length === 0) {
    playerStore.addDraftPlayer({ color: DEFAULT_FIRST_COLOR })
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

  const usedColors = players.value.map((player) => player.color)
  const nextColor = availableColors.find((color) => !usedColors.includes(color)) || '#FFFFFF'
  playerStore.addDraftPlayer({ color: nextColor })
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

// Select a color and close the picker
const selectColor = (player, color) => {
  playerStore.updateDraftPlayer(player.id, { color })
  openColorPickerId.value = null
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

// Emit events
const emit = defineEmits(['done'])

// Handle done button - validate before proceeding
const handleDone = () => {
  // Rows left blank are rows the user decided against - drop them rather than
  // making them clear each one out by hand
  playerStore.pruneEmptyDraftPlayers()

  if (players.value.length === 0) {
    ensureOneRow()
    notificationMessage.value = 'Enter at least one player name before proceeding!'
    showNotification.value = true
    return
  }

  // Check if all names are unique
  const hasDuplicateNames = players.value.some((player) => !isNameUnique(player.id, player.name))
  if (hasDuplicateNames) {
    notificationMessage.value = 'All player names must be unique!'
    showNotification.value = true
    return
  }

  // All validations passed - emit done event with player data
  emit('done', players.value)
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
            v-for="(color, colorIndex) in availableColors"
            :key="colorIndex"
            :class="['color-box', { 'is-selected': player.color === color }]"
            :style="{ backgroundColor: color }"
            @click="selectColor(player, color)"
            role="button"
            aria-label="Select this color"
            tabindex="0"
          ></div>
        </div>
      </form>
    </div>

    <!-- bottom buttons -->
    <div class="buttons is-centered">
      <!-- Add Player Button -->
      <p class="control">
        <button @click="addPlayer" class="button is-primary">Add Player</button>
      </p>

      <!-- Done button -->
      <p class="control">
        <button @click="handleDone" class="button is-info">Done</button>
      </p>
    </div>
  </div>
</template>

<style scoped>
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
</style>
