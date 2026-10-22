<!--
  GameTopBar.vue

  The strip across the top of the game screen — the part of the table everyone
  can see at a glance:

  - the game's name
  - the round number (one round = every player taking a turn)
  - every player in turn order, with their colour and cash; the player whose
    turn it is stands out, like the player holding the dice
  - a Game menu with Save, Load and Settings

  Actions that belong to the current turn (building, End Turn) are not here;
  they live in the player dock, next to the information they depend on.
-->

<script setup>
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { onClickOutside } from '@vueuse/core'
import SaveGameDialog from '@/components/dialogs/SaveGameDialog.vue'
import LoadGameDialog from '@/components/dialogs/LoadGameDialog.vue'
import SettingsDialog from '@/components/dialogs/SettingsDialog.vue'
import { usePlayerStore } from '@/stores/players'
import { useGameStore } from '@/stores/game'
import { formatCurrency } from '@/composables/utils'

const { players } = storeToRefs(usePlayerStore())
// The store counts rounds from 0; players count them from 1
const { turn } = storeToRefs(useGameStore())

// Game menu: open state, and the element whose outside clicks close it
const isMenuOpen = ref(false)
const menuRef = ref(null)
onClickOutside(menuRef, () => {
  isMenuOpen.value = false
})

// Which dialog is showing: 'save', 'load', 'settings', or null for none
const openDialogName = ref(null)

/**
 * Opens one of the game dialogs from the menu, closing the menu behind it.
 * @param {'save'|'load'|'settings'} name - The dialog to open
 */
function openDialog(name) {
  isMenuOpen.value = false
  openDialogName.value = name
}
</script>

<template>
  <header class="top-bar">
    <span class="top-bar__brand">Roaring Steel</span>

    <span class="top-bar__round">Round {{ turn + 1 }}</span>

    <!-- Every player, in turn order -->
    <ol class="top-bar__players" aria-label="Players in turn order">
      <li
        v-for="player in players"
        :key="player.id"
        class="player-chip"
        :class="{ 'is-active': player.isTurn }"
        :aria-current="player.isTurn ? 'true' : undefined"
        :title="player.isTurn ? `${player.name}'s turn` : player.name"
      >
        <span class="player-chip__swatch" :style="{ backgroundColor: player.color }"></span>
        <span class="player-chip__name">{{ player.name }}</span>
        <span class="player-chip__cash">{{ formatCurrency(player.cash) }}</span>
      </li>
    </ol>

    <!-- Game menu -->
    <div ref="menuRef" class="dropdown is-right" :class="{ 'is-active': isMenuOpen }">
      <div class="dropdown-trigger">
        <button
          class="button is-small top-bar__menu-button"
          aria-haspopup="true"
          :aria-expanded="isMenuOpen"
          @click="isMenuOpen = !isMenuOpen"
        >
          <span class="icon"><i class="fas fa-bars" aria-hidden="true"></i></span>
          <span>Game</span>
        </button>
      </div>
      <div class="dropdown-menu" role="menu">
        <div class="dropdown-content">
          <a class="dropdown-item" role="menuitem" @click="openDialog('save')">Save game</a>
          <a class="dropdown-item" role="menuitem" @click="openDialog('load')">Load game</a>
          <hr class="dropdown-divider" />
          <a class="dropdown-item" role="menuitem" @click="openDialog('settings')">
            <span class="icon-text">
              <span class="icon"><i class="fas fa-gear" aria-hidden="true"></i></span>
              <span>Settings</span>
            </span>
          </a>
        </div>
      </div>
    </div>
  </header>

  <SaveGameDialog v-if="openDialogName === 'save'" @close="openDialogName = null" />
  <LoadGameDialog v-if="openDialogName === 'load'" @close="openDialogName = null" />
  <SettingsDialog v-if="openDialogName === 'settings'" @close="openDialogName = null" />
</template>

<style scoped>
.top-bar {
  /* Above the map's panes and controls (Leaflet tops out at 1000), so the
     Game menu drops down over the map rather than under it */
  position: relative;
  z-index: 1100;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.4rem 1rem;
  background: var(--bulma-primary);
  color: var(--bulma-primary-invert);
}

.top-bar__brand {
  font-family: 'Eutemia', serif;
  font-size: 1.75rem;
  line-height: 1;
  white-space: nowrap;
}

.top-bar__round {
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  opacity: 0.85;
}

/* Takes the space between round and menu; chips past the edge are clipped
   rather than wrapping and growing the bar */
.top-bar__players {
  display: flex;
  gap: 0.5rem;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  margin: 0;
  padding: 0;
  list-style: none;
}

.player-chip {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: 0 1 auto;
  min-width: 0;
  padding: 0.2rem 0.65rem;
  border: 1px solid transparent;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 0.9rem;
  white-space: nowrap;
}

/* Whose turn it is: a solid light chip that reads at a glance */
.player-chip.is-active {
  background: var(--bulma-scheme-main);
  color: var(--bulma-text-strong);
  font-weight: 700;
}

.player-chip__swatch {
  flex: none;
  width: 0.8rem;
  height: 0.8rem;
  border: 1px solid rgba(0, 0, 0, 0.35);
  border-radius: 50%;
}

.player-chip__name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.player-chip__cash {
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}

.top-bar__menu-button {
  background: transparent;
  border-color: rgba(255, 255, 255, 0.6);
  color: inherit;
}
</style>
