<!--
  GameTopBar.vue

  The strip across the top of the game screen — the part of the table everyone
  can see at a glance:

  - the game's name
  - the round number (one round = every player taking a turn), and during
    the two opening rounds, that they are building rounds
  - the switch between the map's Plan view (the whole region, with what each
    town produces) and Build view (zoomed in to lay track)
  - every player in turn order, with their color and cash; the player whose
    turn it is stands out, like the player holding the dice
  - a Game menu with New Game, Save, Load and Settings

  Actions that belong to the current turn (building, End Turn) are not here;
  they live in the player dock, next to the information they depend on.

  @emits new-game - The player gave up this game for a new one (and saved it
                    first, if they wanted to)
-->

<script setup>
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { onClickOutside } from '@vueuse/core'
import SaveGameDialog from '@/components/dialogs/SaveGameDialog.vue'
import LoadGameDialog from '@/components/dialogs/LoadGameDialog.vue'
import SettingsDialog from '@/components/dialogs/SettingsDialog.vue'
import NewGameDialog from '@/components/dialogs/NewGameDialog.vue'
import { usePlayerStore } from '@/stores/players'
import { useGameStore } from '@/stores/game'
import { useMapStore } from '@/stores/map'
import { formatCurrency } from '@/composables/utils'
import { gameRules } from '@/config/game'
import { BUILD_VIEW, PLAN_VIEW } from '@/composables/map/mapViews'

const emit = defineEmits(['new-game'])

const { players } = storeToRefs(usePlayerStore())
// The store counts rounds from 0; players count them from 1
const { turn, isBuildingRound } = storeToRefs(useGameStore())

const mapStore = useMapStore()
const { viewMode } = storeToRefs(mapStore)

/** The map's views, as the switch offers them */
const mapViews = [
  { view: PLAN_VIEW, label: 'Plan', icon: 'fa-map', title: 'See the whole map' },
  { view: BUILD_VIEW, label: 'Build', icon: 'fa-hammer', title: 'Zoom in to build track' }
]

// Game menu: open state, and the element whose outside clicks close it
const isMenuOpen = ref(false)
const menuRef = ref(null)
onClickOutside(menuRef, () => {
  isMenuOpen.value = false
})

// Which dialog is showing: 'new', 'save', 'load', 'settings', or null for none
const openDialogName = ref(null)

/**
 * Opens one of the game dialogs from the menu, closing the menu behind it.
 * @param {'new'|'save'|'load'|'settings'} name - The dialog to open
 */
function openDialog(name) {
  isMenuOpen.value = false
  openDialogName.value = name
}
</script>

<template>
  <header class="top-bar">
    <span class="top-bar__brand">Roaring Steel</span>

    <span class="top-bar__round">
      <template v-if="isBuildingRound">
        Building round {{ turn + 1 }} of {{ gameRules.buildingRounds }}
      </template>
      <template v-else>Round {{ turn + 1 }}</template>
    </span>

    <!-- Plan / Build: which view of the map is showing -->
    <div class="buttons has-addons mb-0 top-bar__views" role="group" aria-label="Map view">
      <button
        v-for="option in mapViews"
        :key="option.view"
        class="button is-small is-white"
        :class="viewMode === option.view ? 'is-selected has-text-weight-bold' : 'is-outlined'"
        :aria-pressed="viewMode === option.view"
        :title="option.title"
        @click="mapStore.setViewMode(option.view)"
      >
        <span class="icon"><i class="fas" :class="option.icon" aria-hidden="true"></i></span>
        <span>{{ option.label }}</span>
      </button>
    </div>

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
          class="button is-small is-white is-outlined"
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
          <a class="dropdown-item" role="menuitem" @click="openDialog('new')">New game</a>
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

  <NewGameDialog
    v-if="openDialogName === 'new'"
    @close="openDialogName = null"
    @start="emit('new-game')"
  />
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
  padding: 0.5rem 1rem;
  background: var(--bulma-primary);
  color: var(--bulma-primary-invert);
}

.top-bar__brand {
  font-family: var(--font-brand);
  font-size: 2.5rem;
  line-height: 1;
  white-space: nowrap;
  margin-block: -0.5rem; /* counter the top-bar's padding */
  margin-right: auto; /* soaks up spare space */
}

.top-bar__round {
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  opacity: 0.85;
}

/* The Plan / Build group keeps its size; the player chips give way instead.
   Its buttons are Bulma's white ghost buttons (is-white is-outlined), and the
   view showing is solid white. */
.top-bar__views {
  flex: none;
}

/* Takes the space between round and menu; chips past the edge are clipped
   rather than wrapping and growing the bar */
.top-bar__players {
  display: flex;
  gap: 0.5rem;
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
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
</style>
