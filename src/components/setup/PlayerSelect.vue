<!-- src/components/setup/PlayerSelect.vue -->
<script setup>
import { ref } from 'vue'
import { usePlayerStore } from '@/stores/players'

const players = ref([{ name: '', color: '#FF5733', showColorPicker: false }])

// Notification state
const notificationMessage = ref('')
const showNotification = ref(false)

// player store
const playerStore = usePlayerStore()

// Available colors for selection
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
  players.value.push({ name: '', color: nextColor, showColorPicker: false })
}

// Dismiss notification
const dismissNotification = () => {
  showNotification.value = false
}

// Remove a player
const removePlayer = (index) => {
  players.value.splice(index, 1)
}

// Toggle color picker visibility
const toggleColorPicker = (index) => {
  players.value.forEach((_, i) => {
    players.value[i].showColorPicker = i === index ? !players.value[i].showColorPicker : false
  })
}

// Select a color and close the picker
const selectColor = (player, color) => {
  player.color = color
  player.showColorPicker = false
}

// Validate if all player names are unique
const isNameUnique = (index, name) => {
  return players.value.every((player, i) => i === index || player.name !== name)
}
</script>

<template>
  <div id="playerSelectContainer" class="container has-background-info-dark p-5 mt-4">
    <h3 class="is-size-3 mb-2">Who is playing?</h3>

    <!-- Notification -->
    <div v-if="showNotification" class="notification is-warning">
      <button class="delete" @click="dismissNotification"></button>
      {{ notificationMessage }}
    </div>

    <!-- Player Form -->
    <div v-for="(player, index) in players" :key="index" class="block">
      <form @submit.prevent>
        <!-- Player Name and Color Picker Row -->
        <div class="field">
          <label class="label is-pulled-left mr-2">Player {{ index + 1 }}</label>
          <div class="field is-grouped">
            <!-- Player Name Input -->
            <div class="control is-expanded">
              <input
                v-model="player.name"
                :class="['input', { 'is-danger': !isNameUnique(index, player.name) }]"
                type="text"
                placeholder="Enter player name"
              />
            </div>

            <!-- Pick a Color Button -->
            <div class="control">
              <button
                class="button"
                :style="{ backgroundColor: player.color, color: '#000' }"
                @click="toggleColorPicker(index)"
              >
                Pick a Color
              </button>
            </div>

            <!-- Remove Player Button -->
            <div v-if="players.length > 1" class="control">
              <button
                class="button is-family-sans-serif is-danger is-outlined is-rounded is-small"
                @click.prevent="removePlayer(index)"
              >
                X
              </button>
            </div>
          </div>
          <p v-if="!isNameUnique(index, player.name)" class="help is-danger">
            Player name must be unique.
          </p>
        </div>

        <!-- Color Picker Grid -->
        <div v-if="player.showColorPicker" class="color-picker-grid">
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
        <button @click="emit('done')" class="button is-info">Done</button>
      </p>
    </div>
  </div>
</template>

<style scoped>
#playerSelectContainer {
  max-width: 70%;
  border-radius: 20px;
  margin-top: 15vh;
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
</style>
